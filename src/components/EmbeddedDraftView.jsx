import { MessageSquare, Loader2, Workflow, Clock } from 'lucide-react'
import { useGeneratedContents } from '../hooks/useGeneratedContents'

// Phase A.6 (2026-05-02) embedded mode 専用 view。
//
// フロービルダー (digicollab-flow-builder) の SlidePanel から
// `?embed=true&funnel_id={funnel_id}` 付き URL で iframe 埋め込みされた場合に、
// その funnel の AI 一括生成済み LINE 下書き 5 通を表示する。
//
// Sequences.jsx の standalone モード (left pane = line_sequences 一覧 +
// 配信開始フォーム + 友だちタグフィルタ) は完全に無改修で温存し、
// embedded mode のときだけこの view が表示される。
//
// 状態バッジ・「自動配信として確定」・テスト送信モーダル等の mail PR #1 並列 UX は
// 本 view ではあえて省略 (達也さんビジョン「下書き 5 通表示」のミニマル達成のみ)。
// それらは Phase B 拡張版 (UI シンプル化 + ホワイトラベル化) で別途追加予定。
export default function EmbeddedDraftView({ funnelId }) {
  const { contents, funnelName, patternName, loading } = useGeneratedContents(
    funnelId,
    'line',
  )

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-white rounded-xl border border-slate-200 p-10 flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#06C755' }} />
          <div className="text-sm">下書きを読み込み中...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto" data-page="sequences-embedded">
      {/* ヘッダー */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
        <div className="flex items-center gap-3 mb-2">
          <Workflow className="w-5 h-5" style={{ color: '#06C755' }} />
          <div className="font-bold text-slate-800 text-lg">
            ステップ配信 (AI 一括生成済み下書き)
          </div>
        </div>
        {(funnelName || patternName) && (
          <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
            {funnelName && <span>{funnelName}</span>}
            {patternName && <span className="text-slate-400">/ {patternName}</span>}
          </div>
        )}
        <div className="text-xs text-slate-400 mt-1">
          funnel_id: <code className="font-mono">{funnelId}</code>
        </div>
      </div>

      {/* 0 件の場合 */}
      {contents.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <div className="text-sm font-bold text-slate-700 mb-1">
            まだ下書きがありません
          </div>
          <div className="text-xs text-slate-500">
            フロービルダーで「AI 一括生成」を実行すると、
            <br />
            ここに LINE メッセージの下書きが表示されます。
          </div>
        </div>
      )}

      {/* 下書き一覧 */}
      {contents.length > 0 && (
        <div className="space-y-3">
          {contents.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-xl border border-slate-200 overflow-hidden"
              data-step-card
              data-step-number={item.step_number}
            >
              {/* ヘッダー */}
              <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border-b border-slate-100">
                <div className="shrink-0 w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center font-bold text-xs">
                  {item.step_number}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-800 truncate">
                    {item.step_label || `LINE ${item.step_number} 通目`}
                  </div>
                  {item.metadata?.delay_days !== undefined && (
                    <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      {item.metadata.delay_days === 0
                        ? '友だち追加時'
                        : `${item.metadata.delay_days}日後`}
                    </div>
                  )}
                </div>
                {item.metadata?.flex_format === 'flex' && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 shrink-0">
                    Flex
                  </span>
                )}
              </div>

              {/* 本文プレビュー (LINE 風吹き出し) */}
              <div className="p-4">
                <div className="flex justify-start">
                  <div className="bg-[#E8F5E9] rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%]">
                    <pre className="text-sm text-slate-800 whitespace-pre-wrap font-sans leading-relaxed">
                      {item.body || '(本文なし)'}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
