// LINE API 汎用プロキシ
// ブラウザからLINE APIを直接呼ぶとCORS制限があるため、
// 中継サーバー経由で呼び出す。
//
// 使い方:
//   import { getFollowers, sendBroadcast } from './lineProxy'
//   const r = await getFollowers(token)
//   if (r.success) { ... r.data ... }

// 環境変数が未設定でもデフォルト値で動作するようにハードコード
const PROXY_BASE = import.meta.env.VITE_N8N_WEBHOOK_BASE || 'https://n8n.digicollabo.com'
const PROXY_URL = `${PROXY_BASE}/webhook/dc-line-proxy`

/**
 * @param {{ token: string, method: 'GET'|'POST'|'PUT'|'DELETE', endpoint: string, body?: any }} request
 * @returns {Promise<{ success: boolean, data?: any, error?: string }>}
 */
export async function callLineApi(request) {
  try {
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: request.token,
        method: request.method,
        endpoint: request.endpoint,
        body: request.body,
      }),
    })
    if (!response.ok) {
      return { success: false, error: `通信エラー (${response.status})` }
    }
    return await response.json()
  } catch (err) {
    return { success: false, error: err.message || '通信エラーが発生しました' }
  }
}

// ==== リッチメニュー専用中継 (WF-LINE-RICHMENU) ====
// POST /webhook/dc-line-richmenu
// action: list | create | upload_image | set_default | cancel_default | delete
const RICHMENU_URL = `${PROXY_BASE}/webhook/dc-line-richmenu`

export async function richMenuProxy(connectionId, action, params = {}) {
  try {
    const res = await fetch(RICHMENU_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connection_id: connectionId,
        action,
        ...params,
      }),
    })
    if (!res.ok) {
      return { status: 'failed', error: `HTTP ${res.status}` }
    }
    return await res.json()
  } catch (err) {
    return { status: 'failed', error: err.message || '通信エラー' }
  }
}

// ==== 一斉配信専用中継 (WF-LINE-BROADCAST) ====
// POST /webhook/dc-line-broadcast
// n8n側で line_connections からトークン取得 → LINE Broadcast/Multicast API呼出し
const BROADCAST_URL = `${PROXY_BASE}/webhook/dc-line-broadcast`

/**
 * @param {{ connectionId: string, message: string, broadcast: boolean, recipients?: string[] }} params
 * @returns {Promise<{ status: 'sent'|'failed', type: string, recipientCount: number|string, httpStatus?: number, error?: string }>}
 */
export async function sendBroadcastViaProxy({ connectionId, message, broadcast, recipients }) {
  try {
    const payload = {
      connection_id: connectionId,
      message,
      broadcast: Boolean(broadcast),
    }
    if (!broadcast) {
      payload.recipients = recipients || []
    }
    const res = await fetch(BROADCAST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      return { status: 'failed', error: `HTTP ${res.status}` }
    }
    return await res.json()
  } catch (err) {
    return { status: 'failed', error: err.message || '通信エラー' }
  }
}

// ==== 便利関数 ====

export function getBotInfo(token) {
  return callLineApi({ token, method: 'GET', endpoint: '/v2/bot/info' })
}

export function getFollowers(token, limit = 1000, start) {
  const endpoint = start
    ? `/v2/bot/followers/ids?limit=${limit}&start=${start}`
    : `/v2/bot/followers/ids?limit=${limit}`
  return callLineApi({ token, method: 'GET', endpoint })
}

export function getProfile(token, userId) {
  return callLineApi({ token, method: 'GET', endpoint: `/v2/bot/profile/${userId}` })
}

export function sendMulticast(token, userIds, messages) {
  return callLineApi({
    token,
    method: 'POST',
    endpoint: '/v2/bot/message/multicast',
    body: { to: userIds, messages },
  })
}

export function sendBroadcast(token, messages) {
  return callLineApi({
    token,
    method: 'POST',
    endpoint: '/v2/bot/message/broadcast',
    body: { messages },
  })
}

export function pushMessage(token, to, messages) {
  return callLineApi({
    token,
    method: 'POST',
    endpoint: '/v2/bot/message/push',
    body: { to, messages },
  })
}

export function getMessageQuota(token) {
  return callLineApi({ token, method: 'GET', endpoint: '/v2/bot/message/quota' })
}

export function getMessageQuotaConsumption(token) {
  return callLineApi({ token, method: 'GET', endpoint: '/v2/bot/message/quota/consumption' })
}

// リッチメニュー
export function getRichMenuList(token) {
  return callLineApi({ token, method: 'GET', endpoint: '/v2/bot/richmenu/list' })
}

export function getRichMenu(token, richMenuId) {
  return callLineApi({ token, method: 'GET', endpoint: `/v2/bot/richmenu/${richMenuId}` })
}

export function createRichMenu(token, menuData) {
  return callLineApi({ token, method: 'POST', endpoint: '/v2/bot/richmenu', body: menuData })
}

export function deleteRichMenu(token, richMenuId) {
  return callLineApi({ token, method: 'DELETE', endpoint: `/v2/bot/richmenu/${richMenuId}` })
}

export function setDefaultRichMenu(token, richMenuId) {
  return callLineApi({
    token,
    method: 'POST',
    endpoint: `/v2/bot/user/all/richmenu/${richMenuId}`,
  })
}

export function getDefaultRichMenu(token) {
  return callLineApi({ token, method: 'GET', endpoint: '/v2/bot/user/all/richmenu' })
}

// ※ リッチメニュー画像アップロード（/v2/bot/richmenu/{id}/content）は
//    バイナリ送信のため本プロキシでは未対応。別途対応が必要です。

// Insight（統計）
export function getNumberOfFollowers(token, date) {
  // date format: yyyyMMdd
  return callLineApi({ token, method: 'GET', endpoint: `/v2/bot/insight/followers?date=${date}` })
}

export function getNumberOfMessageDeliveries(token, date) {
  return callLineApi({
    token,
    method: 'GET',
    endpoint: `/v2/bot/insight/message/delivery?date=${date}`,
  })
}
