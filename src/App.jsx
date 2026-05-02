import { useState, useEffect } from 'react'
import {
  LayoutDashboard, Users, FolderTree, Send, BarChart3, Workflow,
  Settings as SettingsIcon, Loader2,
} from 'lucide-react'
import { isSupabaseMode, supabase } from './lib/supabase'
import { initSSO } from './lib/initSSO'
import { AIContentCopyBarLine } from './components/AIContentCopyBarLine'
import Sequences from './pages/Sequences'

// Phase B.7.3 (2026-05-03): mail と同等のサブサイドバー機能アイコン復活。
// Phase B 拡張版 PR #4 で standalone mode 削除時に巻き添え削除されたナビゲーション
// アイコンを復元し、達也さん「mail と同等の機能アクセス」期待を満たす。
// sequences のみ実機能 (EmbeddedDraftView)、他は「準備中」プレースホルダーで
// 視覚的に mail と並列の構成を提供。各機能の本実装は別 Epic で対応予定。
const NAV = [
  { id: 'dashboard', label: 'ダッシュボード', icon: LayoutDashboard },
  { id: 'friends', label: '友だち管理', icon: Users },
  { id: 'tags', label: 'タグ', icon: FolderTree },
  { id: 'broadcasts', label: '一斉配信', icon: Send },
  { id: 'reports', label: '配信レポート', icon: BarChart3 },
  { id: 'sequences', label: '配信ステップ', icon: Workflow },
  { id: 'settings', label: '設定', icon: SettingsIcon },
]

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

  return <MainApp session={session} />
}

function MainApp({ session }) {
  // Phase B.7.3: mail と同等の state ベース view 切替。
  // デフォルトは 'sequences' (embedded mode のメイン機能 = EmbeddedDraftView 表示)。
  const [currentPage, setCurrentPage] = useState('sequences')

  const isSessionActive = Boolean(session)
  const currentItem = NAV.find((n) => n.id === currentPage)

  return (
    <div className="app-container">
      {/* 細サイドバー (w-14、アイコンのみ、ロゴ + ブランド名は撤去 = ホワイトラベル化) */}
      <aside className="w-14 flex flex-col bg-digi-sidebar">
        <div className="h-12 border-b border-white/10" aria-hidden />

        <nav className="flex-1 py-3 space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon
            const active = currentPage === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setCurrentPage(item.id)}
                title={item.label}
                aria-label={item.label}
                className={`w-full h-10 flex items-center justify-center transition-colors ${
                  active
                    ? 'text-white bg-white/10 border-l-[3px] border-digi-green-light'
                    : 'text-white/55 hover:text-white hover:bg-white/5 border-l-[3px] border-transparent'
                }`}
                data-nav={item.id}
              >
                <Icon className="w-5 h-5" />
              </button>
            )
          })}
        </nav>
      </aside>

      {/* メインコンテンツ */}
      <div className="main-content">
        {/* 薄ヘッダー: 右上 🟢 ステータスドット 1 個のみ */}
        <header className="h-12 bg-white border-b border-digi-border flex items-center justify-between px-4 shrink-0">
          <h1 className="text-sm font-semibold text-digi-text">{currentItem?.label}</h1>
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

        {/* AI生成コンテンツコピーバー（FuseBase埋め込み時のみ表示、配信ステップ画面のみ） */}
        {currentPage === 'sequences' && <AIContentCopyBarLine />}

        {/* コンテンツエリア */}
        <main className="content-area" data-content-area>
          {currentPage === 'sequences' ? (
            <Sequences />
          ) : (
            <ComingSoonPage label={currentItem?.label} />
          )}
        </main>
      </div>
    </div>
  )
}

// Phase B.7.3: mail と並列の視覚体験のためのプレースホルダー。
// 各機能の本実装は別 Epic (Phase B.5 LINE テスト送信 EF 等) で順次対応予定。
function ComingSoonPage({ label }) {
  return (
    <div className="p-6 max-w-2xl mx-auto" data-page="coming-soon">
      <div className="bg-white rounded-xl border border-digi-border p-8 text-center">
        <p className="font-bold text-digi-text mb-2">{label} は準備中です</p>
        <p className="text-sm text-digi-text-muted leading-relaxed">
          現在ご利用いただける機能は「配信ステップ」のみです。
          <br />
          他の機能は順次対応予定です。
        </p>
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
