import { useState } from 'react'
import { Send, Calendar, Plus } from 'lucide-react'
import { demoBroadcasts, demoFriends, getTagColor, demoStats } from '../lib/demoData'

export default function Broadcasts() {
  const [showCreate, setShowCreate] = useState(false)
  const [selectedTags, setSelectedTags] = useState([])
  const [message, setMessage] = useState('今月限定のお得なキャンペーンのご案内です🎉\n本日よりスタート！')
  const [sendMode, setSendMode] = useState('now')
  const [scheduledAt, setScheduledAt] = useState('')

  const allTags = Array.from(new Set(demoFriends.flatMap((f) => f.tags)))
  const targetCount = demoFriends.filter((f) => !selectedTags.length || f.tags.some((t) => selectedTags.includes(t))).length

  const remaining = demoStats.quota - demoStats.sentThisMonth
  const percent = (demoStats.sentThisMonth / demoStats.quota) * 100

  const toggleTag = (t) => {
    setSelectedTags(selectedTags.includes(t) ? selectedTags.filter((x) => x !== t) : [...selectedTags, t])
  }

  return (
    <div className="p-6 max-w-7xl mx-auto" data-page="broadcasts">
      {/* 残数バー */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-bold text-slate-700">LINE無料プラン残数</div>
          <div className="text-sm text-slate-600">
            {demoStats.sentThisMonth} / {demoStats.quota}通 (残り{remaining}通)
          </div>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full transition-all" style={{ width: `${percent}%`, backgroundColor: percent > 80 ? '#ef4444' : '#06C755' }} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 配信作成 */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5" data-broadcast-create>
          <h3 className="font-bold text-slate-800 mb-4">新しい配信を作成</h3>

          <div className="mb-4">
            <label className="block text-xs font-bold text-slate-600 mb-2">対象タグ</label>
            <div className="flex flex-wrap gap-2">
              {allTags.map((t) => (
                <button
                  key={t}
                  onClick={() => toggleTag(t)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition ${
                    selectedTags.includes(t) ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="text-xs text-slate-500 mt-2">対象: 約{targetCount}人</div>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-bold text-slate-600 mb-2">メッセージ本文</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-500 resize-none"
            />
            <div className="text-xs text-slate-400 mt-1">{message.length}/500文字</div>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-bold text-slate-600 mb-2">配信タイミング</label>
            <div className="flex gap-2">
              <button
                onClick={() => setSendMode('now')}
                className={`flex-1 py-2 rounded-lg text-sm border transition ${
                  sendMode === 'now' ? 'border-green-500 bg-green-50 text-green-700 font-bold' : 'border-slate-200 text-slate-600'
                }`}
              >
                今すぐ配信
              </button>
              <button
                onClick={() => setSendMode('schedule')}
                className={`flex-1 py-2 rounded-lg text-sm border transition ${
                  sendMode === 'schedule' ? 'border-green-500 bg-green-50 text-green-700 font-bold' : 'border-slate-200 text-slate-600'
                }`}
              >
                予約配信
              </button>
            </div>
            {sendMode === 'schedule' && (
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="mt-2 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            )}
          </div>

          <button
            className="w-full py-3 rounded-lg text-white font-bold flex items-center justify-center gap-2 hover:opacity-90"
            style={{ backgroundColor: '#06C755' }}
          >
            {sendMode === 'now' ? <><Send className="w-4 h-4" /> 今すぐ配信する</> : <><Calendar className="w-4 h-4" /> 予約を登録</>}
          </button>
        </div>

        {/* LINEプレビュー */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-bold text-slate-800 mb-4 text-sm">プレビュー</h3>
          <div className="line-chat-bg rounded-xl p-4 min-h-[300px]">
            <div className="flex gap-2 items-start">
              <div className="w-8 h-8 rounded-full bg-white/80 shrink-0" />
              <div>
                <div className="text-[10px] text-white/90 mb-1 ml-1">あなたの公式アカウント</div>
                <div className="line-bubble">{message || 'メッセージ本文がここに表示されます'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 配信履歴 */}
      <div className="mt-6 bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-bold text-slate-800 mb-3">配信履歴</h3>
        <div className="space-y-2">
          {demoBroadcasts.map((b) => (
            <div key={b.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 border border-slate-100">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-slate-800 truncate">{b.name}</div>
                <div className="flex items-center gap-2 mt-1">
                  {b.targetTags.map((t) => (
                    <span key={t} className={`text-[10px] px-2 py-0.5 rounded-full border ${getTagColor(t)}`}>{t}</span>
                  ))}
                </div>
              </div>
              <div className="text-right shrink-0 ml-3">
                <div className="text-xs text-slate-500">{b.sentAt || b.scheduledAt}</div>
                <div className="flex items-center gap-2 mt-1 justify-end">
                  <span className="text-xs text-slate-600">{b.totalSent}人</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                    b.status === 'sent' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {b.status === 'sent' ? '配信済' : '予約中'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
