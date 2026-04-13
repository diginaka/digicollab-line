import { useState } from 'react'
import { Plus, Star, Smartphone } from 'lucide-react'
import { demoRichMenus, getTagColor } from '../lib/demoData'

export default function RichMenus() {
  const [selected, setSelected] = useState(demoRichMenus[0])

  return (
    <div className="p-6 max-w-7xl mx-auto" data-page="richmenus">
      {/* 自動切替案内 */}
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-4">
        <div className="text-sm text-purple-900">
          <strong>💡 タグベース自動切替:</strong> n8nと連携すると、友だちのタグに応じてリッチメニューを自動切替できます（プロデューサー以上）
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* メニュー一覧 */}
        <div className="lg:col-span-2 space-y-3">
          <button
            className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-600 hover:border-green-500 hover:text-green-600"
            data-add-richmenu
          >
            <Plus className="w-4 h-4" /> 新しいメニューを作成
          </button>

          {demoRichMenus.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelected(m)}
              className={`w-full text-left bg-white rounded-xl border p-4 transition ${
                selected?.id === m.id ? 'border-green-500 ring-2 ring-green-100' : 'border-slate-200 hover:border-slate-300'
              }`}
              data-richmenu-card
            >
              <div className="flex items-start justify-between mb-2">
                <div className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                  {m.name}
                  {m.isDefault && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                  m.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {m.isActive ? '有効' : '無効'}
                </span>
              </div>
              <div className="text-xs text-slate-500 mb-2">レイアウト: {m.layoutType}</div>
              <div className="flex flex-wrap gap-1">
                {m.targetTags.map((t) => (
                  <span key={t} className={`text-[10px] px-2 py-0.5 rounded-full border ${getTagColor(t)}`}>{t}</span>
                ))}
              </div>
            </button>
          ))}
        </div>

        {/* プレビュー + 設定 */}
        {selected && (
          <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Smartphone className="w-4 h-4 text-slate-400" />
              <h3 className="font-bold text-slate-800">LINE表示プレビュー</h3>
            </div>

            {/* iPhoneフレーム */}
            <div className="max-w-[280px] mx-auto mb-5">
              <div className="border-4 border-slate-800 rounded-[32px] overflow-hidden bg-slate-800">
                <div className="line-chat-bg h-32 flex items-end p-2">
                  <div className="line-bubble text-xs">こんにちは！下のメニューから選んでください👇</div>
                </div>
                <div className="bg-white">
                  <div className="grid grid-cols-3 gap-px bg-slate-200">
                    {selected.areas.map((a, i) => (
                      <div key={i} className="bg-white p-3 text-center text-[10px] font-bold text-slate-700 aspect-[4/3] flex items-center justify-center">
                        {a.label}
                      </div>
                    ))}
                  </div>
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
                      <div className="text-sm font-medium text-slate-800 truncate">{a.label}</div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {a.action.type === 'uri' ? `🔗 ${a.action.uri}` : `💬 ${a.action.text}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
