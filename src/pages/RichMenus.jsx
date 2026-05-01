import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Star, Smartphone, LayoutGrid, Loader2, X, Upload, Trash2,
  CheckCircle2, AlertCircle, Image as ImageIcon, Tag, Save,
} from 'lucide-react'
import { demoRichMenus } from '../lib/demoData'
import { richMenuProxy } from '../lib/lineProxy'
import { resolveConnectionId, supabase } from '../lib/supabase'

// ======== レイアウトプリセット ========
const LAYOUT_PRESETS = {
  '2x3': {
    label: '2行 × 3列（6エリア）',
    size: { width: 2500, height: 1686 },
    areas: [
      { bounds: { x: 0, y: 0, width: 833, height: 843 } },
      { bounds: { x: 833, y: 0, width: 834, height: 843 } },
      { bounds: { x: 1667, y: 0, width: 833, height: 843 } },
      { bounds: { x: 0, y: 843, width: 833, height: 843 } },
      { bounds: { x: 833, y: 843, width: 834, height: 843 } },
      { bounds: { x: 1667, y: 843, width: 833, height: 843 } },
    ],
  },
  '1x3': {
    label: '1行 × 3列（3エリア）',
    size: { width: 2500, height: 843 },
    areas: [
      { bounds: { x: 0, y: 0, width: 833, height: 843 } },
      { bounds: { x: 833, y: 0, width: 834, height: 843 } },
      { bounds: { x: 1667, y: 0, width: 833, height: 843 } },
    ],
  },
  '1x2': {
    label: '1行 × 2列（2エリア）',
    size: { width: 2500, height: 843 },
    areas: [
      { bounds: { x: 0, y: 0, width: 1250, height: 843 } },
      { bounds: { x: 1250, y: 0, width: 1250, height: 843 } },
    ],
  },
  '1x1': {
    label: '単一エリア',
    size: { width: 2500, height: 843 },
    areas: [{ bounds: { x: 0, y: 0, width: 2500, height: 843 } }],
  },
}

const GRID_COLS = { '2x3': 3, '1x3': 3, '1x2': 2, '1x1': 1 }
const GRID_ROWS = { '2x3': 2, '1x3': 1, '1x2': 1, '1x1': 1 }

// File → Base64（data:URLプレフィックス除外）
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function RichMenus({ isTokenSet, connection }) {
  const [menus, setMenus] = useState(isTokenSet ? [] : demoRichMenus)
  const [selected, setSelected] = useState(isTokenSet ? null : demoRichMenus[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [connectionId, setConnectionId] = useState(null)
  const [defaultMenuId, setDefaultMenuId] = useState(null)

  // 機能③: line_rich_menus DB のメタ情報 (LINE 側 richMenuId → DB row)
  const [dbMenus, setDbMenus] = useState({})
  const [availableTags, setAvailableTags] = useState([])

  // 作成モーダル
  const [createOpen, setCreateOpen] = useState(false)
  const [toast, setToast] = useState(null)

  // 自動切替設定の編集用 (選択中メニューの target_tags / priority 編集 state)
  const [editingTags, setEditingTags] = useState([])
  const [editingPriority, setEditingPriority] = useState(0)
  const [savingMeta, setSavingMeta] = useState(false)

  // ======== 一覧取得 ========
  const loadMenus = useCallback(async () => {
    if (!isTokenSet) {
      setMenus(demoRichMenus)
      setSelected(demoRichMenus[0])
      return
    }
    if (!connection?.channelId) {
      setError('LINE接続がありません。設定画面で接続してください。')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const connId = await resolveConnectionId(connection.channelId)
      if (!connId) {
        setError('LINE接続情報が見つかりません。設定画面で接続テストを実行してください。')
        return
      }
      setConnectionId(connId)

      const result = await richMenuProxy(connId, 'list')
      if (result.status !== 'success' && result.status !== undefined) {
        throw new Error(result.error || 'リッチメニューの取得に失敗しました')
      }
      const rawList = result.data?.body?.richmenus || result.data?.richmenus || []

      const mapped = rawList.map((m) => ({
        id: m.richMenuId,
        name: m.name || '無題',
        chatBarText: m.chatBarText,
        size: m.size || { width: 2500, height: 843 },
        areas: (m.areas || []).map((a) => ({
          bounds: a.bounds,
          action: a.action || { type: 'message', text: '' },
        })),
        selected: m.selected,
      }))
      setMenus(mapped)
      if (mapped.length > 0 && (!selected || !mapped.find((x) => x.id === selected.id))) {
        setSelected(mapped[0])
      }
      if (mapped.length === 0) setSelected(null)

      // デフォルトメニュー特定: selected === true のもの
      const def = rawList.find((m) => m.selected === true)
      setDefaultMenuId(def?.richMenuId || null)
    } catch (err) {
      setError(err.message || '取得エラー')
    } finally {
      setLoading(false)
    }
  }, [isTokenSet, connection?.channelId]) // eslint-disable-line

  useEffect(() => {
    loadMenus()
  }, [loadMenus])

  // ======== line_rich_menus DB メタ取得 ========
  const loadDbMenus = useCallback(async (connId) => {
    if (!connId || !supabase) return
    const { data, error: err } = await supabase
      .from('line_rich_menus')
      .select('id,line_rich_menu_id,name,target_tags,priority,is_active,is_default')
      .eq('connection_id', connId)
    if (err) {
      console.warn('[RichMenus] loadDbMenus failed:', err.message)
      return
    }
    const map = {}
    for (const row of (data || [])) {
      if (row.line_rich_menu_id) map[row.line_rich_menu_id] = row
    }
    setDbMenus(map)
  }, [])

  const loadAvailableTags = useCallback(async (connId) => {
    if (!connId || !supabase) return
    const { data, error: err } = await supabase
      .from('line_user_tags')
      .select('tags')
      .eq('connection_id', connId)
    if (err) {
      console.warn('[RichMenus] loadAvailableTags failed:', err.message)
      return
    }
    const set = new Set()
    for (const row of (data || [])) {
      if (Array.isArray(row.tags)) {
        for (const t of row.tags) {
          if (typeof t === 'string' && t.trim()) set.add(t.trim())
        }
      }
    }
    setAvailableTags([...set].sort())
  }, [])

  useEffect(() => {
    if (connectionId) {
      loadDbMenus(connectionId)
      loadAvailableTags(connectionId)
    }
  }, [connectionId, loadDbMenus, loadAvailableTags])

  // 選択メニューが変わったら、その target_tags / priority を編集 state に反映
  useEffect(() => {
    if (!selected) {
      setEditingTags([])
      setEditingPriority(0)
      return
    }
    const dbRow = dbMenus[selected.id]
    setEditingTags(dbRow?.target_tags || [])
    setEditingPriority(dbRow?.priority || 0)
  }, [selected, dbMenus])

  // ======== トースト ========
  const showToast = (message, ok = true) => {
    setToast({ message, ok })
    setTimeout(() => setToast(null), 3000)
  }

  // ======== 作成 ========
  const createMenu = async (form) => {
    if (!connectionId) return
    setLoading(true)
    try {
      const preset = LAYOUT_PRESETS[form.layout]
      const menuData = {
        size: preset.size,
        selected: false,
        name: form.name,
        chatBarText: form.chatBarText || 'メニュー',
        areas: preset.areas.map((a, i) => ({
          bounds: a.bounds,
          action: buildAction(form.areas[i]),
        })),
      }

      // 1. create
      const createRes = await richMenuProxy(connectionId, 'create', { menuData })
      const richMenuId = createRes.data?.body?.richMenuId || createRes.data?.richMenuId
      if (!richMenuId) throw new Error('リッチメニューID取得失敗')

      // 2. upload_image（任意）
      if (form.imageFile) {
        const imageBase64 = await fileToBase64(form.imageFile)
        const imageContentType = form.imageFile.type || 'image/png'
        const upRes = await richMenuProxy(connectionId, 'upload_image', {
          richMenuId,
          imageBase64,
          imageContentType,
        })
        if (upRes.status === 'failed') throw new Error(upRes.error || '画像アップロード失敗')
      }

      // 3. 機能③: line_rich_menus に target_tags / priority を保存 (個別切替の対象に)
      if (supabase) {
        const { error: dbErr } = await supabase
          .from('line_rich_menus')
          .insert({
            connection_id: connectionId,
            name: form.name,
            line_rich_menu_id: richMenuId,
            layout_type: form.layout,
            areas_json: menuData.areas,
            target_tags: Array.isArray(form.targetTags) ? form.targetTags : [],
            priority: Number.isFinite(form.priority) ? form.priority : 0,
            is_active: true,
            is_default: false,
          })
        if (dbErr) {
          console.warn('[RichMenus] line_rich_menus insert failed:', dbErr.message)
          showToast('LINE側は作成成功、自動切替設定の保存に失敗 (' + dbErr.message + ')', false)
        } else {
          showToast('リッチメニューを作成しました')
        }
      } else {
        showToast('リッチメニューを作成しました (DB未接続)')
      }

      setCreateOpen(false)
      loadMenus()
      loadDbMenus(connectionId)
      loadAvailableTags(connectionId)
    } catch (err) {
      showToast(err.message || '作成失敗', false)
    } finally {
      setLoading(false)
    }
  }

  // ======== 機能③: 自動切替設定 (target_tags + priority) の保存 ========
  // 既存 LINE メニューに対して line_rich_menus に行があれば UPDATE、なければ INSERT
  const saveMenuMeta = async () => {
    if (!connectionId || !selected || !supabase) return
    setSavingMeta(true)
    try {
      const dbRow = dbMenus[selected.id]
      const target_tags = editingTags.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim())
      const priority = Number.isFinite(editingPriority) ? Number(editingPriority) : 0
      if (dbRow) {
        const { error: err } = await supabase
          .from('line_rich_menus')
          .update({ target_tags, priority })
          .eq('id', dbRow.id)
        if (err) throw new Error(err.message)
      } else {
        const { error: err } = await supabase
          .from('line_rich_menus')
          .insert({
            connection_id: connectionId,
            name: selected.name,
            line_rich_menu_id: selected.id,
            layout_type: deriveLayoutType(selected),
            areas_json: selected.areas,
            target_tags,
            priority,
            is_active: true,
            is_default: defaultMenuId === selected.id,
          })
        if (err) throw new Error(err.message)
      }
      showToast('自動切替設定を保存しました')
      await loadDbMenus(connectionId)
    } catch (err) {
      showToast('保存失敗: ' + (err.message || 'unknown'), false)
    } finally {
      setSavingMeta(false)
    }
  }

  // ======== デフォルト設定/解除 ========
  const setAsDefault = async (richMenuId) => {
    if (!connectionId) return
    try {
      const res = await richMenuProxy(connectionId, 'set_default', { richMenuId })
      if (res.status === 'failed') throw new Error(res.error)
      showToast('デフォルトに設定しました')
      setDefaultMenuId(richMenuId)
    } catch (err) {
      showToast('設定失敗: ' + err.message, false)
    }
  }

  const cancelDefault = async () => {
    if (!connectionId) return
    try {
      const res = await richMenuProxy(connectionId, 'cancel_default')
      if (res.status === 'failed') throw new Error(res.error)
      showToast('デフォルト設定を解除しました')
      setDefaultMenuId(null)
    } catch (err) {
      showToast('解除失敗: ' + err.message, false)
    }
  }

  // ======== 削除 ========
  const deleteMenu = async (richMenuId) => {
    if (!connectionId) return
    if (!window.confirm('このリッチメニューを削除しますか？')) return
    try {
      const res = await richMenuProxy(connectionId, 'delete', { richMenuId })
      if (res.status === 'failed') throw new Error(res.error)
      showToast('削除しました')
      loadMenus()
    } catch (err) {
      showToast('削除失敗: ' + err.message, false)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto" data-page="richmenus">
      {/* 情報バナー */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 text-sm text-blue-900">
        <div className="font-bold mb-1">📐 リッチメニュー画像の要件</div>
        <ul className="text-xs text-blue-800 space-y-0.5 ml-4 list-disc">
          <li>形式: JPEG または PNG</li>
          <li>幅: 800 / 1200 / 1800 / 2500 px（2500px推奨）</li>
          <li>高さ: 250px以上（2x3レイアウトは幅の2/3 = 1686px、1行レイアウトは幅の1/3弱）</li>
          <li>ファイルサイズ: 1MB以下</li>
        </ul>
      </div>

      {loading && menus.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-10 flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#06C755' }} />
          <div className="text-sm">リッチメニューを読み込み中...</div>
        </div>
      )}

      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 mb-4">{error}</div>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* メニュー一覧 */}
          <div className="lg:col-span-2 space-y-3">
            <button
              onClick={() => setCreateOpen(true)}
              disabled={!isTokenSet}
              className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-600 hover:border-green-500 hover:text-green-600 disabled:opacity-50"
              data-add-richmenu
            >
              <Plus className="w-4 h-4" /> 新しいメニューを作成
            </button>

            {menus.length === 0 && isTokenSet && (
              <div className="bg-white rounded-xl border border-slate-200 p-6 text-center">
                <LayoutGrid className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <div className="text-sm font-bold text-slate-700">リッチメニューはまだありません</div>
                <div className="text-xs text-slate-500 mt-1">「新しいメニューを作成」から始めましょう</div>
              </div>
            )}

            {menus.map((m) => (
              <div
                key={m.id}
                className={`bg-white rounded-xl border p-4 transition cursor-pointer ${
                  selected?.id === m.id ? 'border-green-500 ring-2 ring-green-100' : 'border-slate-200 hover:border-slate-300'
                }`}
                onClick={() => setSelected(m)}
                data-richmenu-card
              >
                <div className="flex items-start justify-between mb-2 gap-2">
                  <div className="font-bold text-slate-800 text-sm flex items-center gap-1.5 min-w-0 flex-1">
                    <span className="truncate">{m.name}</span>
                    {defaultMenuId === m.id && <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteMenu(m.id) }}
                    className="text-slate-400 hover:text-red-500 shrink-0"
                    title="削除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="text-xs text-slate-500 mb-2">
                  {m.areas.length}エリア / {m.chatBarText || 'メニュー'}
                </div>
                {/* 機能③: target_tags / priority サマリー */}
                {(dbMenus[m.id]?.target_tags?.length > 0 || dbMenus[m.id]?.priority > 0) && (
                  <div className="flex flex-wrap gap-1 mb-2" data-richmenu-tags-summary>
                    {(dbMenus[m.id]?.target_tags || []).slice(0, 5).map((t) => (
                      <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">
                        #{t}
                      </span>
                    ))}
                    {(dbMenus[m.id]?.target_tags?.length || 0) > 5 && (
                      <span className="text-[10px] text-slate-400">+{dbMenus[m.id].target_tags.length - 5}</span>
                    )}
                    {(dbMenus[m.id]?.priority || 0) > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                        優先 {dbMenus[m.id].priority}
                      </span>
                    )}
                  </div>
                )}
                <div className="flex gap-1 flex-wrap">
                  {defaultMenuId === m.id ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); cancelDefault() }}
                      className="text-[10px] px-2 py-1 rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200"
                    >
                      デフォルト解除
                    </button>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); setAsDefault(m.id) }}
                      className="text-[10px] px-2 py-1 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
                    >
                      デフォルトに設定
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* プレビュー + 設定 */}
          {selected && (
            <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Smartphone className="w-4 h-4 text-slate-400" />
                <h3 className="font-bold text-slate-800">LINE表示プレビュー</h3>
              </div>

              {/* LINE風iPhoneフレーム */}
              <div className="max-w-[280px] mx-auto mb-5">
                <div className="border-4 border-slate-800 rounded-[32px] overflow-hidden bg-slate-800">
                  <div className="line-chat-bg h-32 flex items-end p-2">
                    <div className="line-bubble text-xs">
                      {selected.chatBarText || 'こんにちは！下のメニューから選んでください👇'}
                    </div>
                  </div>
                  <div className="bg-white">
                    <MenuGrid menu={selected} />
                  </div>
                  <div className="h-6 bg-slate-800" />
                </div>
              </div>

              {/* エリア設定 */}
              <div className="mb-5">
                <h4 className="text-sm font-bold text-slate-700 mb-2">エリア設定</h4>
                <div className="space-y-2">
                  {selected.areas.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg border border-slate-200">
                      <div className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] text-slate-500 truncate">
                          {a.action?.type === 'uri' && `🔗 ${a.action.uri}`}
                          {a.action?.type === 'message' && `💬 ${a.action.text}`}
                          {a.action?.type === 'postback' && `📮 ${a.action.displayText || a.action.data}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 機能③: 自動切替設定 (target_tags + priority) */}
              <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <Tag className="w-4 h-4 text-slate-500" />
                  <h4 className="text-sm font-bold text-slate-700">自動切替設定</h4>
                </div>
                <p className="text-[11px] text-slate-500 mb-3">
                  ここで指定したタグを持つ友だちに、このリッチメニューが自動で表示されます (OR 条件)。
                </p>

                {/* 対象タグ マルチセレクト */}
                <div className="mb-3">
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">対象タグ</label>
                  <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px] p-2 rounded-lg border border-slate-200 bg-slate-50">
                    {editingTags.length === 0 && (
                      <span className="text-[11px] text-slate-400">タグ未設定 (個別切替の対象外、デフォルトメニュー用)</span>
                    )}
                    {editingTags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-green-100 text-green-700"
                      >
                        {t}
                        <button
                          onClick={() => setEditingTags((prev) => prev.filter((x) => x !== t))}
                          className="hover:text-green-900"
                          aria-label={`${t} を削除`}
                          data-richmenu-tag-remove={t}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  {/* 利用可能タグ から選択 + 任意入力 */}
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {availableTags
                      .filter((t) => !editingTags.includes(t))
                      .slice(0, 12)
                      .map((t) => (
                        <button
                          key={t}
                          onClick={() => setEditingTags((prev) => [...prev, t])}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 hover:bg-green-100 hover:text-green-700"
                          data-richmenu-tag-add={t}
                        >
                          + {t}
                        </button>
                      ))}
                  </div>
                  <input
                    type="text"
                    placeholder="任意のタグを入力して Enter (例: vip / 購入者)"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const val = e.currentTarget.value.trim()
                        if (val && !editingTags.includes(val)) {
                          setEditingTags((prev) => [...prev, val])
                          e.currentTarget.value = ''
                        }
                      }
                    }}
                    className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-green-500"
                    data-richmenu-tag-input
                  />
                </div>

                {/* 優先順位 */}
                <div className="mb-3">
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">
                    優先順位 <span className="text-[10px] font-normal text-slate-500">(複数メニューが該当する場合、大きい方が優先)</span>
                  </label>
                  <input
                    type="number"
                    value={editingPriority}
                    onChange={(e) => setEditingPriority(Number(e.target.value) || 0)}
                    className="w-24 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-green-500"
                    data-richmenu-priority-input
                  />
                </div>

                <button
                  onClick={saveMenuMeta}
                  disabled={savingMeta}
                  className="px-4 py-2 rounded-lg text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                  style={{ backgroundColor: '#06C755' }}
                  data-richmenu-meta-save
                >
                  {savingMeta ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  自動切替設定を保存
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 作成モーダル */}
      {createOpen && (
        <CreateModal
          onClose={() => setCreateOpen(false)}
          onCreate={createMenu}
          loading={loading}
          availableTags={availableTags}
        />
      )}

      {/* トースト */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 text-sm font-bold z-50 ${
            toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {toast.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.message}
        </div>
      )}
    </div>
  )
}

// ======== メニューグリッド ========
function MenuGrid({ menu }) {
  // LAYOUT推定: areas数から判定
  let layout = '1x1'
  if (menu.areas.length === 6) layout = '2x3'
  else if (menu.areas.length === 3) layout = '1x3'
  else if (menu.areas.length === 2) layout = '1x2'

  const cols = GRID_COLS[layout]
  const rows = GRID_ROWS[layout]

  return (
    <div
      className="grid gap-px bg-slate-200"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}
    >
      {menu.areas.slice(0, cols * rows).map((a, i) => (
        <div
          key={i}
          className="bg-white p-2 text-center text-[9px] font-bold text-slate-700 aspect-[4/3] flex flex-col items-center justify-center gap-0.5"
        >
          <div className="text-sm">
            {a.action?.type === 'uri' ? '🔗' : a.action?.type === 'postback' ? '📮' : '💬'}
          </div>
          <div className="truncate max-w-full">{a.action?.label || `エリア${i + 1}`}</div>
        </div>
      ))}
    </div>
  )
}

// ======== 作成モーダル ========
function CreateModal({ onClose, onCreate, loading, availableTags = [] }) {
  const [name, setName] = useState('')
  const [chatBarText, setChatBarText] = useState('メニュー')
  const [layout, setLayout] = useState('2x3')
  const [areas, setAreas] = useState(() =>
    Array(6).fill(null).map(() => ({ type: 'uri', label: '', uri: '', text: '', data: '', displayText: '' }))
  )
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  // 機能③: 自動切替設定
  const [targetTags, setTargetTags] = useState([])
  const [priority, setPriority] = useState(0)
  const [tagDraft, setTagDraft] = useState('')

  const preset = LAYOUT_PRESETS[layout]

  // レイアウト変更時に areas 配列サイズ調整
  useEffect(() => {
    setAreas((prev) => {
      const next = []
      for (let i = 0; i < preset.areas.length; i++) {
        next.push(prev[i] || { type: 'uri', label: '', uri: '', text: '', data: '', displayText: '' })
      }
      return next
    })
  }, [layout, preset.areas.length])

  const updateArea = (i, field, value) => {
    setAreas((prev) => prev.map((a, idx) => (idx === i ? { ...a, [field]: value } : a)))
  }

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 1024 * 1024) {
      alert('ファイルサイズは1MB以下にしてください')
      return
    }
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = () => setImagePreview(String(reader.result))
    reader.readAsDataURL(file)
  }

  const handleSubmit = () => {
    if (!name.trim()) return alert('メニュー名を入力してください')
    onCreate({ name, chatBarText, layout, areas, imageFile, targetTags, priority })
  }

  const addTag = (t) => {
    const v = (t || '').trim()
    if (!v) return
    if (targetTags.includes(v)) return
    setTargetTags((prev) => [...prev, v])
  }
  const removeTag = (t) => {
    setTargetTags((prev) => prev.filter((x) => x !== t))
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-2xl w-full my-8 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <h3 className="font-bold text-slate-800">新しいリッチメニューを作成</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* 基本情報 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">メニュー名</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例: メインメニュー"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">チャットバー表示</label>
              <input
                type="text"
                value={chatBarText}
                onChange={(e) => setChatBarText(e.target.value)}
                maxLength={14}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-500"
              />
            </div>
          </div>

          {/* レイアウト選択 */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">レイアウト</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(LAYOUT_PRESETS).map(([key, p]) => (
                <button
                  key={key}
                  onClick={() => setLayout(key)}
                  className={`p-3 rounded-lg border-2 text-left transition ${
                    layout === key ? 'border-green-500 bg-green-50' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="text-xs font-bold">{key}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{p.label}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {p.size.width}×{p.size.height}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 画像アップロード */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">
              メニュー画像 ({preset.size.width}×{preset.size.height}px推奨 / 1MB以下)
            </label>
            <div className="flex items-start gap-3">
              <label className="flex-1 border-2 border-dashed border-slate-300 rounded-lg p-4 text-center cursor-pointer hover:border-green-500 hover:bg-green-50 transition">
                <input type="file" accept="image/png,image/jpeg" onChange={handleFile} className="hidden" />
                <Upload className="w-5 h-5 mx-auto text-slate-400 mb-1" />
                <div className="text-xs text-slate-600">
                  {imageFile ? imageFile.name : 'クリックして画像を選択'}
                </div>
                {imageFile && (
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {(imageFile.size / 1024).toFixed(0)}KB / {imageFile.type}
                  </div>
                )}
              </label>
              {imagePreview && (
                <div className="w-32 h-20 rounded-lg overflow-hidden border border-slate-200 shrink-0">
                  <img src={imagePreview} alt="" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          </div>

          {/* エリア設定 */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2">
              エリア設定 ({areas.length}エリア)
            </label>
            <div className="space-y-2">
              {areas.map((area, i) => (
                <div key={i} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded bg-white border border-slate-300 flex items-center justify-center text-xs font-bold">
                      {i + 1}
                    </div>
                    <input
                      type="text"
                      value={area.label}
                      onChange={(e) => updateArea(i, 'label', e.target.value)}
                      placeholder="ラベル（例: ホーム）"
                      className="flex-1 px-2 py-1 border border-slate-200 rounded text-xs"
                    />
                    <select
                      value={area.type}
                      onChange={(e) => updateArea(i, 'type', e.target.value)}
                      className="px-2 py-1 border border-slate-200 rounded text-xs"
                    >
                      <option value="uri">URL</option>
                      <option value="message">テキスト送信</option>
                      <option value="postback">ポストバック</option>
                    </select>
                  </div>
                  {area.type === 'uri' && (
                    <input
                      type="text"
                      value={area.uri}
                      onChange={(e) => updateArea(i, 'uri', e.target.value)}
                      placeholder="https://example.com"
                      className="w-full px-2 py-1 border border-slate-200 rounded text-xs"
                    />
                  )}
                  {area.type === 'message' && (
                    <input
                      type="text"
                      value={area.text}
                      onChange={(e) => updateArea(i, 'text', e.target.value)}
                      placeholder="送信するテキスト"
                      className="w-full px-2 py-1 border border-slate-200 rounded text-xs"
                    />
                  )}
                  {area.type === 'postback' && (
                    <div className="grid grid-cols-2 gap-1">
                      <input
                        type="text"
                        value={area.data}
                        onChange={(e) => updateArea(i, 'data', e.target.value)}
                        placeholder="data"
                        className="px-2 py-1 border border-slate-200 rounded text-xs"
                      />
                      <input
                        type="text"
                        value={area.displayText}
                        onChange={(e) => updateArea(i, 'displayText', e.target.value)}
                        placeholder="displayText"
                        className="px-2 py-1 border border-slate-200 rounded text-xs"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 機能③: 自動切替設定 (対象タグ + 優先順位) */}
          <div className="border-t border-slate-200 pt-4">
            <div className="flex items-center gap-2 mb-1.5">
              <Tag className="w-4 h-4 text-slate-500" />
              <label className="text-xs font-bold text-slate-700">自動切替設定 (省略可)</label>
            </div>
            <p className="text-[11px] text-slate-500 mb-2">
              対象タグを設定すると、そのタグを持つ友だちにこのリッチメニューが自動で表示されます (OR 条件)。
            </p>

            {/* 対象タグ */}
            <div className="mb-3">
              <label className="block text-[11px] font-bold text-slate-600 mb-1">対象タグ</label>
              <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px] p-2 rounded-lg border border-slate-200 bg-slate-50">
                {targetTags.length === 0 && (
                  <span className="text-[11px] text-slate-400">タグ未設定 (個別切替対象外)</span>
                )}
                {targetTags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-green-100 text-green-700"
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() => removeTag(t)}
                      className="hover:text-green-900"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              {/* 既存タグから候補表示 */}
              {availableTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {availableTags
                    .filter((t) => !targetTags.includes(t))
                    .slice(0, 12)
                    .map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => addTag(t)}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 hover:bg-green-100 hover:text-green-700"
                      >
                        + {t}
                      </button>
                    ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addTag(tagDraft)
                      setTagDraft('')
                    }
                  }}
                  placeholder="任意のタグを入力 (Enter で追加)"
                  className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-green-500"
                />
                <button
                  type="button"
                  onClick={() => { addTag(tagDraft); setTagDraft('') }}
                  className="px-3 py-1 text-xs rounded border border-slate-200 hover:border-green-500 hover:text-green-600"
                >
                  追加
                </button>
              </div>
            </div>

            {/* 優先順位 */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                優先順位
                <span className="text-[10px] font-normal text-slate-500 ml-1">(複数該当時は大きい方を優先)</span>
              </label>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value) || 0)}
                className="w-24 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-green-500"
              />
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-slate-200 flex gap-2 justify-end sticky bottom-0 bg-white">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50"
          >
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-5 py-2 text-white rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
            style={{ backgroundColor: '#06C755' }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
            作成
          </button>
        </div>
      </div>
    </div>
  )
}

// areas 数からレイアウトタイプを推定 (line_rich_menus.layout_type 用)
function deriveLayoutType(menu) {
  const len = menu?.areas?.length || 1
  if (len === 6) return '2x3'
  if (len === 3) return '1x3'
  if (len === 2) return '1x2'
  return '1x1'
}

// エリアアクションを LINE API形式に変換
function buildAction(area) {
  if (!area) return { type: 'message', text: 'no action', label: 'エリア' }
  const label = area.label || undefined
  if (area.type === 'uri') {
    return { type: 'uri', label, uri: area.uri || 'https://example.com' }
  }
  if (area.type === 'postback') {
    return { type: 'postback', label, data: area.data || 'action=default', displayText: area.displayText || undefined }
  }
  return { type: 'message', label, text: area.text || area.label || 'メッセージ' }
}
