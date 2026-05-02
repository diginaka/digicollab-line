import { useState, useMemo, useCallback } from 'react'
import { MessageSquare, Loader2, Workflow, Clock, ChevronDown, ChevronUp, Save, Zap, AlertCircle } from 'lucide-react'
import { supabase, isSupabaseMode } from '../lib/supabase'
import { useGeneratedContents } from '../hooks/useGeneratedContents'
import SequenceStatusBadge from './sequences/SequenceStatusBadge'

// Phase A.6 (2026-05-02) embedded mode 専用 view。
// Phase B 拡張版 (2026-05-02) で UX 飾り 3 項目を追加:
//   #A 4 状態バッジ (empty / draft / active / error)
//   #B 行クリック展開 + 本文編集 + delay 編集 + 「自動配信として確定」UI
//   #C テスト送信モーダルは Phase B.5 (LINE 配信 EF + RPC 新規実装) として別 Epic 切り出し済
//
// フロービルダー (digicollab-flow-builder) の SlidePanel から
// `?embed=true&funnel_id={funnel_id}` 付き URL で iframe 埋め込みされた場合に、
// その funnel の AI 一括生成済み LINE 下書き 5 通を表示する。

function classifyRow(status) {
  if (status === 'failed') return 'error'
  if (status === 'pending' || status === 'sending' || status === 'sent') return 'active'
  if (status === 'draft') return 'draft'
  return 'empty'
}

function classifyOverall(contents) {
  if (!contents || contents.length === 0) return 'empty'
  const statuses = contents.map((c) => classifyRow(c.delivery_status))
  if (statuses.includes('error')) return 'error'
  if (statuses.includes('active')) return 'active'
  if (statuses.includes('draft')) return 'draft'
  return 'empty'
}

export default function EmbeddedDraftView({ funnelId }) {
  const { contents, funnelName, patternName, loading } = useGeneratedContents(
    funnelId,
    'line',
  )

  const [expandedId, setExpandedId] = useState(null)
  const overallStatus = useMemo(() => classifyOverall(contents), [contents])

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-white rounded-xl border border-digi-border p-10 flex flex-col items-center gap-3 text-digi-text-muted">
          <Loader2 className="w-6 h-6 animate-spin text-digi-green" />
          <div className="text-sm">下書きを読み込み中...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto" data-page="sequences-embedded">
      {/* ヘッダー: タイトル + シーケンス全体バッジ + funnel メタ情報 */}
      <div className="bg-white rounded-xl border border-digi-border p-5 mb-4">
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <Workflow className="w-5 h-5 text-digi-green" />
          <div className="font-bold text-digi-text text-lg">
            ステップ配信 (AI 一括生成済み下書き)
          </div>
          <SequenceStatusBadge status={overallStatus} size="sm" />
        </div>
        {(funnelName || patternName) && (
          <div className="text-xs text-digi-text-muted flex items-center gap-2 flex-wrap">
            {funnelName && <span>{funnelName}</span>}
            {patternName && <span className="opacity-60">/ {patternName}</span>}
          </div>
        )}
        <div className="text-xs text-digi-text-muted/70 mt-1">
          funnel_id: <code className="font-mono">{funnelId}</code>
        </div>
      </div>

      {/* 0 件の場合 */}
      {contents.length === 0 && (
        <div className="bg-white rounded-xl border border-digi-border p-10 text-center">
          <MessageSquare className="w-10 h-10 text-digi-text-muted/40 mx-auto mb-3" />
          <div className="text-sm font-bold text-digi-text mb-1">
            まだ下書きがありません
          </div>
          <div className="text-xs text-digi-text-muted">
            フロービルダーで「AI 一括生成」を実行すると、
            <br />
            ここに LINE メッセージの下書きが表示されます。
          </div>
        </div>
      )}

      {/* 下書き一覧 (行クリック展開対応) */}
      {contents.length > 0 && (
        <div className="space-y-3">
          {contents.map((item) => (
            <DraftCard
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              onToggle={() => setExpandedId((prev) => (prev === item.id ? null : item.id))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function DraftCard({ item, expanded, onToggle }) {
  const rowStatus = classifyRow(item.delivery_status)
  const [draftBody, setDraftBody] = useState(item.body || '')
  const [savingState, setSavingState] = useState('idle') // idle | saving | saved | error
  const [saveError, setSaveError] = useState(null)

  const isDirty = draftBody !== (item.body || '')

  const handleSave = useCallback(async () => {
    if (!isSupabaseMode || !supabase) {
      setSaveError('DB 接続がありません')
      setSavingState('error')
      return
    }
    setSavingState('saving')
    setSaveError(null)
    const { error } = await supabase
      .from('generated_step_contents')
      .update({ body: draftBody, updated_at: new Date().toISOString() })
      .eq('id', item.id)
    if (error) {
      setSaveError(error.message)
      setSavingState('error')
      return
    }
    setSavingState('saved')
    // 2 秒後 idle に戻す
    setTimeout(() => setSavingState('idle'), 2000)
  }, [draftBody, item.id])

  return (
    <div
      className="bg-white rounded-xl border border-digi-border overflow-hidden"
      data-step-card
      data-step-number={item.step_number}
    >
      {/* 行ヘッダー (クリックで展開/折畳) */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 bg-digi-bg/50 border-b border-digi-border/60 hover:bg-digi-bg transition-colors text-left"
        aria-expanded={expanded}
      >
        <div className="shrink-0 w-8 h-8 rounded-full bg-white border border-digi-border flex items-center justify-center font-bold text-xs text-digi-text">
          {item.step_number}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-digi-text truncate">
            {item.step_label || `LINE ${item.step_number} 通目`}
          </div>
          {item.metadata?.delay_days !== undefined && (
            <div className="text-xs text-digi-text-muted flex items-center gap-1 mt-0.5">
              <Clock className="w-3 h-3" />
              {item.metadata.delay_days === 0
                ? '友だち追加時'
                : `${item.metadata.delay_days}日後`}
            </div>
          )}
        </div>
        <SequenceStatusBadge status={rowStatus} size="sm" />
        {item.metadata?.flex_format === 'flex' && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 shrink-0">
            Flex
          </span>
        )}
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-digi-text-muted shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-digi-text-muted shrink-0" />
        )}
      </button>

      {/* 本文プレビュー (LINE 風吹き出し、常時表示) */}
      <div className="p-4">
        <div className="flex justify-start">
          <div className="bg-[#E8F5E9] rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%]">
            <pre className="text-sm text-digi-text whitespace-pre-wrap font-sans leading-relaxed">
              {item.body || '(本文なし)'}
            </pre>
          </div>
        </div>
      </div>

      {/* 展開時のみ表示: 編集 textarea + 確定ボタン */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-digi-border/40 pt-3 bg-digi-bg/30">
          <label className="block">
            <span className="text-xs font-bold text-digi-text mb-1 block">本文を編集</span>
            <textarea
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 border border-digi-border rounded-lg text-sm focus:outline-none focus:border-digi-green resize-none bg-white text-digi-text"
              placeholder="LINE メッセージ本文..."
            />
          </label>

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button
              type="button"
              onClick={handleSave}
              disabled={!isDirty || savingState === 'saving'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-bold bg-digi-green hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {savingState === 'saving' ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> 保存中...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" /> 本文を保存
                </>
              )}
            </button>

            <button
              type="button"
              disabled
              title="次フェーズで配信パイプラインと結線予定 (Phase B.5)"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-digi-border text-digi-text-muted cursor-not-allowed"
            >
              <Zap className="w-3.5 h-3.5" /> 自動配信として確定
            </button>

            {savingState === 'saved' && (
              <span className="text-xs text-digi-green flex items-center gap-1">
                ✓ 保存しました
              </span>
            )}
            {savingState === 'error' && saveError && (
              <span className="text-xs text-red-700 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> {saveError}
              </span>
            )}
          </div>

          <p className="text-[11px] text-digi-text-muted/80 mt-2 leading-snug">
            ※ 「自動配信として確定」は次フェーズ (Phase B.5) で LINE 配信 Edge Function 整備後に有効化されます。
          </p>
        </div>
      )}
    </div>
  )
}
