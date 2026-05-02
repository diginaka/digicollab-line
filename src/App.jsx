import { useState, useEffect } from 'react'
import { Workflow, Loader2 } from 'lucide-react'
import { isSupabaseMode, supabase } from './lib/supabase'
import { initSSO } from './lib/initSSO'
import { AIContentCopyBarLine } from './components/AIContentCopyBarLine'
import Sequences from './pages/Sequences'

export default function App() {
  // ====== SSO セッション管理 ======
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(!isSupabaseMode) // standalone時は即ready

  useEffect(() => {
    if (!isSupabaseMode || !supabase) {
      setReady(true)
      return
    }

    let cancelled = false
    ;(async () => {
      // 1) 起動時: URLからSSOトークン注入
      await initSSO()

      // 2) 現在のセッション取得
      const { data } = await supabase.auth.getSession()
      if (cancelled) return
      setSession(data.session)
      setReady(true)
    })()

    // 3) 二重化①: 認証状態変化を検知
    const { data: authSub } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (!cancelled) setSession(sess)
    })

    // 4) 二重化②: 60秒ポーリングで失効検知
    const interval = setInterval(async () => {
      const { data } = await supabase.auth.getSession()
      if (!cancelled) setSession(data.session)
    }, 60_000)

    return () => {
      cancelled = true
      authSub?.subscription?.unsubscribe()
      clearInterval(interval)
    }
  }, [])

  // ====== レンダリング ======
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-digi-bg">
        <Loader2 className="w-6 h-6 animate-spin text-digi-green" />
      </div>
    )
  }

  // supabaseモードで未ログイン時はランディング表示
  if (isSupabaseMode && !session) {
    return <SSOLanding />
  }

  // Phase B 拡張版: ホワイトラベル化 + 細サイドバー (アイコンのみ) +
  // 右上 🟢 ステータスドット 1 個。embedded only モード (Sequences のみ表示)。
  const isSessionActive = Boolean(session)

  return (
    <div className="app-container">
      {/* 細サイドバー (w-14、アイコンのみ、ロゴ + ブランド名は撤去) */}
      <aside className="w-14 flex flex-col bg-digi-sidebar">
        <div className="h-12 border-b border-white/10" aria-hidden />

        <nav className="flex-1 py-3 space-y-1">
          {/* 配信ステップ (現在唯一の機能) */}
          <button
            type="button"
            title="配信ステップ"
            aria-label="配信ステップ"
            className="w-full h-10 flex items-center justify-center text-white bg-white/10 border-l-[3px] border-digi-green-light"
            data-nav="sequences"
          >
            <Workflow className="w-5 h-5" />
          </button>
        </nav>
      </aside>

      {/* メインコンテンツ */}
      <div className="main-content">
        {/* 薄ヘッダー: 右上 🟢 ステータスドット 1 個のみ */}
        <header className="h-12 bg-white border-b border-digi-border flex items-center justify-between px-4 shrink-0">
          <h1 className="text-sm font-semibold text-digi-text">配信ステップ</h1>
          <span
            className="flex items-center gap-1.5 text-xs text-digi-text-muted"
            data-connection-status
            title={isSessionActive ? '接続済' : '未接続'}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isSessionActive ? 'bg-digi-green-light' : 'bg-digi-text-muted/40'
              }`}
              aria-hidden
            />
          </span>
        </header>

        {/* AI生成コンテンツコピーバー（FuseBase埋め込み時のみ表示） */}
        <AIContentCopyBarLine />

        {/* コンテンツエリア (embedded only: Sequences が EmbeddedDraftView を返す) */}
        <main className="content-area" data-content-area>
          <Sequences />
        </main>
      </div>
    </div>
  )
}

// ====== 未ログイン時のランディング (ホワイトラベル化済) ======
function SSOLanding() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-digi-bg">
      <div className="text-center max-w-md">
        <p className="text-digi-text-muted leading-relaxed mb-6">
          このアプリはフロービルダーの一部です。
          <br />
          フロービルダー本体からアクセスしてください。
        </p>
        <a
          href="https://digicollabo.com"
          className="inline-flex items-center gap-2 px-6 py-3 text-white rounded-lg font-bold hover:opacity-90 transition-opacity bg-digi-green"
        >
          フロービルダーを開く
          <span aria-hidden>↗</span>
        </a>
      </div>
    </div>
  )
}
