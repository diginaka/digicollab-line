import { useState, useCallback } from 'react'
import { useFlowContext } from '../hooks/useFlowContext'
import { useGeneratedContents } from '../hooks/useGeneratedContents'

// AI生成LINEメッセージのコピーバー
// FuseBase埋め込み時にfunnelIdが渡されると表示される
export function AIContentCopyBarLine() {
  const { funnelId, isEmbedded } = useFlowContext()
  const { contents, funnelName, patternName, loading } = useGeneratedContents(funnelId, 'line')
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [copied, setCopied] = useState(false)

  if (!isEmbedded || contents.length === 0) return null

  const selected = selectedIndex >= 0 ? contents[selectedIndex] : null

  const handleCopy = useCallback(async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [])

  if (loading) {
    return (
      <div className="bg-green-50 border-b border-green-200 px-4 py-2 text-sm text-green-600">
        AI生成コンテンツを読み込み中...
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-b border-green-200 shrink-0">
      {/* プルダウンバー */}
      <div className="px-4 py-3 flex items-center gap-3">
        <span className="text-lg">💬</span>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
              AI生成
            </span>
            {funnelName && (
              <span className="text-xs text-gray-500">{funnelName}</span>
            )}
            {patternName && (
              <span className="text-xs text-gray-400">/ {patternName}</span>
            )}
          </div>
          <select
            value={selectedIndex}
            onChange={(e) => setSelectedIndex(Number(e.target.value))}
            className="w-full bg-white border border-green-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-green-400 cursor-pointer"
          >
            <option value={-1}>▼ コピーするメッセージを選択...</option>
            {contents.map((item, idx) => (
              <option key={item.id} value={idx}>
                ステップ{item.step_number}: {
                  item.step_label ||
                  (item.body.length > 35
                    ? item.body.substring(0, 35) + '...'
                    : item.body)
                }
                {item.metadata?.delay_days
                  ? ` (${item.metadata.delay_days}日後)`
                  : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* プレビューエリア（LINE風吹き出し） */}
      {selected && (
        <div className="px-4 pb-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* メッセージプレビュー */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-gray-500">
                  ステップ {selected.step_number} メッセージ
                </span>
                <button
                  onClick={() => handleCopy(selected.body)}
                  className={`text-xs px-3 py-1 rounded-full font-medium transition-all ${
                    copied
                      ? 'bg-green-100 text-green-700'
                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                  }`}
                >
                  {copied ? '✓ コピー済み' : 'メッセージをコピー'}
                </button>
              </div>

              {/* LINE風吹き出し */}
              <div className="flex justify-start">
                <div className="bg-[#E8F5E9] rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%]">
                  <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">
                    {selected.body}
                  </pre>
                </div>
              </div>
            </div>

            {/* メタ情報 + ナビ */}
            <div className="bg-gray-50 border-t border-gray-100 px-4 py-2 flex items-center gap-4">
              <span className="text-xs text-gray-400">
                {selected.step_number} / {contents.length} ステップ
              </span>
              {selected.metadata?.delay_days !== undefined && (
                <span className="text-xs text-gray-400">
                  配信: {selected.metadata.delay_days === 0
                    ? '友だち追加時'
                    : `${selected.metadata.delay_days}日後`}
                </span>
              )}
              <div className="ml-auto flex gap-1">
                <button
                  disabled={selectedIndex <= 0}
                  onClick={() => setSelectedIndex(selectedIndex - 1)}
                  className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-600 hover:bg-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ← 前
                </button>
                <button
                  disabled={selectedIndex >= contents.length - 1}
                  onClick={() => setSelectedIndex(selectedIndex + 1)}
                  className="text-xs px-3 py-1 rounded bg-gray-200 text-gray-600 hover:bg-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  次 →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
