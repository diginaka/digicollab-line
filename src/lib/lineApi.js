// LINE Messaging API ラッパー
// ユーザー自身のChannel Access Tokenを使って直接呼び出す（BYOK）
// CORS制限がある場合はSupabase Edge Function / n8n Webhook中継を検討

const LINE_API_BASE = 'https://api.line.me/v2/bot'

async function lineFetch(token, path, options = {}) {
  const res = await fetch(LINE_API_BASE + path, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`LINE API ${res.status}: ${text || res.statusText}`)
  }
  return res.status === 204 ? null : res.json()
}

// 接続テスト: bot情報取得
export function getBotInfo(token) {
  return lineFetch(token, '/info')
}

// 友だち数取得（日別）
export function getFollowersCount(token, date) {
  return lineFetch(token, `/insight/followers?date=${date}`)
}

// 送信済みメッセージ数取得
export function getSentMessagesCount(token, date) {
  return lineFetch(token, `/insight/message/delivery?date=${date}`)
}

// 残メッセージ配信可能数
export function getMessageQuotaConsumption(token) {
  return lineFetch(token, '/message/quota/consumption')
}

export function getMessageQuota(token) {
  return lineFetch(token, '/message/quota')
}

// 友だちID一覧
export async function getFollowerIds(token, continuationToken) {
  const q = continuationToken ? `?start=${continuationToken}` : ''
  return lineFetch(token, `/followers/ids${q}`)
}

// 友だちプロフィール
export function getUserProfile(token, userId) {
  return lineFetch(token, `/profile/${userId}`)
}

// プッシュメッセージ（個別）
export function pushMessage(token, to, messages) {
  return lineFetch(token, '/message/push', {
    method: 'POST',
    body: JSON.stringify({ to, messages }),
  })
}

// マルチキャスト（一斉配信、最大500人/リクエスト）
export function multicast(token, to, messages) {
  return lineFetch(token, '/message/multicast', {
    method: 'POST',
    body: JSON.stringify({ to, messages }),
  })
}

// ブロードキャスト（全友だち一斉）
export function broadcast(token, messages) {
  return lineFetch(token, '/message/broadcast', {
    method: 'POST',
    body: JSON.stringify({ messages }),
  })
}

// リッチメニュー一覧
export function listRichMenus(token) {
  return lineFetch(token, '/richmenu/list')
}
