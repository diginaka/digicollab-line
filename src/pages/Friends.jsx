import { useState } from 'react'
import { Search, X, Mail, CreditCard, Send, Tag } from 'lucide-react'
import { demoFriends, getTagColor } from '../lib/demoData'

export default function Friends() {
  const [query, setQuery] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [selected, setSelected] = useState(null)

  const allTags = Array.from(new Set(demoFriends.flatMap((f) => f.tags)))

  const filtered = demoFriends.filter((f) => {
    const matchQ = !query || f.displayName.includes(query)
    const matchT = !tagFilter || f.tags.includes(tagFilter)
    return matchQ && matchT
  })

  return (
    <div className="p-6 max-w-7xl mx-auto" data-page="friends">
      {/* 検索バー */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="友だちを名前で検索..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-500"
              data-friend-search
            />
          </div>
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-500"
            data-tag-filter
          >
            <option value="">すべてのタグ</option>
            {allTags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="mt-2 text-xs text-slate-500">
          {filtered.length}人 / 全{demoFriends.length}人
        </div>
      </div>

      {/* 友だちリスト */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" data-friend-list>
        {filtered.map((f) => (
          <button
            key={f.userId}
            onClick={() => setSelected(f)}
            className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 border-b border-slate-100 last:border-0 text-left"
          >
            <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600 shrink-0">
              {f.displayName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-slate-800 truncate">{f.displayName}</div>
              <div className="text-xs text-slate-500 truncate">{f.statusMessage || 'ステータスなし'}</div>
            </div>
            <div className="flex flex-wrap gap-1 justify-end">
              {f.tags.slice(0, 2).map((t) => (
                <span key={t} className={`text-[10px] px-2 py-0.5 rounded-full border ${getTagColor(t)}`}>{t}</span>
              ))}
              {f.tags.length > 2 && <span className="text-[10px] text-slate-400">+{f.tags.length - 2}</span>}
            </div>
          </button>
        ))}
      </div>

      {/* 詳細パネル */}
      {selected && (
        <div className="fixed inset-0 bg-black/30 z-40 flex justify-end" onClick={() => setSelected(null)}>
          <div className="bg-white w-full max-w-md h-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">友だち詳細</h3>
              <button onClick={() => setSelected(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center text-2xl font-bold text-slate-600">
                  {selected.displayName.charAt(0)}
                </div>
                <div>
                  <div className="font-bold text-lg">{selected.displayName}</div>
                  <div className="text-xs text-slate-500">{selected.statusMessage || 'ステータスメッセージなし'}</div>
                </div>
              </div>

              {/* タグ */}
              <div className="mb-5">
                <div className="flex items-center gap-1 text-xs font-bold text-slate-600 mb-2">
                  <Tag className="w-3 h-3" /> タグ
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selected.tags.map((t) => (
                    <span key={t} className={`text-xs px-2 py-1 rounded-full border ${getTagColor(t)}`}>{t}</span>
                  ))}
                </div>
              </div>

              {/* 連携情報 */}
              <div className="mb-5 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-600">{selected.email || '未連携'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CreditCard className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-600">{selected.stripeCustomerId || '未連携'}</span>
                </div>
              </div>

              {/* アクション */}
              <button
                className="w-full py-2.5 rounded-lg text-white font-bold flex items-center justify-center gap-2 hover:opacity-90"
                style={{ backgroundColor: '#06C755' }}
              >
                <Send className="w-4 h-4" /> メッセージを送る
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
