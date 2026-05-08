// LINE 自動配信パネル
//
// フロービルダー (?funnel_id=xxx) から開かれた時のみ表示。
// AI 生成済みの LINE メッセージ一式を読み込み、ワンクリックで delivery_queue に
// 予約登録する。実配信は n8n WF-DE (5分 cron) が拾う。
//
// メール側 AutoDeliveryPanel の LINE 版。Brevo API 呼び出しが無いため
// シンプルになっており、リスト選択 → 単一 user ID テキスト入力に置換。
// ブランドカラーは LINE グリーン #06C755。

import { useState } from 'react'
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Calendar,
  MessageSquare,
  Zap,
  Smartphone,
} from 'lucide-react'
import { useGeneratedContents } from '../hooks/useGeneratedContents'
import { useLineAutoDeliverySetup } from '../hooks/useLineAutoDeliverySetup'

const LINE_GREEN = '#06C755'

export default function LineAutoDeliveryPanel({ funnelId }) {
  const { contents, funnelName, patternName, loading: contentsLoading } =
    useGeneratedContents(funnelId, 'line')
  const { setupAutoDelivery, running, error, result, reset } =
    useLineAutoDeliverySetup()

  const [expanded, setExpanded] = useState(true)
  const [recipientLineId, setRecipientLineId] = useState('')
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    d.setMinutes(d.getMinutes() + 1)
    // datetime-local 用に "YYYY-MM-DDTHH:mm" 形式 (ローカルタイム)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  })

  if (!funnelId) return null
  if (!contentsLoading && contents.length === 0) return null

  if (contentsLoading) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700 flex items-center gap-2 mb-6">
        <Loader2 className="w-4 h-4 animate-spin" />
        AI 生成シーケンスを読み込み中...
      </div>
    )
  }

  const isSetUp = Boolean(result?.ok)
  const canSetup =
    !running &&
    !isSetUp &&
    contents.length > 0 &&
    Boolean(recipientLineId) &&
    Boolean(startDate)

  const handleSetup = async () => {
    if (!canSetup) return
    try {
      const isoStart = new Date(startDate).toISOString()
      await setupAutoDelivery({
        funnelId,
        contents,
        recipientLineId,
        startAt: isoStart,
      })
    } catch {
      // hook 内で error state がセット済み
    }
  }

  return (
    <div
      className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-xl mb-6 overflow-hidden"
      data-line-auto-delivery-panel
    >
      {/* ヘッダー */}
      <div className="px-4 py-3 flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${LINE_GREEN}1f` }}
        >
          <Zap className="w-4 h-4" style={{ color: LINE_GREEN }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-xs font-bold text-white px-2 py-0.5 rounded-full flex items-center gap-1"
              style={{ backgroundColor: LINE_GREEN }}
            >
              <Sparkles className="w-3 h-3" />
              AI 自動配信
            </span>
            {funnelName && (
              <span className="text-xs text-slate-600 truncate">{funnelName}</span>
            )}
            {patternName && (
              <span className="text-xs text-slate-400 truncate">/ {patternName}</span>
            )}
            <span className="text-xs text-slate-500">· 全 {contents.length} 通</span>
          </div>
          <div className="text-xs text-slate-600 mt-0.5">
            ワンクリックで LINE Push 配信を予約できます
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-slate-500 hover:text-slate-700 text-xs font-bold flex items-center gap-1"
          data-line-auto-delivery-toggle
        >
          {expanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
          {expanded ? '閉じる' : '開く'}
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4">
          <div className="bg-white rounded-xl border border-emerald-200 p-4 space-y-3">
            {/* ステップ一覧 */}
            <div>
              <div className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" />
                配信ステップ
              </div>
              <div className="space-y-1.5 max-h-44 overflow-y-auto">
                {contents.map((step) => {
                  const day =
                    step.day ??
                    (step.metadata?.delay_days != null
                      ? Number(step.metadata.delay_days) + 1
                      : step.step_number)
                  const delayDays = Math.max(0, Number(day) - 1)
                  const previewSrc = step.body || step.preview || ''
                  const preview = previewSrc.slice(0, 32)
                  const truncated = previewSrc.length > 32
                  return (
                    <div
                      key={step.id}
                      className="flex items-center gap-2 text-xs bg-slate-50 rounded-lg px-3 py-2"
                    >
                      <span
                        className="font-bold shrink-0 w-12"
                        style={{ color: LINE_GREEN }}
                      >
                        {step.step_number}通目
                      </span>
                      <span className="text-slate-700 flex-1 truncate">
                        {preview ? `${preview}${truncated ? '...' : ''}` : '(本文なし)'}
                      </span>
                      <span className="text-slate-400 shrink-0 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {delayDays === 0 ? '即時' : `${delayDays}日後`}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 設定欄 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-600 mb-1 flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5" />
                  配信先 LINE user ID（テスト用）
                </label>
                <input
                  type="text"
                  value={recipientLineId}
                  onChange={(e) => setRecipientLineId(e.target.value.trim())}
                  placeholder="U3245bf90258ccfae3b6ea2f43dfe390b"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none font-mono"
                  style={{
                    borderColor: recipientLineId ? LINE_GREEN : undefined,
                  }}
                  disabled={isSetUp}
                  data-recipient-line-id
                />
                <div className="text-[10px] text-slate-500 mt-1">
                  Phase 1 はテスト用 user ID への単一配信のみ対応
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 mb-1 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  配信開始日時（1通目）
                </label>
                <input
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none"
                  disabled={isSetUp}
                  data-start-date
                />
              </div>
            </div>

            {/* セットアップボタン */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleSetup}
                disabled={!canSetup}
                className="flex-1 px-4 py-2.5 text-white rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2 transition-all"
                style={{ backgroundColor: LINE_GREEN }}
                data-setup-line-auto-delivery
              >
                {running ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    セットアップ中...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    自動配信をセットアップ
                  </>
                )}
              </button>
              {result && (
                <button
                  type="button"
                  onClick={reset}
                  className="px-3 py-2.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50"
                >
                  リセット
                </button>
              )}
            </div>

            {/* 結果表示 */}
            {error && <Notice type="error">{error}</Notice>}
            {isSetUp && (
              <Notice type="success">
                <CheckCircle2 className="w-4 h-4 inline mr-1" />
                {result.successCount} 通の配信予約をセットアップしました。
                配信エンジン (WF-DE) が 5 分以内に 1 通目を配信します。
                {result.warnings && result.warnings.length > 0 && (
                  <div className="mt-1 text-amber-700">
                    ※ 下書きステータス更新で警告: {result.warnings.join(', ')}
                  </div>
                )}
              </Notice>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Notice({ type = 'info', children }) {
  const cls =
    type === 'error'
      ? 'bg-red-50 border-red-200 text-red-700'
      : type === 'success'
      ? 'bg-green-50 border-green-200 text-green-800'
      : type === 'warning'
      ? 'bg-amber-50 border-amber-200 text-amber-800'
      : 'bg-slate-50 border-slate-200 text-slate-700'
  return (
    <div className={`border rounded-lg p-3 text-xs flex items-start gap-2 ${cls}`}>
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <div className="flex-1">{children}</div>
    </div>
  )
}
