import { useState, useEffect } from 'react'

// FuseBase埋め込み時のファネルコンテキストを取得するhook
// 親ウィンドウからpostMessageでfunnelIdなどが渡される想定
export function useFlowContext() {
  const [context, setContext] = useState({
    funnelId: null,
    isEmbedded: false,
  })

  useEffect(() => {
    // iframe内かどうかを判定
    const embedded = window !== window.top

    // URLパラメータからfunnelIdを取得
    const params = new URLSearchParams(window.location.search)
    const funnelIdFromUrl = params.get('funnelId')

    if (funnelIdFromUrl) {
      setContext({ funnelId: funnelIdFromUrl, isEmbedded: embedded })
      return
    }

    // postMessageでfunnelIdを受け取る
    function handleMessage(e) {
      if (e.data?.type === 'flow-context' && e.data.funnelId) {
        setContext({ funnelId: e.data.funnelId, isEmbedded: true })
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  return context
}
