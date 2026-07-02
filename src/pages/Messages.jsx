import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Loader2, Send, ArrowLeft, MessageSquare, AlertCircle,
  LayoutGrid, RefreshCw, Pin, X, ChevronDown, ChevronRight,
} from 'lucide-react'
import { supabase, isSupabaseMode } from '../lib/supabase'
import {
  fetchConversations,
  fetchMessages,
  sendReply,
  markMessagesRead,
  getAttachmentSignedUrl,
} from '../lib/lineMessages'
import { linkUserRichMenu, unlinkUserRichMenu } from '../lib/lineProxy'

const POLL_INTERVAL_MS = 5000 // Phase 1 は polling、Realtime は Phase 2

export default function Messages({ isTokenSet, connection }) {
  const [connectionId, setConnectionId] = useState(null)
  const [conversations, setConversations] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingList, setLoadingList] = useState(false)
  const [loadingConv, setLoadingConv] = useState(false)
  const [error, setError] = useState(null)
  const [attachmentUrls, setAttachmentUrls] = useState({}) // messageId -> signed URL
  const messagesEndRef = useRef(null)

  // 機能③: 個別リッチメニュー管理 state
  const [richMenuPanelOpen, setRichMenuPanelOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [currentLinkedMenu, setCurrentLinkedMenu] = useState(null)
  const [linkHistory, setLinkHistory] = useState([])
  const [availableMenus, setAvailableMenus] = useState([])
  const [richMenuActioning, setRichMenuActioning] = useState(false)
  const [richMenuError, setRichMenuError] = useState(null)
  const [pinTargetId, setPinTargetId] = useState('')

  // ===== connection_id 解決（既存 Friends.jsx と同じパターン）=====
  const resolveConnectionId = useCallback(async () => {
    if (!isTokenSet || !isSupabaseMode || !supabase || !connection?.channelId) {
      return null
    }
    const { data, error: err } = await supabase
      .from('line_connections')
      .select('id')
      .eq('channel_id', connection.channelId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (err) {
      setError(err.message)
      return null
    }
    if (!data) {
      setError('LINE接続情報が見つかりません。設定画面で接続テストを実行してください。')
      return null
    }
    return data.id
  }, [isTokenSet, connection?.channelId])

  // ===== 会話一覧ロード =====
  const loadConversations = useCallback(async (cid) => {
    if (!cid) return
    const { data, error: err } = await fetchConversations(cid)
    if (err) {
      setError(err.message)
      return
    }
    setConversations(data)
  }, [])

  // ===== 個別会話ロード（既読化 + signed URL 取得込み）=====
  const loadConversation = useCallback(async (cid, lineUserId) => {
    if (!cid || !lineUserId) return
    const { data, error: err } = await fetchMessages(cid, lineUserId)
    if (err) {
      setError(err.message)
      return
    }
    setMessages(data)
    // image/video の signed URL を一括取得（不足分のみ）
    const newUrls = {}
    for (const msg of data) {
      if (msg.storage_path && (msg.message_type === 'image' || msg.message_type === 'video')) {
        const existing = attachmentUrls[msg.id]
        if (existing) {
          newUrls[msg.id] = existing
        } else {
          newUrls[msg.id] = await getAttachmentSignedUrl(msg.storage_path)
        }
      }
    }
    setAttachmentUrls(newUrls)
  }, [attachmentUrls])

  // ===== 機能③: リッチメニュー状態ロード =====
  const loadRichMenuStatus = useCallback(async (cid, lineUserId) => {
    if (!cid || !lineUserId || !supabase) return
    try {
      // 現在 linked のレコード (1件以下のはず)
      const { data: cur, error: e1 } = await supabase
        .from('line_user_richmenu_links')
        .select('id, rich_menu_id, status, source, last_attempted_at, last_error, line_rich_menus(name, line_rich_menu_id)')
        .eq('connection_id', cid)
        .eq('line_user_id', lineUserId)
        .eq('status', 'linked')
        .maybeSingle()
      if (e1) console.warn('[Messages] richmenu current load:', e1.message)
      setCurrentLinkedMenu(cur || null)

      // 履歴 (直近 5 件)
      const { data: hist, error: e2 } = await supabase
        .from('line_user_richmenu_links')
        .select('id, status, source, last_attempted_at, last_error, line_rich_menus(name)')
        .eq('connection_id', cid)
        .eq('line_user_id', lineUserId)
        .order('last_attempted_at', { ascending: false, nullsFirst: false })
        .limit(5)
      if (e2) console.warn('[Messages] richmenu history load:', e2.message)
      setLinkHistory(hist || [])

      // 利用可能メニュー (固定先候補)
      const { data: menus, error: e3 } = await supabase
        .from('line_rich_menus')
        .select('id, line_rich_menu_id, name, target_tags, priority')
        .eq('connection_id', cid)
        .eq('is_active', true)
        .order('priority', { ascending: false })
      if (e3) console.warn('[Messages] richmenu list load:', e3.message)
      setAvailableMenus((menus || []).filter((m) => m.line_rich_menu_id))
    } catch (e) {
      console.warn('[Messages] loadRichMenuStatus failed:', e.message)
    }
  }, [])

  // ===== 機能③: 自動切替を再実行 =====
  const handleRefreshAuto = async () => {
    if (!connectionId || !selectedUser || richMenuActioning) return
    setRichMenuActioning(true)
    setRichMenuError(null)
    try {
      const { error: rpcErr } = await supabase.rpc('enqueue_richmenu_refresh', {
        p_connection_id: connectionId,
        p_line_user_id: selectedUser.line_user_id,
        p_source: 'manual',
      })
      if (rpcErr) throw new Error(rpcErr.message)
      // WF が完了して complete_richmenu_link を呼ぶまで少し待つ
      setTimeout(() => loadRichMenuStatus(connectionId, selectedUser.line_user_id), 1800)
    } catch (e) {
      setRichMenuError(e.message || 'refresh 失敗')
    } finally {
      setRichMenuActioning(false)
    }
  }

  // ===== 機能③: 特定メニューに固定 =====
  const handlePinTo = async (menu) => {
    if (!connectionId || !selectedUser || !menu || richMenuActioning) return
    setRichMenuActioning(true)
    setRichMenuError(null)
    try {
      // 1. pending レコードを INSERT (link_record_id を確保)
      const { data: link, error: insertErr } = await supabase
        .from('line_user_richmenu_links')
        .insert({
          connection_id: connectionId,
          line_user_id: selectedUser.line_user_id,
          rich_menu_id: menu.id,
          status: 'pending',
          source: 'manual',
          last_attempted_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (insertErr) throw new Error(insertErr.message)

      // 2. WF link_user 呼び出し (rich_menu_pk_id + link_record_id を渡す)
      const result = await linkUserRichMenu(
        connectionId,
        selectedUser.line_user_id,
        menu.line_rich_menu_id,
        { richMenuPkId: menu.id, linkRecordId: link.id }
      )
      if (result?.status === 'failed') throw new Error(result.error || 'link 失敗')

      // 3. WF が complete_richmenu_link を呼んだ後にリロード
      setTimeout(() => loadRichMenuStatus(connectionId, selectedUser.line_user_id), 1500)
    } catch (e) {
      setRichMenuError(e.message || 'pin 失敗')
    } finally {
      setRichMenuActioning(false)
    }
  }

  // ===== 機能③: 個別リンクを解除 =====
  const handleUnlink = async () => {
    if (!connectionId || !selectedUser || richMenuActioning) return
    setRichMenuActioning(true)
    setRichMenuError(null)
    try {
      const { data: link, error: insertErr } = await supabase
        .from('line_user_richmenu_links')
        .insert({
          connection_id: connectionId,
          line_user_id: selectedUser.line_user_id,
          rich_menu_id: null,
          status: 'pending',
          source: 'manual',
          last_attempted_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (insertErr) throw new Error(insertErr.message)

      const result = await unlinkUserRichMenu(
        connectionId,
        selectedUser.line_user_id,
        { linkRecordId: link.id }
      )
      if (result?.status === 'failed') throw new Error(result.error || 'unlink 失敗')

      setTimeout(() => loadRichMenuStatus(connectionId, selectedUser.line_user_id), 1500)
    } catch (e) {
      setRichMenuError(e.message || 'unlink 失敗')
    } finally {
      setRichMenuActioning(false)
    }
  }

  // ===== 初期マウント: connection 解決 + 一覧ロード =====
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadingList(true)
      const cid = await resolveConnectionId()
      if (cancelled) return
      setConnectionId(cid)
      if (cid) {
        await loadConversations(cid)
      }
      setLoadingList(false)
    })()
    return () => {
      cancelled = true
    }
  }, [resolveConnectionId, loadConversations])

  // 機能③: selectedUser 変更時にリッチメニュー状態をロード
  useEffect(() => {
    if (!connectionId || !selectedUser) {
      setCurrentLinkedMenu(null)
      setLinkHistory([])
      setRichMenuPanelOpen(false)
      return
    }
    loadRichMenuStatus(connectionId, selectedUser.line_user_id)
  }, [connectionId, selectedUser, loadRichMenuStatus])

  // ===== ユーザー選択時: 会話ロード + 既読化 =====
  useEffect(() => {
    if (!selectedUser || !connectionId) return
    let cancelled = false
    ;(async () => {
      setLoadingConv(true)
      await loadConversation(connectionId, selectedUser.line_user_id)
      if (cancelled) return
      setLoadingConv(false)
      // 既読化（楽観的: 一覧側の unread_count を 0 に）
      const { error: rErr } = await markMessagesRead(connectionId, selectedUser.line_user_id)
      if (rErr) {
        console.warn('[Messages] mark_line_messages_read failed:', rErr.message)
      }
      setConversations((prev) =>
        prev.map((c) =>
          c.line_user_id === selectedUser.line_user_id ? { ...c, unread_count: 0 } : c
        )
      )
      // 末尾スクロール
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
    })()
    return () => {
      cancelled = true
    }
  }, [selectedUser, connectionId, loadConversation])

  // ===== Polling: 5秒ごとに一覧 + 開いている会話を再取得（Realtime は Phase 2）=====
  useEffect(() => {
    if (!connectionId) return
    const interval = setInterval(() => {
      loadConversations(connectionId)
      if (selectedUser) {
        loadConversation(connectionId, selectedUser.line_user_id)
      }
    }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [connectionId, selectedUser, loadConversations, loadConversation])

  // ===== 返信送信 =====
  const handleSend = async () => {
    const text = inputText.trim()
    if (!text || !selectedUser || !connectionId || sending) return
    setSending(true)
    setError(null)
    const result = await sendReply({
      connectionId,
      lineUserId: selectedUser.line_user_id,
      messageText: text,
    })
    if (result.status === 'ok') {
      setInputText('')
      await loadConversations(connectionId)
      await loadConversation(connectionId, selectedUser.line_user_id)
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    } else {
      setError(result.send_error || '送信に失敗しました')
    }
    setSending(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSend()
    }
  }

  // ===== 時刻整形 =====
  const fmtRelative = (s) => {
    if (!s) return ''
    const diff = Date.now() - new Date(s).getTime()
    const min = Math.floor(diff / 60000)
    if (min < 1) return 'たった今'
    if (min < 60) return `${min}分前`
    const hr = Math.floor(min / 60)
    if (hr < 24) return `${hr}時間前`
    const d = Math.floor(hr / 24)
    if (d < 7) return `${d}日前`
    return new Date(s).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })
  }

  const fmtFull = (s) => {
    if (!s) return ''
    return new Date(s).toLocaleString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // ===== レンダリング: 早期返却 =====

  if (!isTokenSet) {
    return (
      <div className="p-6 max-w-7xl mx-auto" data-page="messages">
        <div className="bg-white rounded-xl border border-slate-200 p-10 flex flex-col items-center gap-3 text-slate-500">
          <MessageSquare className="w-10 h-10 text-slate-300" />
          <div className="text-sm font-bold text-slate-700">LINE未接続</div>
          <div className="text-xs text-center max-w-md">
            設定画面でチャネルアクセストークンを設定し、接続テストを実行してください。
          </div>
        </div>
      </div>
    )
  }

  if (!isSupabaseMode || !supabase) {
    return (
      <div className="p-6 max-w-7xl mx-auto" data-page="messages">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          メッセージ機能はSupabase接続モードのみで利用可能です。
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col" data-page="messages">
      <div className="flex-1 flex overflow-hidden bg-white border-t border-slate-200">
        {/* === 左: 会話一覧 === */}
        <aside
          className={`${
            selectedUser ? 'hidden md:flex' : 'flex'
          } w-full md:w-80 border-r border-slate-200 flex-col`}
        >
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <div className="text-xs text-slate-500" data-conv-count>
              {loadingList ? '読み込み中...' : `${conversations.length} 件の会話`}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto" data-conv-list>
            {loadingList && conversations.length === 0 && (
              <div className="p-8 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#06C755' }} />
              </div>
            )}
            {!loadingList && conversations.length === 0 && !error && (
              <div className="p-8 text-center text-sm text-slate-500">
                <MessageSquare className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                友だちからのメッセージはまだありません
              </div>
            )}
            {error && conversations.length === 0 && (
              <div className="m-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {error}
              </div>
            )}
            {conversations.map((c) => (
              <button
                key={c.line_user_id}
                onClick={() => setSelectedUser(c)}
                className={`w-full flex items-center gap-3 p-3 hover:bg-slate-50 border-b border-slate-100 last:border-0 text-left ${
                  selectedUser?.line_user_id === c.line_user_id ? 'bg-slate-50' : ''
                }`}
                data-conv-item={c.line_user_id}
              >
                <Avatar friend={c} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <div className="font-bold text-sm text-slate-800 truncate flex-1">
                      {c.display_name || c.line_user_id}
                    </div>
                    {c.last_message_at && (
                      <div className="text-[10px] text-slate-400 shrink-0">
                        {fmtRelative(c.last_message_at)}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-slate-500 truncate flex-1">
                      {c.last_direction === 'out' && (
                        <span className="text-slate-400">あなた: </span>
                      )}
                      {c.last_message
                        ? c.last_message.length > 30
                          ? c.last_message.slice(0, 30) + '…'
                          : c.last_message
                        : 'メッセージなし'}
                    </div>
                    {c.unread_count > 0 && (
                      <span
                        className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full text-white font-bold min-w-[18px] text-center"
                        style={{ backgroundColor: '#06C755' }}
                      >
                        {c.unread_count > 99 ? '99+' : c.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* === 右: 個別会話 === */}
        <section className={`${selectedUser ? 'flex' : 'hidden md:flex'} flex-1 flex-col`}>
          {!selectedUser && (
            <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
              <div className="text-center">
                <MessageSquare className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                左の一覧から会話を選択してください
              </div>
            </div>
          )}
          {selectedUser && (
            <>
              {/* 会話ヘッダー */}
              <div className="h-14 flex items-center gap-3 px-4 border-b border-slate-200 shrink-0 bg-white">
                <button
                  onClick={() => setSelectedUser(null)}
                  className="md:hidden p-1 hover:bg-slate-100 rounded"
                  aria-label="戻る"
                >
                  <ArrowLeft className="w-5 h-5 text-slate-600" />
                </button>
                <Avatar friend={selectedUser} size={32} />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-slate-800 truncate">
                    {selectedUser.display_name || selectedUser.line_user_id}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate font-mono">
                    {selectedUser.line_user_id}
                  </div>
                </div>
                {/* 機能③: リッチメニューパネル トグル */}
                <button
                  onClick={() => setRichMenuPanelOpen((v) => !v)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 hover:border-green-500 hover:text-green-600 shrink-0"
                  data-richmenu-panel-toggle
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">
                    {currentLinkedMenu?.line_rich_menus?.name
                      ? `RM: ${currentLinkedMenu.line_rich_menus.name}`
                      : 'リッチメニュー'}
                  </span>
                  {richMenuPanelOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* 機能③: リッチメニュー個別管理パネル */}
              {richMenuPanelOpen && (
                <div className="border-b border-slate-200 bg-slate-50 p-4 shrink-0" data-richmenu-panel>
                  {/* エラー表示 */}
                  {richMenuError && (
                    <div className="mb-3 p-2 rounded bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span className="flex-1">{richMenuError}</span>
                      <button onClick={() => setRichMenuError(null)} className="text-red-500 hover:text-red-700">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* 現在のリッチメニュー */}
                  <div className="mb-3 flex items-center gap-2 text-xs">
                    <span className="text-slate-500">現在の個別リッチメニュー:</span>
                    {currentLinkedMenu ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-green-100 text-green-700 font-bold">
                        <Pin className="w-3 h-3" />
                        {currentLinkedMenu.line_rich_menus?.name || '(名前不明)'}
                      </span>
                    ) : (
                      <span className="text-slate-400">未設定 (デフォルトメニュー or LINE 既定)</span>
                    )}
                  </div>

                  {/* アクション */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    <button
                      onClick={handleRefreshAuto}
                      disabled={richMenuActioning}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-white border border-slate-200 hover:border-green-500 hover:text-green-600 disabled:opacity-50"
                      data-richmenu-action="refresh-auto"
                    >
                      {richMenuActioning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      自動切替を再実行
                    </button>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={pinTargetId}
                        onChange={(e) => setPinTargetId(e.target.value)}
                        className="text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white"
                        data-richmenu-pin-select
                      >
                        <option value="">特定メニューに固定...</option>
                        {availableMenus.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                            {m.priority > 0 ? ` (P${m.priority})` : ''}
                            {m.target_tags?.length > 0 ? ` [${m.target_tags.slice(0, 2).join(',')}]` : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => {
                          const m = availableMenus.find((x) => x.id === pinTargetId)
                          if (m) handlePinTo(m)
                        }}
                        disabled={richMenuActioning || !pinTargetId}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-lg bg-white border border-slate-200 hover:border-green-500 hover:text-green-600 disabled:opacity-50"
                        data-richmenu-action="pin"
                      >
                        <Pin className="w-3.5 h-3.5" />
                        固定
                      </button>
                    </div>
                    <button
                      onClick={handleUnlink}
                      disabled={richMenuActioning || !currentLinkedMenu}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-white border border-slate-200 hover:border-red-500 hover:text-red-600 disabled:opacity-50"
                      data-richmenu-action="unlink"
                    >
                      <X className="w-3.5 h-3.5" />
                      個別リンクを解除
                    </button>
                  </div>

                  {/* 履歴 (折りたたみ) */}
                  <div>
                    <button
                      onClick={() => setHistoryOpen((v) => !v)}
                      className="text-[11px] text-slate-500 hover:text-slate-700 flex items-center gap-1"
                      data-richmenu-history-toggle
                    >
                      {historyOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      履歴 ({linkHistory.length})
                    </button>
                    {historyOpen && (
                      <div className="mt-2 space-y-1" data-richmenu-history>
                        {linkHistory.length === 0 && (
                          <div className="text-[11px] text-slate-400">履歴なし</div>
                        )}
                        {linkHistory.map((h) => (
                          <div
                            key={h.id}
                            className="flex items-center gap-2 text-[10px] px-2 py-1 rounded bg-white border border-slate-100"
                          >
                            <span
                              className={`px-1.5 py-0.5 rounded font-bold ${
                                h.status === 'linked'
                                  ? 'bg-green-100 text-green-700'
                                  : h.status === 'unlinked'
                                  ? 'bg-slate-100 text-slate-600'
                                  : h.status === 'failed'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {h.status}
                            </span>
                            <span className="text-slate-400">{h.source}</span>
                            <span className="flex-1 truncate text-slate-600">
                              {h.line_rich_menus?.name || '-'}
                            </span>
                            <span className="text-slate-400 shrink-0">
                              {h.last_attempted_at ? new Date(h.last_attempted_at).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* メッセージリスト */}
              <div
                className="flex-1 overflow-y-auto p-4 space-y-3"
                style={{ backgroundColor: '#f7f8fa' }}
                data-conv-messages
              >
                {loadingConv && messages.length === 0 && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#06C755' }} />
                  </div>
                )}
                {!loadingConv && messages.length === 0 && (
                  <div className="text-center text-xs text-slate-400 py-8">
                    まだメッセージはありません
                  </div>
                )}
                {messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    msg={msg}
                    signedUrl={attachmentUrls[msg.id]}
                    fmtFull={fmtFull}
                  />
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* 返信入力 */}
              <div className="border-t border-slate-200 p-3 shrink-0 bg-white">
                {error && (
                  <div className="mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span className="flex-1">{error}</span>
                    <button
                      onClick={() => setError(null)}
                      className="text-red-500 hover:text-red-700 shrink-0"
                      aria-label="エラーを閉じる"
                    >
                      ×
                    </button>
                  </div>
                )}
                <div className="flex gap-2">
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="返信を入力 (Cmd/Ctrl + Enter で送信)"
                    rows={2}
                    disabled={sending}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-500 resize-none disabled:opacity-60 disabled:bg-slate-50"
                    data-reply-input
                  />
                  <button
                    onClick={handleSend}
                    disabled={!inputText.trim() || sending}
                    className="px-4 py-2 rounded-lg text-white text-sm font-bold flex items-center gap-1.5 disabled:opacity-50 self-end"
                    style={{ backgroundColor: '#06C755' }}
                    data-reply-send
                  >
                    {sending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    送信
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

function Avatar({ friend, size = 40 }) {
  const initial = (friend.display_name || friend.line_user_id || '?').charAt(0).toUpperCase()
  if (friend.picture_url) {
    return (
      <img
        src={friend.picture_url}
        alt={friend.display_name || ''}
        className="rounded-full object-cover shrink-0 bg-slate-200"
        style={{ width: size, height: size }}
        onError={(e) => {
          e.target.style.display = 'none'
        }}
      />
    )
  }
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold shrink-0 bg-slate-200 text-slate-600"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initial}
    </div>
  )
}

function MessageBubble({ msg, signedUrl, fmtFull }) {
  const isOut = msg.direction === 'out'
  const align = isOut ? 'justify-end' : 'justify-start'
  const bubbleStyle = isOut
    ? { backgroundColor: '#06C755', color: '#ffffff' }
    : { backgroundColor: '#ffffff', color: '#0f172a' }

  return (
    <div className={`flex ${align}`} data-msg-id={msg.id} data-direction={msg.direction}>
      <div className="max-w-[70%] flex flex-col gap-0.5">
        <div
          className="rounded-2xl px-3 py-2 text-sm break-words shadow-sm"
          style={bubbleStyle}
        >
          {msg.message_type === 'text' && (
            <span className="whitespace-pre-wrap">{msg.text_content || ''}</span>
          )}
          {msg.message_type === 'sticker' && (
            <span className={isOut ? 'text-white/80 italic' : 'text-slate-500 italic'}>
              (スタンプ #{msg.sticker_id})
            </span>
          )}
          {msg.message_type === 'image' &&
            (signedUrl ? (
              <img
                src={signedUrl}
                alt="image"
                className="rounded-lg max-w-full max-h-60 object-contain"
              />
            ) : (
              <span className={isOut ? 'text-white/80 italic' : 'text-slate-500 italic'}>
                {msg.storage_path ? '(画像取得中...)' : '(画像取得失敗)'}
              </span>
            ))}
          {msg.message_type === 'video' &&
            (signedUrl ? (
              <video src={signedUrl} controls className="rounded-lg max-w-full max-h-60" />
            ) : (
              <span className={isOut ? 'text-white/80 italic' : 'text-slate-500 italic'}>
                {msg.storage_path ? '(動画取得中...)' : '(動画取得失敗)'}
              </span>
            ))}
          {msg.message_type === 'other' && (
            <span className={isOut ? 'text-white/80 italic' : 'text-slate-500 italic'}>
              (未対応のメッセージ)
            </span>
          )}
        </div>
        <div className={`text-[10px] text-slate-400 ${isOut ? 'text-right' : ''}`}>
          {fmtFull(msg.created_at)}
          {isOut && msg.send_method && ` · ${msg.send_method}`}
          {msg.send_error && (
            <span className="text-red-500 ml-1">⚠ {msg.send_error}</span>
          )}
        </div>
      </div>
    </div>
  )
}
