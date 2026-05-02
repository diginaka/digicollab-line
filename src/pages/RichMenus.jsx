import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Star, Smartphone, LayoutGrid, Loader2, X, Upload, Trash2,
  CheckCircle2, AlertCircle, Image as ImageIcon,
} from 'lucide-react'
import { demoRichMenus } from '../lib/demoData'
import { richMenuProxy } from '../lib/lineProxy'
import { resolveConnectionId } from '../lib/supabase'

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

  // 作成モーダル
  const [createOpen, setCreateOpen] = useState(false)
  const [toast, setToast] = useState(null)

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

      showToast('リッチメニューを作成しました')
      setCreateOpen(false)
      loadMenus()
    } catch (err) {
      showToast(err.message || '作成失敗', false)
    } finally {
      setLoading(false)
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
              <div>
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
function CreateModal({ onClose, onCreate, loading }) {
  const [name, setName] = useState('')
  const [chatBarText, setChatBarText] = useState('メニュー')
  const [layout, setLayout] = useState('2x3')
  const [areas, setAreas] = useState(() =>
    Array(6).fill(null).map(() => ({ type: 'uri', label: '', uri: '', text: '', data: '', displayText: '' }))
  )
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)

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
    onCreate({ name, chatBarText, layout, areas, imageFile })
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
