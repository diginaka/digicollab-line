import { useState, useEffect } from 'react'
import { LayoutDashboard, Users, Workflow, Send, LayoutGrid, Settings as SettingsIcon, ChevronLeft, ChevronRight, MessageCircle, MessageSquare } from 'lucide-react'
import { localStore, isSupabaseMode, supabase } from './lib/supabase'
import { initSSO } from './lib/initSSO'
import { AIContentCopyBarLine } from './components/AIContentCopyBarLine'
import Dashboard from './pages/Dashboard'
import Friends from './pages/Friends'
import Messages from './pages/Messages'
import Sequences from './pages/Sequences'
import Broadcasts from './pages/Broadcasts'
import RichMenus from './pages/RichMenus'
import Settings from './pages/Settings'

// 空の接続オブジェクト（初期値）
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
  { id: 'dashboard', label: 'ダッシュボード', icon: LayoutDashboard },
  { id: 'friends', label: '友だち管理', icon: Users },
  { id: 'messages', label: 'メッセージ', icon: MessageSquare },
  { id: 'sequences', label: 'ステップ配信', icon: Workflow },
  { id: 'broadcasts', label: '一斉配信', icon: Send },
  { id: 'richmenus', label: 'リッチメニュー', icon: LayoutGrid },
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

  // ====== 接続情報（LINE Messaging API用のBYOK情報） ======
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [collapsed, setCollapsed] = useState(false)
  const [connection, setConnection] = useState(() =>
    localStore.get('connection', EMPTY_CONNECTION)
  )
  const [loadingConnection] = useState(false)

  useEffect(() => {
    localStore.set('connection', connection)
  }, [connection])

  // ====== レンダリング ======
  if (!ready) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Noto Sans JP, system-ui, sans-serif',
          color: '#64748b',
          fontSize: 14,
        }}
      >
        読み込み中...
      </div>
    )
  }

  // supabaseモードで未ログイン時はランディング表示（独自ログイン画面は作らない）
  if (isSupabaseMode && !session) {
    return <SSOLanding />
  }

  const isTokenSet = Boolean(connection.channelAccessToken && connection.isConnected)
  const mode = isSupabaseMode ? 'supabase' : 'standalone'

  const pages = {
    dashboard: <Dashboard isTokenSet={isTokenSet} connection={connection} setCurrentPage={setCurrentPage} />,
    friends: <Friends isTokenSet={isTokenSet} connection={connection} />,
    messages: <Messages isTokenSet={isTokenSet} connection={connection} />,
    sequences: <Sequences isTokenSet={isTokenSet} connection={connection} />,
    broadcasts: <Broadcasts isTokenSet={isTokenSet} connection={connection} />,
    richmenus: <RichMenus isTokenSet={isTokenSet} connection={connection} />,
    settings: <Settings connection={connection} setConnection={setConnection} loading={loadingConnection} />,
  }

  return (
    <div className="app-container">
      {/* サイドバー */}
      <aside
        className={`${collapsed ? 'w-16' : 'w-60'} transition-all duration-200 flex flex-col`}
        style={{ backgroundColor: '#1a2332' }}
      >
        <div className="h-16 flex items-center px-4 border-b border-white/10">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: '#06C755' }}>
            <MessageCircle className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <div className="ml-3 min-w-0">
              <div className="text-white font-bold text-sm truncate">デジコラボ LINE</div>
              <div className="text-white/50 text-[10px]">BYOK方式</div>
            </div>
          )}
        </div>

        <nav className="flex-1 py-3 space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon
            const active = currentPage === item.id
            return (
              <button
                key={item.id}
                onClick={() => setCurrentPage(item.id)}
                className={`w-full flex items-center px-4 py-2.5 text-sm transition-colors ${
                  active ? 'text-white' : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
                style={active ? { backgroundColor: 'rgba(6, 199, 85, 0.15)', borderLeft: '3px solid #06C755' } : { borderLeft: '3px solid transparent' }}
                data-nav={item.id}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {!collapsed && <span className="ml-3 truncate">{item.label}</span>}
              </button>
            )
          })}
        </nav>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="h-12 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/5 border-t border-white/10"
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </aside>

      {/* メインコンテンツ */}
      <div className="main-content">
        {/* ヘッダー */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div>
            <h1 className="text-lg font-bold text-slate-800">
              {NAV.find((n) => n.id === currentPage)?.label}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {/* モードバッジ */}
            <span className={`text-xs px-2.5 py-1 rounded-full border ${
              mode === 'supabase' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              {mode === 'supabase' ? 'DB接続' : 'デモモード'}
            </span>
            {/* 接続ステータス */}
            <span
              className={`text-xs px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${
                isTokenSet ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-50 text-slate-600 border-slate-200'
              }`}
              data-connection-status
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isTokenSet ? 'bg-green-500' : 'bg-slate-400'}`} />
              {isTokenSet ? `LINE接続済 (${connection.botName || 'Bot'})` : 'LINE未接続'}
            </span>
          </div>
        </header>

        {/* AI生成コンテンツコピーバー（FuseBase埋め込み時のみ表示） */}
        <AIContentCopyBarLine />

        {/* コンテンツエリア */}
        <main className="content-area" data-content-area>
          {pages[currentPage]}
        </main>
      </div>
    </div>
  )
}

// ====== 未ログイン時のランディング ======
function SSOLanding() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)',
        fontFamily: 'Noto Sans JP, system-ui, -apple-system, sans-serif',
        padding: '2rem',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: '#06C755',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem',
            color: '#fff',
            fontSize: 32,
          }}
        >
          💬
        </div>
        <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            color: '#0f172a',
            marginBottom: '0.75rem',
          }}
        >
          デジコラボ LINE
        </h1>
        <p
          style={{
            color: '#475569',
            marginBottom: '1.5rem',
            lineHeight: 1.7,
            fontSize: '0.95rem',
          }}
        >
          このアプリはフロービルダーの一部です。
          <br />
          フロービルダー本体からアクセスしてください。
        </p>
        <a
          href="https://digicollabo.com"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.5rem',
            background: '#06C755',
            color: '#fff',
            borderRadius: '0.5rem',
            textDecoration: 'none',
            fontWeight: 600,
            boxShadow: '0 4px 12px rgba(6, 199, 85, 0.3)',
          }}
        >
          フロービルダーを開く ↗
        </a>
      </div>
    </div>
  )
}
