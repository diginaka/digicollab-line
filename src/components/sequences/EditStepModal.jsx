// 各 LINE メッセージカードの編集モーダル
//
// mail/EditStepModal.jsx の LINE 版:
//   - subject カラムは LINE で使わないので、UI から外す
//   - body のみ編集 + 配信日 (day) 編集
//   - generated_step_contents を UPDATE
//   - 進行中の delivery_queue (status='pending') の同 step を見つけて
//     scheduled_at と metadata.body を best-effort で同期
//
// 将来の Phase 2 (Flex Message / 複数バブル) ではこのモーダルを拡張して
// flex_payload (JSON) も編集できるようにする。今はテキスト 1 バブルのみ。
import { useEffect, useState } from 'react'
import { Loader2, X, Save, AlertTriangle, MessageSquare } from 'lucide-react'
import { supabase, isSupabaseMode } from '../../lib/supabase'

export default function EditStepModal({
  step,
  funnelId,
  onClose,
  onSaved,
  onError,
}) {
  const initialDay =
    step?.day ??
    (step?.metadata?.delay_days != null
      ? Number(step.metadata.delay_days) + 1
      : step?.step_number ?? 1)

  const [body, setBody] = useState(step?.body ?? '')
  const [day, setDay] = useState(String(initialDay))
  const [preview, setPreview] = useState(step?.preview ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    setBody(step?.body ?? '')
    setDay(String(step?.day ?? initialDay))
    setPreview(step?.preview ?? '')
    setLocalError('')
    // step が変わった時に再初期化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id])

  const handleSave = async () => {
    setLocalError('')
    if (!isSupabaseMode || !supabase) {
      setLocalError('Supabase 接続が必要です')
      return
    }
    if (!step?.id) {
      setLocalError('編集対象のメッセージが特定できません')
      return
    }
    if (!body.trim()) {
      setLocalError('本文を入力してください')
      return
    }
    const dayNum =
      day === '' || day === null || day === undefined
        ? null
        : Number.parseInt(day, 10)
    if (dayNum !== null && (!Number.isFinite(dayNum) || dayNum < 1)) {
      setLocalError('配信日 (day) は 1 以上の整数で指定してください')
      return
    }

    setSubmitting(true)
    try {
      const { error: gscErr } = await supabase
        .from('generated_step_contents')
        .update({
          body,
          preview: preview || null,
          day: dayNum,
          updated_at: new Date().toISOString(),
        })
        .eq('id', step.id)
      if (gscErr) throw gscErr

      // 自動配信中 (delivery_method='auto') の場合は delivery_queue 側の
      // metadata も best-effort で同期させる。失敗しても致命的ではない。
      if (step.delivery_method === 'auto' && funnelId) {
        try {
          const { data: queueRows } = await supabase
            .from('delivery_queue')
            .select('id, metadata, scheduled_at, content_id')
            .eq('funnel_id', funnelId)
            .eq('channel', 'line')
            .eq('status', 'pending')
            .or(`content_id.eq.${step.id},step_number.eq.${step.step_number}`)
          for (const q of queueRows || []) {
            const newMeta = { ...(q.metadata || {}), body_preview: body.slice(0, 60) }
            await supabase
              .from('delivery_queue')
              .update({ metadata: newMeta })
              .eq('id', q.id)
          }
        } catch (warn) {
          console.warn('[EditStepModal/line] delivery_queue 同期失敗:', warn?.message)
        }
      }

      onSaved?.({
        stepId: step.id,
        stepNumber: step.step_number,
      })
      onClose?.()
    } catch (err) {
      const msg = err?.message || '保存に失敗しました'
      setLocalError(msg)
      onError?.(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <MessageSquare className="w-4 h-4" style={{ color: '#06C755' }} />
            LINE メッセージ編集（{step?.step_number ?? '-'}通目）
          </h3>
          <button
            onClick={onClose}
            disabled={submitting}
            className="text-slate-400 hover:text-slate-600 disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              プレビューテキスト（任意）
              <span className="ml-1 text-[10px] text-slate-400 font-normal">
                一覧に表示される短文。空欄なら本文先頭が使われます。
              </span>
            </label>
            <input
              type="text"
              value={preview}
              onChange={(e) => setPreview(e.target.value)}
              disabled={submitting}
              maxLength={200}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-500 disabled:opacity-50"
              data-edit-preview
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              配信日（day）
              <span className="ml-1 text-[10px] text-slate-400 font-normal">
                友だち追加から何日後に送信するか（1=即時, 2=翌日…）
              </span>
            </label>
            <input
              type="number"
              min="1"
              step="1"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              disabled={submitting}
              className="w-32 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-500 disabled:opacity-50"
              data-edit-day
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              本文 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={submitting}
              rows={12}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-sans focus:outline-none focus:border-green-500 disabled:opacity-50 leading-relaxed"
              placeholder="LINE メッセージ本文..."
              data-edit-body
            />
            <div className="mt-1 text-[11px] text-slate-400">
              ※ 改行は LINE 表示でもそのまま反映されます。{' '}
              {String.fromCharCode(123, 123)}name{String.fromCharCode(125, 125)} は配信時に受信者名に置換されます (n8n 側で対応)
            </div>
          </div>

          {/* Phase 2 で複数バブル / Flex Message 対応予定の余白 */}
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-[11px] text-slate-500 leading-relaxed">
            複数バブル送信 (テキスト + 画像 + ボタンカード等) は Phase 2 で対応予定です。
            現在は 1 ステップ = 1 テキストバブルとして扱います。
          </div>
        </div>

        {localError && (
          <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>{localError}</div>
          </div>
        )}

        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={submitting}
            className="flex-1 px-4 py-2 text-white rounded-lg text-sm font-bold hover:opacity-90 flex items-center justify-center gap-2 disabled:opacity-40"
            style={{ backgroundColor: '#06C755' }}
            data-edit-save
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                保存
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
