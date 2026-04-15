import { useState, useEffect } from 'react'
import { Send, Calendar, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { demoBroadcasts, demoFriends, getTagColor, demoStats } from '../lib/demoData'
import { sendBroadcast, sendMulticast, getFollowers, getMessageQuota, getMessageQuotaConsumption } from '../lib/lineProxy'
import { supabase, isSupabaseMode, resolveConnectionId } from '../lib/supabase'

export default function Broadcasts({ isTokenSet, connection }) {
  const [selectedTags, setSelectedTags] = useState([])
  const [message, setMessage] = useState('今月限定のお得なキャンペーンのご案内です🎉\n本日よりスタート！')
  const [sendMode, setSendMode] = useState('now')
  const [scheduledAt, setScheduledAt] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState(null)

  const [broadcasts, setBroadcasts] = useState(isTokenSet ? [] : demoBroadcasts)
  const [quota, setQuota] = useState({ totalUsage: demoStats.sentThisMonth, limit: demoStats.quota })

  // 配信履歴 + クォータ取得
  useEffect(() => {
    if (!isTokenSet) {
      setBroadcasts(demoBroadcasts)
      setQuota({ totalUsage: demoStats.sentThisMonth, limit: demoStats.quota })
      return
    }
    let cancelled = false
    ;(async () => {
      // Supabaseから配信履歴取得（channel_idから解決）
      if (isSupabaseMode && supabase && connection.channelId) {
        try {
          const connId = await resolveConnectionId(connection.channelId)
          if (cancelled) return
          const query = supabase
            .from('line_broadcasts')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20)
          const { data } = connId
            ? await query.eq('connection_id', connId)
            : await query
          if (!cancelled && data) {
            setBroadcasts(
              data.map((b) => ({
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
          }
        } catch {}
      }
      // クォータ取得（LINE API）
      try {
        const [q, c] = await Promise.all([
          getMessageQuota(connection.channelAccessToken),
          getMessageQuotaConsumption(connection.channelAccessToken),
        ])
        if (cancelled) return
        const limit = q.success ? Number(q.data?.value || 0) : demoStats.quota
        const used = c.success ? Number(c.data?.totalUsage || 0) : 0
        setQuota({ limit, totalUsage: used })
      } catch {}
    })()
    return () => {
      cancelled = true
    }
  }, [isTokenSet, connection.channelAccessToken])

  const allTags = isTokenSet
    ? [] // 実データモードではタグは現状なし（今後対応）
    : Array.from(new Set(demoFriends.flatMap((f) => f.tags)))

  const targetCount = isTokenSet
    ? null
    : demoFriends.filter((f) => !selectedTags.length || f.tags.some((t) => selectedTags.includes(t))).length

  const remaining = Math.max(0, quota.limit - quota.totalUsage)
  const percent = quota.limit > 0 ? (quota.totalUsage / quota.limit) * 100 : 0

  const toggleTag = (t) => {
    setSelectedTags(selectedTags.includes(t) ? selectedTags.filter((x) => x !== t) : [...selectedTags, t])
  }

  const handleSend = async () => {
    if (!message.trim()) {
      setSendResult({ ok: false, message: 'メッセージを入力してください' })
      return
    }
    if (!isTokenSet) {
      setSendResult({ ok: false, message: 'LINEに接続してから配信してください' })
      return
    }

    setSending(true)
    setSendResult(null)
    try {
      if (sendMode === 'schedule') {
        // 予約配信: Supabaseに保存（BYOK方式: channelIdから解決）
        if (isSupabaseMode && supabase) {
          const connId = await resolveConnectionId(connection.channelId)
          const { error } = await supabase.from('line_broadcasts').insert({
            connection_id: connId,
            name: `配信 ${new Date().toLocaleString('ja-JP')}`,
            target_tags: selectedTags,
            message_content: message,
            status: 'scheduled',
            scheduled_at: scheduledAt || null,
          })
          if (error) throw new Error(error.message)
          setSendResult({ ok: true, message: '予約配信を登録しました' })
        } else {
          setSendResult({ ok: false, message: '予約配信にはDB接続が必要です' })
        }
      } else {
        // 今すぐ配信: LINE API直接
        const messages = [{ type: 'text', text: message }]
        let result
        if (selectedTags.length === 0) {
          // 全員にブロードキャスト
          result = await sendBroadcast(connection.channelAccessToken, messages)
        } else {
          // タグ絞り込み: 実データモードではタグ管理は未実装のためフォロワー全員取得
          const idsResult = await getFollowers(connection.channelAccessToken)
          const userIds = idsResult.success ? idsResult.data?.userIds || [] : []
          if (userIds.length === 0) {
            setSendResult({ ok: false, message: '配信対象の友だちがいません' })
            setSending(false)
            return
          }
          result = await sendMulticast(connection.channelAccessToken, userIds.slice(0, 500), messages)
        }
        if (result.success) {
          setSendResult({ ok: true, message: '配信を送信しました' })
          // Supabase履歴に記録（BYOK方式: channelIdから解決）
          if (isSupabaseMode && supabase) {
            const connId = await resolveConnectionId(connection.channelId)
            await supabase.from('line_broadcasts').insert({
              connection_id: connId,
              name: `配信 ${new Date().toLocaleString('ja-JP')}`,
              target_tags: selectedTags,
              message_content: message,
              status: 'sent',
              sent_at: new Date().toISOString(),
            })
          }
        } else {
          setSendResult({ ok: false, message: result.error || '配信に失敗しました' })
        }
      }
    } catch (err) {
      setSendResult({ ok: false, message: err.message || '配信エラー' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto" data-page="broadcasts">
      {/* 残数バー */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-bold text-slate-700">LINEメッセージ配信枠</div>
          <div className="text-sm text-slate-600">
            {quota.totalUsage} / {quota.limit}通 (残り{remaining}通)
          </div>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full transition-all" style={{ width: `${Math.min(100, percent)}%`, backgroundColor: percent > 80 ? '#ef4444' : '#06C755' }} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 配信作成 */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5" data-broadcast-create>
          <h3 className="font-bold text-slate-800 mb-4">新しい配信を作成</h3>

          {isTokenSet && allTags.length === 0 ? (
            <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
              現在は全友だちへのブロードキャスト配信のみサポートしています。タグ絞り込みは今後対応予定です。
            </div>
          ) : (
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-600 mb-2">対象タグ</label>
              <div className="flex flex-wrap gap-2">
                {allTags.map((t) => (
                  <button
                    key={t}
                    onClick={() => toggleTag(t)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition ${
                      selectedTags.includes(t) ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {targetCount !== null && (
                <div className="text-xs text-slate-500 mt-2">対象: 約{targetCount}人</div>
              )}
            </div>
          )}

          <div className="mb-4">
            <label className="block text-xs font-bold text-slate-600 mb-2">メッセージ本文</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-500 resize-none"
            />
            <div className="text-xs text-slate-400 mt-1">{message.length}/500文字</div>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-bold text-slate-600 mb-2">配信タイミング</label>
            <div className="flex gap-2">
              <button
                onClick={() => setSendMode('now')}
                className={`flex-1 py-2 rounded-lg text-sm border transition ${
                  sendMode === 'now' ? 'border-green-500 bg-green-50 text-green-700 font-bold' : 'border-slate-200 text-slate-600'
                }`}
              >
                今すぐ配信
              </button>
              <button
                onClick={() => setSendMode('schedule')}
                className={`flex-1 py-2 rounded-lg text-sm border transition ${
                  sendMode === 'schedule' ? 'border-green-500 bg-green-50 text-green-700 font-bold' : 'border-slate-200 text-slate-600'
                }`}
              >
                予約配信
              </button>
            </div>
            {sendMode === 'schedule' && (
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="mt-2 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            )}
          </div>

          <button
            onClick={handleSend}
            disabled={sending || !isTokenSet}
            className="w-full py-3 rounded-lg text-white font-bold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#06C755' }}
          >
            {sending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> 送信中...</>
            ) : sendMode === 'now' ? (
              <><Send className="w-4 h-4" /> 今すぐ配信する</>
            ) : (
              <><Calendar className="w-4 h-4" /> 予約を登録</>
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
              <div className="w-8 h-8 rounded-full bg-white/80 shrink-0" />
              <div>
                <div className="text-[10px] text-white/90 mb-1 ml-1">{connection.botName || 'あなたの公式アカウント'}</div>
                <div className="line-bubble">{message || 'メッセージ本文がここに表示されます'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 配信履歴 */}
      <div className="mt-6 bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-bold text-slate-800 mb-3">配信履歴</h3>
        {broadcasts.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-400">
            配信履歴はまだありません
          </div>
        ) : (
          <div className="space-y-2">
            {broadcasts.map((b) => (
              <div key={b.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 border border-slate-100">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-800 truncate">{b.name}</div>
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
    </div>
  )
}
