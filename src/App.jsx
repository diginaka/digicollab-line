import { useState, useEffect } from 'react'
import { LayoutDashboard, Users, Workflow, Send, LayoutGrid, Settings as SettingsIcon, ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react'
import { localStore, isSupabaseMode } from './lib/supabase'
import { AIContentCopyBarLine } from './components/AIContentCopyBarLine'
import Dashboard from './pages/Dashboard'
import Friends from './pages/Friends'
import Sequences from './pages/Sequences'
import Broadcasts from './pages/Broadcasts'
import RichMenus from './pages/RichMenus'
import Settings from './pages/Settings'

const NAV = [
  { id: 'dashboard', label: 'ダッシュボード', icon: LayoutDashboard },
  { id: 'friends', label: '友だち管理', icon: Users },
  { id: 'sequences', label: 'ステップ配信', icon: Workflow },
  { id: 'broadcasts', label: '一斉配信', icon: Send },
  { id: 'richmenus', label: 'リッチメニュー', icon: LayoutGrid },
  { id: 'settings', label: '設定', icon: SettingsIcon },
]

export default function App() {
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [collapsed, setCollapsed] = useState(false)
  const [connection, setConnection] = useState(() => localStore.get('connection', {
    channelAccessToken: '',
    botName: '',
    botIconUrl: '',
    liffUrl: '',
    n8nWebhookUrl: '',
    greetingMessage: 'ようこそ！友だち追加ありがとうございます😊',
    autoReplyEnabled: true,
    isConnected: false,
  }))

  useEffect(() => {
    localStore.set('connection', connection)
  }, [connection])

  const isTokenSet = Boolean(connection.channelAccessToken && connection.isConnected)
  const mode = isSupabaseMode ? 'supabase' : 'standalone'

  const pages = {
    dashboard: <Dashboard isTokenSet={isTokenSet} connection={connection} setCurrentPage={setCurrentPage} />,
    friends: <Friends isTokenSet={isTokenSet} connection={connection} />,
    sequences: <Sequences isTokenSet={isTokenSet} connection={connection} />,
    broadcasts: <Broadcasts isTokenSet={isTokenSet} connection={connection} />,
    richmenus: <RichMenus isTokenSet={isTokenSet} connection={connection} />,
    settings: <Settings connection={connection} setConnection={setConnection} />,
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
              {mode === 'supabase' ? 'Supabase接続' : 'デモモード'}
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
