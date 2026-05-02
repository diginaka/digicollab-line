import { useState, useEffect, useCallback } from 'react'
import {
  Send, Loader2, CheckCircle2, AlertCircle, Users, Tag as TagIcon,
  CheckSquare, Square, X, Info,
} from 'lucide-react'
import { demoBroadcasts, demoFriends, getTagColor, demoStats } from '../lib/demoData'
import { sendBroadcastViaProxy, getMessageQuota, getMessageQuotaConsumption } from '../lib/lineProxy'
import { supabase, isSupabaseMode, resolveConnectionId } from '../lib/supabase'

const LINE_TEXT_LIMIT = 5000
const MULTICAST_LIMIT = 500

export default function Broadcasts({ isTokenSet, connection }) {
  // メッセージ + 設定
  const [message, setMessage] = useState('')
  const [mode, setMode] = useState('broadcast') // 'broadcast' | 'tag' | 'individual'
  const [selectedTags, setSelectedTags] = useState([]) // タグモードの複数選択
  const [selectedIds, setSelectedIds] = useState([]) // individual時のline_user_id配列

  // データ
  const [connectionId, setConnectionId] = useState(null)
  const [friends, setFriends] = useState([])
  const [broadcasts, setBroadcasts] = useState(isTokenSet ? [] : demoBroadcasts)
  const [quota, setQuota] = useState({ totalUsage: 0, limit: 0 })
  const [localLogs, setLocalLogs] = useState([]) // 今セッションの送信ログ

  // UI状態
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // ========== データロード ==========
  const loadData = useCallback(async () => {
    if (!isTokenSet) {
      setBroadcasts(demoBroadcasts)
      setFriends(demoFriends.map((f) => ({ ...f, line_user_id: f.userId, is_active: true })))
      setQuota({ totalUsage: demoStats.sentThisMonth, limit: demoStats.quota })
      return
    }
    if (!isSupabaseMode || !supabase || !connection?.channelId) {
      setError('LINE接続がありません。設定画面で接続してください。')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const connId = await resolveConnectionId(connection.channelId)
      if (!connId) {
        setError('LINE接続情報が見つかりません。設定画面で接続テストを実行してください。')
        return
      }
      setConnectionId(connId)

      // 友だち一覧
      const { data: friendData } = await supabase
        .from('line_user_tags')
        .select('id, line_user_id, tags, email, memo, is_active')
        .eq('connection_id', connId)
        .eq('is_active', true)
        .order('followed_at', { ascending: false })
      setFriends(friendData || [])

      // 配信履歴
      const { data: histData } = await supabase
        .from('line_broadcasts')
        .select('*')
        .eq('connection_id', connId)
        .order('created_at', { ascending: false })
        .limit(20)
      setBroadcasts(
        (histData || []).map((b) => ({
          id: b.id,
          name: b.name,
          targetTags: b.target_tags || [],
          messageContent: b.message_content,
          status: b.status,
          scheduledAt: b.scheduled_at,
          sentAt: b.sent_at,
          totalSent: b.total_sent || 0,
        })),
      )
    } catch (err) {
      setError(err.message || 'データ取得エラー')
    } finally {
      setLoading(false)
    }
  }, [isTokenSet, connection?.channelId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // クォータ（LINE API、別経路）
  useEffect(() => {
    if (!isTokenSet || !connection?.channelAccessToken) {
      setQuota({ totalUsage: demoStats.sentThisMonth, limit: demoStats.quota })
      return
    }
    ;(async () => {
      try {
        const [q, c] = await Promise.all([
          getMessageQuota(connection.channelAccessToken),
          getMessageQuotaConsumption(connection.channelAccessToken),
        ])
        const limit = q.success ? Number(q.data?.value || 0) : 0
        const used = c.success ? Number(c.data?.totalUsage || 0) : 0
        setQuota({ limit, totalUsage: used })
      } catch {}
    })()
  }, [isTokenSet, connection?.channelAccessToken])

  // ========== 派生値 ==========
  const allTags = Array.from(new Set(friends.flatMap((f) => f.tags || [])))

  const recipientIds = (() => {
    if (mode === 'broadcast') return null // 全員
    if (mode === 'tag' && selectedTags.length > 0) {
      // 選択タグのいずれかを持つ友だち（OR条件）
      return friends
        .filter((f) => (f.tags || []).some((t) => selectedTags.includes(t)))
        .map((f) => f.line_user_id)
    }
    if (mode === 'individual') return selectedIds
    return []
  })()

  const toggleTag = (tag) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  const targetCount = mode === 'broadcast' ? friends.length : (recipientIds?.length || 0)
  const remaining = Math.max(0, quota.limit - quota.totalUsage)
  const quotaPercent = quota.limit > 0 ? (quota.totalUsage / quota.limit) * 100 : 0

  const toggleIndividual = (lineUserId) => {
    setSelectedIds((prev) =>
      prev.includes(lineUserId) ? prev.filter((id) => id !== lineUserId) : [...prev, lineUserId]
    )
  }

  const selectAllFriends = () => setSelectedIds(friends.map((f) => f.line_user_id))
  const clearSelection = () => setSelectedIds([])

  // ========== 送信バリデーション ==========
  const validate = () => {
    if (!message.trim()) return 'メッセージを入力してください'
    if (message.length > LINE_TEXT_LIMIT) return `メッセージは${LINE_TEXT_LIMIT}文字以内にしてください`
    if (!isTokenSet) return 'LINEに接続してから配信してください'
    if (!connectionId) return 'LINE接続情報が見つかりません'
    if (mode !== 'broadcast') {
      if (!recipientIds || recipientIds.length === 0) {
        return mode === 'tag' ? 'タグを選択するか対象がいることを確認してください' : '送信先を1人以上選択してください'
      }
      if (recipientIds.length > MULTICAST_LIMIT) {
        return `一度に送信できるのは${MULTICAST_LIMIT}人までです。さらに絞り込んでください。`
      }
    }
    return null
  }

  // ========== 確認ダイアログ → 送信 ==========
  const openConfirm = () => {
    setSendResult(null)
    const err = validate()
    if (err) {
      setSendResult({ ok: false, message: err })
      return
    }
    setConfirmOpen(true)
  }

  const doSend = async () => {
    setConfirmOpen(false)
    setSending(true)
    setSendResult(null)
    try {
      const result = await sendBroadcastViaProxy({
        connectionId,
        message,
        broadcast: mode === 'broadcast',
        recipients: mode === 'broadcast' ? undefined : recipientIds,
      })

      if (result.status === 'sent') {
        const countLabel =
          result.type === 'broadcast' || mode === 'broadcast'
            ? '全友だち'
            : `${result.recipientCount || recipientIds.length}人`
        setSendResult({ ok: true, message: `${countLabel}に送信しました！` })

        // Supabase履歴に記録
        if (isSupabaseMode && supabase && connectionId) {
          try {
            await supabase.from('line_broadcasts').insert({
              connection_id: connectionId,
              name: `配信 ${new Date().toLocaleString('ja-JP')}`,
              target_tags: mode === 'tag' ? selectedTags : [],
              message_content: message,
              status: 'sent',
              sent_at: new Date().toISOString(),
              total_sent:
                typeof result.recipientCount === 'number'
                  ? result.recipientCount
                  : mode === 'broadcast'
                    ? friends.length
                    : recipientIds.length,
            })
          } catch {}
          loadData()
        }

        // ローカルログ
        setLocalLogs((prev) => [
          {
            id: Date.now(),
            sent_at: new Date().toISOString(),
            type: result.type || (mode === 'broadcast' ? 'broadcast' : 'multicast'),
            recipientCount: result.recipientCount || targetCount,
            message: message.length > 50 ? message.slice(0, 50) + '...' : message,
            status: 'sent',
          },
          ...prev,
        ])

        // 入力クリア
        setMessage('')
        setSelectedIds([])
      } else {
        setSendResult({ ok: false, message: `送信失敗: ${result.error || '不明なエラー'}` })
      }
    } catch (err) {
      setSendResult({ ok: false, message: `通信エラー: ${err.message || err}` })
    } finally {
      setSending(false)
    }
  }

  // ========== レンダリング ==========
  return (
    <div className="p-6 max-w-7xl mx-auto" data-page="broadcasts">
      {/* エラー */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 mb-4">{error}</div>
      )}

      {/* クォータバー */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-bold text-slate-700">LINEメッセージ配信枠</div>
          <div className="text-sm text-slate-600">
            {quota.totalUsage} / {quota.limit || '-'}通 (残り{remaining}通)
          </div>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full transition-all"
            style={{
              width: `${Math.min(100, quotaPercent)}%`,
              backgroundColor: quotaPercent > 80 ? '#ef4444' : '#06C755',
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 配信作成 */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5" data-broadcast-create>
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Send className="w-4 h-4" style={{ color: '#06C755' }} /> 新しい配信を作成
          </h3>

          {/* 配信モード */}
          <div className="mb-4">
            <label className="block text-xs font-bold text-slate-600 mb-2">配信対象</label>
            <div className="space-y-2">
              <ModeRadio
                checked={mode === 'broadcast'}
                onChange={() => setMode('broadcast')}
                icon={Users}
                color="#3b82f6"
                label="全友だちに配信"
                desc={`Broadcast API・対象${friends.length}人`}
              />
              <ModeRadio
                checked={mode === 'tag'}
                onChange={() => setMode('tag')}
                icon={TagIcon}
                color="#06C755"
                label="タグで絞り込み配信"
                desc="Multicast API・タグを持つ友だちのみ"
                disabled={allTags.length === 0}
              />
              {mode === 'tag' && (
                <div className="ml-7">
                  {allTags.length === 0 ? (
                    <div className="text-xs text-slate-400">タグ付きの友だちがいません</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {allTags.map((t) => {
                        const active = selectedTags.includes(t)
                        const count = friends.filter((f) => (f.tags || []).includes(t)).length
                        return (
                          <button
                            key={t}
                            onClick={() => toggleTag(t)}
                            className={`text-xs px-3 py-1.5 rounded-full border transition ${
                              active
                                ? 'bg-green-500 text-white border-green-500'
                                : 'bg-white text-slate-700 border-slate-300 hover:border-green-500'
                            }`}
                          >
                            {t} <span className="opacity-70">({count})</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {selectedTags.length > 0 && (
                    <div className="text-[11px] text-slate-500 mt-1.5">
                      {selectedTags.length}個のタグを選択中 / 選択タグのいずれかを持つ友だちが対象
                    </div>
                  )}
                </div>
              )}
              <ModeRadio
                checked={mode === 'individual'}
                onChange={() => setMode('individual')}
                icon={CheckSquare}
                color="#f59e0b"
                label="個別選択配信"
                desc="Multicast API・チェックで選択"
              />
              {mode === 'individual' && (
                <div className="ml-7 border border-slate-200 rounded-lg p-3 bg-slate-50">
                  <div className="flex items-center justify-between mb-2 text-xs">
                    <div className="text-slate-600">
                      {selectedIds.length}人 / {friends.length}人選択中
                    </div>
                    <div className="flex gap-2">
                      <button onClick={selectAllFriends} className="text-blue-600 hover:underline">全選択</button>
                      <button onClick={clearSelection} className="text-slate-500 hover:underline">クリア</button>
                    </div>
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {friends.length === 0 && (
                      <div className="text-xs text-slate-400 text-center py-4">友だちがいません</div>
                    )}
                    {friends.map((f) => {
                      const checked = selectedIds.includes(f.line_user_id)
                      return (
                        <label
                          key={f.id || f.line_user_id}
                          className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white cursor-pointer text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleIndividual(f.line_user_id)}
                            className="w-3 h-3"
                          />
                          <span className="font-mono text-slate-700 truncate flex-1">
                            {f.line_user_id}
                          </span>
                          {f.email && <span className="text-slate-500 truncate max-w-[100px]">{f.email}</span>}
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="text-xs text-slate-500 mt-2 flex items-center gap-1">
              <Info className="w-3 h-3" /> 配信予定: <strong>{mode === 'broadcast' ? `全友だち（${friends.length}人）` : `${targetCount}人`}</strong>
              {mode !== 'broadcast' && targetCount > MULTICAST_LIMIT && (
                <span className="text-red-600 ml-2">※ {MULTICAST_LIMIT}人を超えています</span>
              )}
            </div>
          </div>

          {/* メッセージ */}
          <div className="mb-4">
            <label className="block text-xs font-bold text-slate-600 mb-2">メッセージ本文</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              placeholder="送信するメッセージを入力..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-500 resize-none"
            />
            <div className={`text-xs mt-1 ${message.length > LINE_TEXT_LIMIT ? 'text-red-600' : 'text-slate-400'}`}>
              {message.length}/{LINE_TEXT_LIMIT.toLocaleString()}文字
            </div>
          </div>

          {/* 送信ボタン */}
          <button
            onClick={openConfirm}
            disabled={sending || !isTokenSet}
            className="w-full py-3 rounded-lg text-white font-bold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#06C755' }}
          >
            {sending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> 送信中...</>
            ) : (
              <><Send className="w-4 h-4" /> 送信する</>
            )}
          </button>

          {!isTokenSet && (
            <div className="text-xs text-slate-400 text-center mt-2">
              配信するにはLINE接続が必要です（設定画面）
            </div>
          )}

          {sendResult && (
            <div className={`mt-3 p-3 rounded-lg text-sm flex items-start gap-2 ${
              sendResult.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {sendResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
              {sendResult.message}
            </div>
          )}
        </div>

        {/* LINEプレビュー */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-bold text-slate-800 mb-4 text-sm">プレビュー</h3>
          <div className="line-chat-bg rounded-xl p-4 min-h-[300px]">
            <div className="flex gap-2 items-start">
              {connection?.botIconUrl ? (
                <img src={connection.botIconUrl} alt="" className="w-8 h-8 rounded-full shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-white/80 shrink-0" />
              )}
              <div>
                <div className="text-[10px] text-white/90 mb-1 ml-1">
                  {connection?.botName || 'あなたの公式アカウント'}
                </div>
                <div className="line-bubble">
                  {message || 'メッセージ本文がここに表示されます'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 配信履歴 */}
      <div className="mt-6 bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-bold text-slate-800 mb-3">配信履歴</h3>

        {localLogs.length > 0 && (
          <div className="mb-3 space-y-1">
            {localLogs.map((l) => (
              <div key={l.id} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-green-50 border border-green-200">
                <CheckCircle2 className="w-3 h-3 text-green-600 shrink-0" />
                <span className="text-slate-700 truncate flex-1">{l.message}</span>
                <span className="text-slate-500 shrink-0">
                  {l.type === 'broadcast' ? '全員' : `${l.recipientCount}人`}
                </span>
                <span className="text-slate-400 shrink-0">
                  {new Date(l.sent_at).toLocaleTimeString('ja-JP')}
                </span>
              </div>
            ))}
          </div>
        )}

        {broadcasts.length === 0 && localLogs.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-400">配信履歴はまだありません</div>
        ) : (
          <div className="space-y-2">
            {broadcasts.map((b) => (
              <div key={b.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 border border-slate-100">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-800 truncate">{b.name}</div>
                  <div className="text-xs text-slate-500 truncate mt-0.5">{b.messageContent}</div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {(b.targetTags || []).map((t) => (
                      <span key={t} className={`text-[10px] px-2 py-0.5 rounded-full border ${getTagColor(t)}`}>{t}</span>
                    ))}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <div className="text-xs text-slate-500">{b.sentAt || b.scheduledAt}</div>
                  <div className="flex items-center gap-2 mt-1 justify-end">
                    <span className="text-xs text-slate-600">{b.totalSent}人</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                      b.status === 'sent' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {b.status === 'sent' ? '配信済' : '予約中'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 送信確認ダイアログ */}
      {confirmOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setConfirmOpen(false)}>
          <div className="bg-white rounded-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <Send className="w-5 h-5" style={{ color: '#06C755' }} /> 一斉配信の確認
              </h3>
              <button onClick={() => setConfirmOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="space-y-3 mb-5">
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-xs font-bold text-slate-600 mb-1">対象</div>
                <div className="text-sm text-slate-800">
                  {mode === 'broadcast'
                    ? `全友だち（${friends.length}人）`
                    : mode === 'tag'
                      ? `タグ「${selectedTags.join(', ')}」に一致（${targetCount}人）`
                      : `個別選択（${targetCount}人）`}
                </div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-xs font-bold text-slate-600 mb-1">メッセージ</div>
                <div className="text-sm text-slate-800 whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {message}
                </div>
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-800 mb-4 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>送信すると取り消しできません。内容に問題がないかご確認ください。</div>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50"
              >
                キャンセル
              </button>
              <button
                onClick={doSend}
                className="px-5 py-2 text-white rounded-lg text-sm font-bold hover:opacity-90 flex items-center gap-1.5"
                style={{ backgroundColor: '#06C755' }}
              >
                <Send className="w-4 h-4" /> 送信する
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="fixed bottom-4 right-4 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600 flex items-center gap-2 shadow">
          <Loader2 className="w-3 h-3 animate-spin" /> 読み込み中...
        </div>
      )}
    </div>
  )
}

function ModeRadio({ checked, onChange, icon: Icon, color, label, desc, disabled }) {
  return (
    <label
      className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition ${
        checked ? 'border-green-500 bg-green-50' : 'border-slate-200 hover:border-slate-300'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="w-4 h-4 shrink-0"
      />
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}15` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-slate-800">{label}</div>
        <div className="text-[10px] text-slate-500">{desc}</div>
      </div>
    </label>
  )
}
