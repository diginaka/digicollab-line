import { useState, useEffect } from 'react'
import { LayoutDashboard, Users, Workflow, Send, LayoutGrid, Settings as SettingsIcon, ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react'
import { localStore, isSupabaseMode, supabase } from './lib/supabase'
import { AIContentCopyBarLine } from './components/AIContentCopyBarLine'

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
  // standaloneモード時のみlocalStorageから復元（supabaseモード時は下のeffectでDBから取得）
  const [connection, setConnection] = useState(() =>
    isSupabaseMode ? { ...EMPTY_CONNECTION } : localStore.get('connection', EMPTY_CONNECTION)
  )
  const [loadingConnection, setLoadingConnection] = useState(isSupabaseMode)

  // 初回マウント時: supabaseモードならログイン中ユーザーのline_connectionsレコードを取得
  useEffect(() => {
    if (!isSupabaseMode || !supabase) {
      setLoadingConnection(false)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const { data: userData } = await supabase.auth.getUser()
        const userId = userData?.user?.id
        if (!userId) {
          // 未ログイン: 空欄のまま
          if (!cancelled) setLoadingConnection(false)
          return
        }
        const { data, error } = await supabase
          .from('line_connections')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle()
        if (cancelled) return
        if (error) {
          console.warn('line_connections取得エラー:', error.message)
        } else if (data) {
          // DB値から接続状態を復元（ハードコード値は一切使わない）
          setConnection({
            channelAccessToken: data.channel_access_token || '',
            botName: data.bot_name || '',
            botIconUrl: data.bot_icon_url || '',
            channelId: data.channel_id || '',
            liffUrl: data.liff_url || '',
            n8nWebhookUrl: data.n8n_webhook_url || '',
            greetingMessage: data.greeting_message || 'ようこそ！友だち追加ありがとうございます😊',
            autoReplyEnabled: data.auto_reply_enabled ?? true,
            isConnected: Boolean(data.is_connected),
          })
        }
        // レコードが無い新規ユーザーはEMPTY_CONNECTIONのまま（空欄表示）
      } catch (err) {
        console.warn('接続情報の読み込みに失敗:', err?.message)
      } finally {
        if (!cancelled) setLoadingConnection(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // standaloneモード時のみlocalStorageに永続化
  useEffect(() => {
    if (!isSupabaseMode) {
      localStore.set('connection', connection)
    }
  }, [connection])

  const isTokenSet = Boolean(connection.channelAccessToken && connection.isConnected)
  const mode = isSupabaseMode ? 'supabase' : 'standalone'

  const pages = {
    dashboard: <Dashboard isTokenSet={isTokenSet} connection={connection} setCurrentPage={setCurrentPage} />,
    friends: <Friends isTokenSet={isTokenSet} connection={connection} />,
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
