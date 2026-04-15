import { useState, useEffect, useCallback } from 'react'
import {
  Search, X, Mail, StickyNote, Tag, Users as UsersIcon, Loader2,
  UserCheck, UserX, Plus,
} from 'lucide-react'
import { demoFriends, getTagColor } from '../lib/demoData'
import { supabase, isSupabaseMode } from '../lib/supabase'

export default function Friends({ isTokenSet, connection }) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // all | active | blocked
  const [tagFilter, setTagFilter] = useState('')
  const [selected, setSelected] = useState(null)
  const [friends, setFriends] = useState(isTokenSet ? [] : demoFriends)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [connectionId, setConnectionId] = useState(null)

  // BYOK方式: 認証なしでアプリ状態の channelId から line_connections.id を解決し、
  // line_user_tags を取得する（anon RLSポリシー経由）
  const loadFriends = useCallback(async () => {
    if (!isTokenSet) {
      setFriends(demoFriends)
      setConnectionId(null)
      return
    }
    if (!isSupabaseMode || !supabase) {
      setFriends([])
      setError('データベース接続がありません')
      return
    }
    if (!connection?.channelId) {
      setError('LINE接続がありません。設定画面で接続してください。')
      setFriends([])
      return
    }

    setLoading(true)
    setError(null)
    try {
      // channel_id から line_connections.id を解決
      const { data: conn, error: connErr } = await supabase
        .from('line_connections')
        .select('id')
        .eq('channel_id', connection.channelId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (connErr) {
        setError(connErr.message)
        setFriends([])
        return
      }
      if (!conn) {
        setError('LINE接続情報が見つかりません。設定画面で接続テストを実行してください。')
        setFriends([])
        return
      }
      setConnectionId(conn.id)

      // line_user_tags から友だち一覧取得
      const { data, error: fetchErr } = await supabase
        .from('line_user_tags')
        .select('*')
        .eq('connection_id', conn.id)
        .order('followed_at', { ascending: false })

      if (fetchErr) {
        setError(fetchErr.message)
        setFriends([])
        return
      }
      setFriends(data || [])
    } catch (err) {
      setError(err.message || '取得エラー')
    } finally {
      setLoading(false)
    }
  }, [isTokenSet, connection?.channelId])

  useEffect(() => {
    loadFriends()
  }, [loadFriends])

  // Realtime購読（任意）: line_user_tagsの変更を即時反映
  useEffect(() => {
    if (!isTokenSet || !isSupabaseMode || !supabase || !connectionId) return
    const ch = supabase
      .channel(`line-friends-${connectionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'line_user_tags',
          filter: `connection_id=eq.${connectionId}`,
        },
        () => loadFriends(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [isTokenSet, connectionId, loadFriends])

  // ==== タグ CRUD ====
  const addTag = async (friend, newTag) => {
    const trimmed = newTag.trim()
    if (!trimmed) return
    const currentTags = friend.tags || []
    if (currentTags.includes(trimmed)) return
    const nextTags = [...currentTags, trimmed]
    // 楽観的更新
    setFriends((prev) => prev.map((f) => (f.id === friend.id ? { ...f, tags: nextTags } : f)))
    if (selected?.id === friend.id) setSelected({ ...selected, tags: nextTags })
    if (!isSupabaseMode || !supabase) return
    const { error: err } = await supabase
      .from('line_user_tags')
      .update({ tags: nextTags, updated_at: new Date().toISOString() })
      .eq('id', friend.id)
    if (err) console.warn('タグ追加エラー:', err.message)
  }

  const removeTag = async (friend, tagToRemove) => {
    const nextTags = (friend.tags || []).filter((t) => t !== tagToRemove)
    setFriends((prev) => prev.map((f) => (f.id === friend.id ? { ...f, tags: nextTags } : f)))
    if (selected?.id === friend.id) setSelected({ ...selected, tags: nextTags })
    if (!isSupabaseMode || !supabase) return
    const { error: err } = await supabase
      .from('line_user_tags')
      .update({ tags: nextTags, updated_at: new Date().toISOString() })
      .eq('id', friend.id)
    if (err) console.warn('タグ削除エラー:', err.message)
  }

  // ==== email / memo インライン保存 ====
  const updateField = async (friend, field, value) => {
    setFriends((prev) => prev.map((f) => (f.id === friend.id ? { ...f, [field]: value } : f)))
    if (selected?.id === friend.id) setSelected({ ...selected, [field]: value })
    if (!isSupabaseMode || !supabase) return
    const { error: err } = await supabase
      .from('line_user_tags')
      .update({ [field]: value || null, updated_at: new Date().toISOString() })
      .eq('id', friend.id)
    if (err) console.warn(`${field} 保存エラー:`, err.message)
  }

  // ==== フィルタリング ====
  const allTags = Array.from(new Set(friends.flatMap((f) => f.tags || [])))

  const filtered = friends.filter((f) => {
    // ステータス
    if (statusFilter === 'active' && !f.is_active) return false
    if (statusFilter === 'blocked' && f.is_active) return false
    // タグ
    if (tagFilter && !(f.tags || []).includes(tagFilter)) return false
    // 検索
    if (query) {
      const q = query.toLowerCase()
      const hay = `${f.line_user_id || f.userId || ''} ${f.email || ''} ${f.memo || ''} ${f.displayName || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  // ==== サマリー ====
  const summary = {
    total: friends.length,
    active: friends.filter((f) => (isTokenSet ? f.is_active : true)).length,
    blocked: friends.filter((f) => (isTokenSet ? !f.is_active : false)).length,
  }

  // 日時整形
  const fmtDate = (s) => {
    if (!s) return ''
    try {
      return new Date(s).toLocaleString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch {
      return s
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto" data-page="friends">
      {/* サマリーカード */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <SummaryCard icon={UsersIcon} label="友だち合計" value={summary.total} color="#06C755" />
        <SummaryCard icon={UserCheck} label="アクティブ" value={summary.active} color="#3b82f6" />
        <SummaryCard icon={UserX} label="ブロック済み" value={summary.blocked} color="#ef4444" />
      </div>

      {/* 検索・フィルタバー */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="ID / メール / メモで検索..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-500"
              data-friend-search
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-500"
            data-status-filter
          >
            <option value="all">すべて</option>
            <option value="active">友だちのみ</option>
            <option value="blocked">ブロック済み</option>
          </select>
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-500"
            data-tag-filter
            disabled={allTags.length === 0}
          >
            <option value="">すべてのタグ</option>
            {allTags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="mt-2 text-xs text-slate-500">
          {filtered.length}人 表示中
        </div>
      </div>

      {/* 読み込み中 */}
      {loading && (
        <div className="bg-white rounded-xl border border-slate-200 p-10 flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#06C755' }} />
          <div className="text-sm">友だち情報を読み込み中...</div>
        </div>
      )}

      {/* エラー */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      {/* 空状態 */}
      {!loading && !error && filtered.length === 0 && isTokenSet && (
        <div className="bg-white rounded-xl border border-slate-200 p-10 flex flex-col items-center gap-3 text-slate-500">
          <UsersIcon className="w-10 h-10 text-slate-300" />
          <div className="text-sm font-bold text-slate-700">友だちはまだいません</div>
          <div className="text-xs text-slate-500 text-center max-w-md">
            LINE公式アカウントを友だち追加したユーザーがここに表示されます。<br />
            友だち追加・ブロックはWebhook経由で自動記録されます。
          </div>
        </div>
      )}

      {/* 友だちリスト */}
      {!loading && !error && filtered.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" data-friend-list>
          {filtered.map((f) => {
            const lineUserId = f.line_user_id || f.userId
            const displayName = f.displayName || lineUserId || '不明'
            return (
              <button
                key={f.id || lineUserId}
                onClick={() => setSelected(f)}
                className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 border-b border-slate-100 last:border-0 text-left"
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0 ${
                  f.is_active === false ? 'bg-red-100 text-red-600' : 'bg-slate-200 text-slate-600'
                }`}>
                  {(displayName || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-mono text-xs text-slate-800 truncate">{lineUserId}</div>
                    {isTokenSet && (
                      f.is_active === false ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 shrink-0">🔴 ブロック</span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 shrink-0">🟢 友だち</span>
                      )
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate mt-0.5">
                    {f.email || f.memo || (isTokenSet ? `追加: ${fmtDate(f.followed_at)}` : f.statusMessage || 'ステータスなし')}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 justify-end max-w-[40%]">
                  {(f.tags || []).slice(0, 3).map((t) => (
                    <span key={t} className={`text-[10px] px-2 py-0.5 rounded-full border ${getTagColor(t)}`}>{t}</span>
                  ))}
                  {(f.tags || []).length > 3 && <span className="text-[10px] text-slate-400">+{(f.tags || []).length - 3}</span>}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* 詳細パネル */}
      {selected && (
        <FriendDetail
          friend={selected}
          onClose={() => setSelected(null)}
          onAddTag={(t) => addTag(selected, t)}
          onRemoveTag={(t) => removeTag(selected, t)}
          onUpdateField={(field, value) => updateField(selected, field, value)}
          isTokenSet={isTokenSet}
          fmtDate={fmtDate}
        />
      )}
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}15` }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] text-slate-500">{label}</div>
        <div className="text-xl font-bold text-slate-800 leading-tight">{value}<span className="text-xs font-normal text-slate-500 ml-1">人</span></div>
      </div>
    </div>
  )
}

function FriendDetail({ friend, onClose, onAddTag, onRemoveTag, onUpdateField, isTokenSet, fmtDate }) {
  const [newTag, setNewTag] = useState('')
  const [email, setEmail] = useState(friend.email || '')
  const [memo, setMemo] = useState(friend.memo || '')

  const lineUserId = friend.line_user_id || friend.userId || ''

  const handleAddTag = (e) => {
    e.preventDefault()
    if (!newTag.trim()) return
    onAddTag(newTag)
    setNewTag('')
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-40 flex justify-end" onClick={onClose}>
      <div className="bg-white w-full max-w-md h-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <h3 className="font-bold text-slate-800">友だち詳細</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="p-5 space-y-5">
          {/* プロフィール */}
          <div className="flex items-center gap-3">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold ${
              friend.is_active === false ? 'bg-red-100 text-red-600' : 'bg-slate-200 text-slate-600'
            }`}>
              {(friend.displayName || lineUserId || '?').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-slate-400 mb-0.5">LINE User ID</div>
              <div className="font-mono text-xs text-slate-800 break-all">{lineUserId}</div>
              {isTokenSet && (
                <div className="mt-1">
                  {friend.is_active === false ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700">🔴 ブロック済み</span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700">🟢 友だち</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 追加/ブロック日 */}
          {isTokenSet && (
            <div className="text-xs text-slate-500 space-y-1 bg-slate-50 rounded-lg p-3">
              <div>追加日: {fmtDate(friend.followed_at) || '-'}</div>
              {friend.unfollowed_at && <div>ブロック日: {fmtDate(friend.unfollowed_at)}</div>}
            </div>
          )}

          {/* タグ */}
          <div>
            <div className="flex items-center gap-1 text-xs font-bold text-slate-600 mb-2">
              <Tag className="w-3 h-3" /> タグ
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
              {(friend.tags || []).map((t) => (
                <span key={t} className={`text-xs px-2 py-1 rounded-full border flex items-center gap-1 ${getTagColor(t)}`}>
                  {t}
                  <button onClick={() => onRemoveTag(t)} className="hover:text-red-600">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {(friend.tags || []).length === 0 && (
                <span className="text-xs text-slate-400">タグなし</span>
              )}
            </div>
            <form onSubmit={handleAddTag} className="flex gap-2">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="新しいタグ..."
                className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-500"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg text-white text-sm font-bold flex items-center gap-1 disabled:opacity-50"
                style={{ backgroundColor: '#06C755' }}
                disabled={!newTag.trim()}
              >
                <Plus className="w-3 h-3" /> 追加
              </button>
            </form>
          </div>

          {/* メールアドレス */}
          <div>
            <div className="flex items-center gap-1 text-xs font-bold text-slate-600 mb-1.5">
              <Mail className="w-3 h-3" /> メールアドレス
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => email !== (friend.email || '') && onUpdateField('email', email)}
              placeholder="例: user@example.com"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-500"
            />
            <div className="text-[10px] text-slate-400 mt-1">フォーカスを外すと自動保存されます</div>
          </div>

          {/* メモ */}
          <div>
            <div className="flex items-center gap-1 text-xs font-bold text-slate-600 mb-1.5">
              <StickyNote className="w-3 h-3" /> メモ
            </div>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              onBlur={() => memo !== (friend.memo || '') && onUpdateField('memo', memo)}
              placeholder="この友だちに関するメモ..."
              rows={4}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-500 resize-none"
            />
          </div>

          {/* Stripe連携（表示のみ） */}
          {friend.stripe_customer_id && (
            <div className="bg-slate-50 rounded-lg p-3 text-xs">
              <div className="text-slate-500 mb-0.5">Stripe Customer ID</div>
              <div className="font-mono text-slate-800">{friend.stripe_customer_id}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
