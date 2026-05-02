import { useState, useEffect } from 'react'
import {
  LayoutDashboard, Users, MessageSquare, Workflow, Send,
  LayoutGrid, Settings as SettingsIcon, Loader2,
} from 'lucide-react'
import { localStore, isSupabaseMode, supabase } from './lib/supabase'
import { initSSO } from './lib/initSSO'
import { useFlowContext } from './hooks/useFlowContext'
import { AIContentCopyBarLine } from './components/AIContentCopyBarLine'
import Dashboard from './pages/Dashboard'
import Friends from './pages/Friends'
import Messages from './pages/Messages'
import Sequences from './pages/Sequences'
import Broadcasts from './pages/Broadcasts'
import RichMenus from './pages/RichMenus'
import Settings from './pages/Settings'

// Phase B.7.3 v2 (2026-05-03): Phase B 拡張版 PR #4 で巻き添え削除された
// 機能① (Messages.jsx) + 機能③ (RichMenus.jsx) + Settings / Friends / Dashboard /
// Broadcasts を完全復元。Phase B.7.3 PR #7 (応急処置 placeholder NAV) は close 予定。
// PR #7 で追加した細サイドバー (w-14) / state ベース view 切替 / ホワイトラベル化 /
// AIContentCopyBarLine 条件付き表示 の改善は維持して統合。
// embed mode (flow-builder iframe 内) では NAV 非表示で Sequences のみ描画 (案 A)。
const EMPTY_CONNECTION = {
  channelAccessToken: '',
  botName: '',
  botIconUrl: '',
  channelId: '',
  liffUrl: '',
  n8nWebhookUrl: '',
  greetingMessage: 'ようこそ！友だち追加ありがとうございます😊',
  autoReplyEnabled: true,
  isConnected: false,
}

const NAV = [
  { id: 'dashboard',  label: 'ダッシュボード', icon: LayoutDashboard },
  { id: 'friends',    label: '友だち管理',     icon: Users },
  { id: 'messages',   label: 'メッセージ',     icon: MessageSquare },
  { id: 'sequences',  label: 'ステップ配信',   icon: Workflow },
  { id: 'broadcasts', label: '一斉配信',       icon: Send },
  { id: 'richmenus',  label: 'リッチメニュー', icon: LayoutGrid },
  { id: 'settings',   label: '設定',           icon: SettingsIcon },
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
  // ====== 接続情報（LINE Messaging API用のBYOK情報、localStorage 永続化） ======
  const [connection, setConnection] = useState(() =>
    localStore.get('connection', EMPTY_CONNECTION)
  )
  const [loadingConnection] = useState(false)

  useEffect(() => {
    localStore.set('connection', connection)
  }, [connection])

  // ====== embed mode 判定 (flow-builder iframe 内 = funnel_id 検出) ======
  const { funnelId, isEmbedded } = useFlowContext()

  // embed mode: NAV 非表示で Sequences のみ描画 (Phase B 拡張版 確定動作維持)
  if (isEmbedded && funnelId) {
    return <EmbeddedView session={session} />
  }

  // standalone mode: 元の 7 アイコン NAV + state ベース view 切替
  return (
    <StandaloneView
      session={session}
      connection={connection}
      setConnection={setConnection}
      loading={loadingConnection}
    />
  )
}

// ====== embed mode ビュー (flow-builder iframe 内、NAV 非表示) ======
function EmbeddedView({ session }) {
  const isSessionActive = Boolean(session)
  return (
    <div className="app-container">
      <div className="main-content">
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

        <AIContentCopyBarLine />

        <main className="content-area" data-content-area>
          <Sequences />
        </main>
      </div>
    </div>
  )
}

// ====== standalone mode ビュー (line.digicollabo.com 直接、7 アイコン NAV) ======
function StandaloneView({ session, connection, setConnection, loading }) {
  const [currentPage, setCurrentPage] = useState('dashboard')

  const isSessionActive = Boolean(session)
  const isTokenSet = Boolean(connection.channelAccessToken && connection.isConnected)
  const currentItem = NAV.find((n) => n.id === currentPage)

  const pages = {
    dashboard: <Dashboard isTokenSet={isTokenSet} connection={connection} setCurrentPage={setCurrentPage} />,
    friends: <Friends isTokenSet={isTokenSet} connection={connection} />,
    messages: <Messages isTokenSet={isTokenSet} connection={connection} />,
    sequences: <Sequences isTokenSet={isTokenSet} connection={connection} />,
    broadcasts: <Broadcasts isTokenSet={isTokenSet} connection={connection} />,
    richmenus: <RichMenus isTokenSet={isTokenSet} connection={connection} />,
    settings: <Settings connection={connection} setConnection={setConnection} loading={loading} />,
  }

  return (
    <div className="app-container">
      {/* 細サイドバー (w-14、アイコンのみ + ホバー tooltip = ホワイトラベル化) */}
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

      <div className="main-content">
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

        {/* AIContentCopyBarLine は配信ステップ画面のみ表示 (PR #7 改善維持) */}
        {currentPage === 'sequences' && <AIContentCopyBarLine />}

        <main className="content-area" data-content-area>
          {pages[currentPage]}
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
