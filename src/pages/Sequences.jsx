import { Workflow, AlertCircle } from 'lucide-react'
import { useFlowContext } from '../hooks/useFlowContext'
import EmbeddedDraftView from '../components/EmbeddedDraftView'

// Phase B 拡張版 (2026-05-02): standalone mode 削除、embedded only に集約。
// - Phase A.6 までは standalone (line_sequences 一覧 + 配信開始フォーム +
//   友だちタグフィルタ) と embedded (AI 一括生成済み下書き 5 通表示) の
//   2 モード分岐があったが、フロービルダー内蔵アプリ化に伴い standalone を全削除。
// - 達也さん最終ビジョン「ℹ️ ダッシュボードファースト + ブランド統合」を達成するため、
//   このアプリは ?embed=true&funnel_id=xxx 経由でフロービルダー iframe 内のみで起動する。
// - standalone 直接アクセスは案内メッセージを表示してフロービルダーへ誘導。
export default function Sequences() {
  const { funnelId, isEmbedded } = useFlowContext()

  if (isEmbedded && funnelId) {
    return <EmbeddedDraftView funnelId={funnelId} />
  }

  return (
    <div className="p-6 max-w-2xl mx-auto" data-page="sequences-redirect">
      <div className="bg-white rounded-xl border border-digi-border p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-digi-bg mx-auto mb-4 flex items-center justify-center">
          <AlertCircle className="w-6 h-6 text-digi-text-muted" />
        </div>
        <div className="font-bold text-digi-text mb-2 flex items-center gap-2 justify-center">
          <Workflow className="w-5 h-5 text-digi-green" />
          フロービルダーから開いてください
        </div>
        <p className="text-sm text-digi-text-muted leading-relaxed mb-4">
          このアプリはフロービルダーの内蔵機能です。
          <br />
          フロービルダーで line_seq ステップを開くと、
          <br />
          AI 一括生成された下書きがここに表示されます。
        </p>
        <a
          href="https://digicollabo.com"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-bold hover:opacity-90 transition-opacity bg-digi-green"
        >
          フロービルダーを開く ↗
        </a>
      </div>
    </div>
  )
}
