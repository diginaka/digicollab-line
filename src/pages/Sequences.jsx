import { useState } from 'react'
import { Plus, Play, Pause, Clock, MessageSquare, Zap, ChevronDown, Trash2 } from 'lucide-react'
import { demoSequences } from '../lib/demoData'

const TRIGGER_LABELS = {
  friend_added: '友だち追加時',
  tag_added: 'タグ追加時',
  purchase_completed: '購入完了時',
  keyword_match: 'キーワード一致',
}

export default function Sequences() {
  const [sequences, setSequences] = useState(demoSequences)
  const [selected, setSelected] = useState(demoSequences[0])

  const toggle = (id) => {
    const next = sequences.map((s) => s.id === id ? { ...s, isActive: !s.isActive } : s)
    setSequences(next)
    if (selected?.id === id) setSelected(next.find((s) => s.id === id))
  }

  return (
    <div className="p-6 max-w-7xl mx-auto" data-page="sequences">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* シーケンス一覧 */}
        <div className="lg:col-span-1 space-y-3">
          <button
            className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-600 hover:border-green-500 hover:text-green-600"
            data-add-sequence
          >
            <Plus className="w-4 h-4" /> 新しいシーケンスを作成
          </button>
          {sequences.map((seq) => (
            <button
              key={seq.id}
              onClick={() => setSelected(seq)}
              className={`w-full text-left bg-white rounded-xl border p-4 transition ${
                selected?.id === seq.id ? 'border-green-500 ring-2 ring-green-100' : 'border-slate-200 hover:border-slate-300'
              }`}
              data-sequence-card
            >
              <div className="flex items-start justify-between mb-2">
                <div className="font-bold text-slate-800 text-sm">{seq.name}</div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                  seq.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {seq.isActive ? '稼働中' : '停止中'}
                </span>
              </div>
              <div className="text-xs text-slate-500 mb-2">{seq.description}</div>
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <Zap className="w-3 h-3" />
                {TRIGGER_LABELS[seq.triggerType]}
                <span className="ml-auto">{seq.steps.length}ステップ</span>
              </div>
            </button>
          ))}
        </div>

        {/* ステップビルダー */}
        {selected && (
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-5 pb-4 border-b border-slate-200">
              <div>
                <div className="font-bold text-slate-800">{selected.name}</div>
                <div className="text-xs text-slate-500 mt-1">{selected.description}</div>
              </div>
              <button
                onClick={() => toggle(selected.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold ${
                  selected.isActive ? 'bg-slate-100 text-slate-700' : 'text-white'
                }`}
                style={selected.isActive ? {} : { backgroundColor: '#06C755' }}
              >
                {selected.isActive ? <><Pause className="w-4 h-4" /> 停止</> : <><Play className="w-4 h-4" /> 開始</>}
              </button>
            </div>

            {/* トリガーノード */}
            <div className="flex justify-center mb-2">
              <div className="px-4 py-2 rounded-full text-white text-sm font-bold flex items-center gap-2" style={{ backgroundColor: '#06C755' }}>
                <Zap className="w-4 h-4" /> トリガー: {TRIGGER_LABELS[selected.triggerType]}
              </div>
            </div>

            {/* ステップ */}
            {selected.steps.map((step, i) => (
              <div key={i} className="flex flex-col items-center">
                <div className="w-0.5 h-6 bg-slate-300" />
                {step.delayMinutes > 0 && (
                  <>
                    <div className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {formatDelay(step.delayMinutes)}後
                    </div>
                    <div className="w-0.5 h-6 bg-slate-300" />
                  </>
                )}
                <div className="w-full max-w-md bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="w-4 h-4 text-slate-400" />
                    <span className="text-xs font-bold text-slate-600">ステップ {step.order}</span>
                    <button className="ml-auto text-slate-400 hover:text-red-500">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="text-sm text-slate-700 whitespace-pre-wrap">{step.messageContent}</div>
                </div>
              </div>
            ))}

            {/* ステップ追加ボタン */}
            <div className="flex flex-col items-center mt-4">
              <div className="w-0.5 h-4 bg-slate-300" />
              <button className="px-4 py-2 border-2 border-dashed border-slate-300 rounded-lg text-sm text-slate-500 hover:border-green-500 hover:text-green-600 flex items-center gap-1">
                <Plus className="w-4 h-4" /> ステップを追加
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function formatDelay(minutes) {
  if (minutes < 60) return `${minutes}分`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}時間`
  return `${Math.floor(minutes / 1440)}日`
}
