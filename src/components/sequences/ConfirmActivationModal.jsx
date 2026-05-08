// LINE 自動配信「有効化」モーダル
//
// mail/ConfirmActivationModal.jsx の LINE 版:
//   - 各ステップの day (= 配信遅延日数) を編集
//   - 「有効化」押下で:
//     1. generated_step_contents.day を UPDATE
//     2. useLineAutoDeliverySetup.setupAutoDelivery を呼んで delivery_queue に INSERT
//
// props:
//   funnelId         : 必須
//   contents         : generated_step_contents の rows (channel='line')
//   activeSteps      : Map<step_number, generated_step_contents row> (既存 active 値の初期化用)
//   defaultLineUserId: 配信先 LINE userId の初期値
//   onClose, onSuccess({ upsertedCount }), onError(message)
import { useMemo, useState } from 'react'
import { Loader2, X, Zap, RotateCcw, AlertTriangle, Smartphone, Calendar } from 'lucide-react'
import { supabase, isSupabaseMode } from '../../lib/supabase'
import { useLineAutoDeliverySetup } from '../../hooks/useLineAutoDeliverySetup'

const LINE_USER_ID_RE = /^U[0-9a-f]{32}$/i

const DEFAULT_DAYS = {
  1: 1,
  2: 2,
  3: 4,
  4: 6,
  5: 8,
}

function resolveDayFromContent(content) {
  if (content.day != null) return Number(content.day)
  const delay = content.metadata?.delay_days
  if (delay != null) return Number(delay) + 1
  return content.step_number ?? 1
}

export default function ConfirmActivationModal({
  funnelId,
  contents,
  activeSteps,
  defaultLineUserId = '',
  onClose,
  onSuccess,
  onError,
}) {
  const isReactivation = activeSteps && activeSteps.size > 0

  const initialDays = useMemo(() => {
    const map = {}
    for (const step of contents || []) {
      const existing = activeSteps?.get(step.step_number)
      map[step.step_number] = existing?.day ?? resolveDayFromContent(step)
    }
    return map
  }, [contents, activeSteps])

  const [days, setDays] = useState(initialDays)
  const [recipientLineId, setRecipientLineId] = useState(defaultLineUserId)
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    d.setMinutes(d.getMinutes() + 5)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  })

  const { setupAutoDelivery, running } = useLineAutoDeliverySetup()
  const [localError, setLocalError] = useState('')

  const isValidLineId = LINE_USER_ID_RE.test(recipientLineId.trim())

  const handleDayChange = (stepNumber, raw) => {
    const n = parseInt(raw, 10)
    setDays((d) => ({
      ...d,
      [stepNumber]: Number.isFinite(n) && n >= 1 ? n : 1,
    }))
  }

  const resetDefaults = () => {
    const map = {}
    for (const step of contents || []) {
      map[step.step_number] = DEFAULT_DAYS[step.step_number] ?? step.step_number
    }
    setDays(map)
  }

  const handleConfirm = async () => {
    setLocalError('')
    if (!isSupabaseMode || !supabase) {
      setLocalError('Supabase 接続が必要です')
      return
    }
    if (!funnelId) {
      setLocalError('funnel_id がありません')
      return
    }
    if (!contents || contents.length === 0) {
      setLocalError('登録するメッセージがありません')
      return
    }
    if (!isValidLineId) {
      setLocalError('配信先 LINE userId が正しくありません')
      return
    }
    if (!startDate) {
      setLocalError('配信開始日時を指定してください')
      return
    }

    try {
      // 1. 各ステップの day を UPDATE
      const updates = contents.map((step) =>
        supabase
          .from('generated_step_contents')
          .update({
            day: days[step.step_number] ?? resolveDayFromContent(step),
            updated_at: new Date().toISOString(),
          })
          .eq('id', step.id),
      )
      const updateResults = await Promise.all(updates)
      const firstUpdateError = updateResults.find((r) => r.error)?.error
      if (firstUpdateError) throw firstUpdateError

      // 2. UPDATE 済みの最新値で contents を再構築 (day を上書き)
      const refreshedContents = contents.map((step) => ({
        ...step,
        day: days[step.step_number] ?? resolveDayFromContent(step),
      }))

      // 3. delivery_queue 投入
      const isoStart = new Date(startDate).toISOString()
      const result = await setupAutoDelivery({
        funnelId,
        contents: refreshedContents,
        recipientLineId: recipientLineId.trim(),
        startAt: isoStart,
      })

      onSuccess?.({
        upsertedCount: result?.successCount ?? refreshedContents.length,
      })
      onClose?.()
    } catch (err) {
      const msg = err?.message || '自動配信の有効化に失敗しました'
      setLocalError(msg)
      onError?.(msg)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Zap className="w-4 h-4" style={{ color: '#06C755' }} />
            {isReactivation ? '自動配信の設定を更新' : '自動配信を有効化する'}
          </h3>
          <button
            onClick={onClose}
            disabled={running}
            className="text-slate-400 hover:text-slate-600 disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div
          className={`mb-4 p-3 rounded-lg border text-xs ${
            isReactivation
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          {isReactivation
            ? '現在の自動配信を新しい内容で上書きします。配信キューを再構築するため、未送信分のスケジュールが変わります。'
            : '友だち追加した方に、このシーケンスを LINE で自動配信します。1通目は配信開始日時に、2通目以降は day 設定の差分で送信されます。'}
        </div>

        {/* 配信先 LINE userId (Phase 1: 単一 userId のみ) */}
        <div className="mb-3">
          <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5" />
            配信先 LINE userId（Phase 1: テスト用 単一）
          </label>
          <input
            type="text"
            value={recipientLineId}
            onChange={(e) => setRecipientLineId(e.target.value)}
            disabled={running}
            placeholder="U3245bf90258ccfae3b6ea2f43dfe390b"
            className={`w-full px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none disabled:opacity-50 ${
              recipientLineId && !isValidLineId
                ? 'border-red-300'
                : 'border-slate-200 focus:border-green-500'
            }`}
          />
          {recipientLineId && !isValidLineId && (
            <div className="mt-1 text-[11px] text-red-600">
              LINE userId は "U" + 32 文字の英数字
            </div>
          )}
        </div>

        <div className="mb-3">
          <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            配信開始日時（1通目）
          </label>
          <input
            type="datetime-local"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={running}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-500 disabled:opacity-50"
          />
        </div>

        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs font-bold text-slate-700">
              ステップ別の配信日（day）
            </div>
            <button
              onClick={resetDefaults}
              disabled={running}
              className="text-[11px] text-slate-500 hover:text-slate-700 flex items-center gap-1 disabled:opacity-40"
              data-reset-days
            >
              <RotateCcw className="w-3 h-3" />
              既定値に戻す
            </button>
          </div>
          <div className="space-y-1.5">
            {(contents || []).map((step) => {
              const dayValue =
                days[step.step_number] ?? resolveDayFromContent(step)
              const previewText = step.preview || step.body?.slice(0, 30) || ''
              return (
                <div
                  key={step.id}
                  className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2"
                >
                  <span
                    className="text-xs font-bold w-12 shrink-0"
                    style={{ color: '#06C755' }}
                  >
                    {step.step_number}通目
                  </span>
                  <div className="text-xs text-slate-700 flex-1 truncate">
                    {previewText || '(本文なし)'}
                  </div>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={dayValue}
                    onChange={(e) =>
                      handleDayChange(step.step_number, e.target.value)
                    }
                    disabled={running}
                    className="w-20 px-2 py-1 border border-slate-200 rounded text-xs text-right focus:outline-none focus:border-green-500 disabled:opacity-50"
                    data-step-day={step.step_number}
                  />
                  <span className="text-[10px] text-slate-400 w-16 shrink-0 text-right">
                    {dayValue === 1 ? '即時' : `${dayValue - 1}日後`}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {localError && (
          <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>{localError}</div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            disabled={running}
            className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            キャンセル
          </button>
          <button
            onClick={handleConfirm}
            disabled={running || !isValidLineId}
            className="flex-1 px-4 py-2 text-white rounded-lg text-sm font-bold hover:opacity-90 flex items-center justify-center gap-2 disabled:opacity-40"
            style={{ backgroundColor: '#06C755' }}
            data-confirm-activation
          >
            {running ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                登録中...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                {isReactivation ? '更新する' : '有効化する'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
