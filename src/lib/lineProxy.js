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
 * 安全な JSON パース。
 * n8n webhook が空ボディ (204 等) や非JSONを返した場合に
 * `Unexpected end of JSON input` で画面が壊れるのを防ぐ。
 *
 * @param {Response} res
 * @returns {Promise<any|null>}
 */
async function safeJson(res) {
  // Content-Type を確認: JSON でなければパースしない (PNG/JPEG 等のバイナリ対策)
  const ct = res.headers.get('content-type') || ''
  if (ct && !ct.includes('json')) {
    return null
  }
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

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
      const errBody = await safeJson(response)
      return { success: false, error: errBody?.error || `通信エラー (${response.status})` }
    }
    const json = await safeJson(response)
    if (json == null) {
      // 空ボディは「成功だがデータ無し」として扱う (LINE API の 204 No Content 等)
      return { success: true, data: null }
    }
    // n8n WF が { success, data, error } 形式で返してくる前提
    if (typeof json === 'object' && 'success' in json) {
      return json
    }
    // 直接データを返してきた場合 (フォールバック)
    return { success: true, data: json }
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
      const errBody = await safeJson(res)
      return { status: 'failed', error: errBody?.error || `HTTP ${res.status}` }
    }
    const json = await safeJson(res)
    if (json == null) {
      // 空ボディ = 成功扱い (delete / set_default 系で n8n が 204 を返すケース)
      return { status: 'success', data: null }
    }
    // status 未指定なら 'success' とみなす (n8n WF が { data: ... } だけ返す場合のフォールバック)
    if (typeof json === 'object' && !('status' in json)) {
      return { status: 'success', data: json.data ?? json }
    }
    return json
  } catch (err) {
    return { status: 'failed', error: err.message || '通信エラー' }
  }
}

// ==== テスト送信専用中継 (WF-LINE-TEST) ====
// シーケンス画面から「テスト送信」ボタンで自分の LINE userId に
// 単発送信する用。n8n WF-LINE-TEST にルーティング。
//
// n8n 側仕様 (推定):
//   POST /webhook/dc-line-test
//   body: { connection_id, line_user_id, messages: [{ type, text|... }] }
//   返却: { status: 'sent'|'failed', error?: string }
//
// 未デプロイ時のフォールバック:
//   呼び出し側で response.status === 'failed' を検知して pushMessage に切り替え可能。
const TEST_SEND_URL = `${PROXY_BASE}/webhook/dc-line-test`

/**
 * @param {{ connectionId: string, lineUserId: string, messages: Array<object> }} params
 * @returns {Promise<{ status: 'sent'|'failed', error?: string }>}
 */
export async function lineTestSendProxy({ connectionId, lineUserId, messages }) {
  try {
    const res = await fetch(TEST_SEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connection_id: connectionId,
        line_user_id: lineUserId,
        messages,
      }),
    })
    if (!res.ok) {
      const errBody = await safeJson(res)
      return { status: 'failed', error: errBody?.error || `HTTP ${res.status}` }
    }
    const json = await safeJson(res)
    if (json == null) return { status: 'sent' }
    return json
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
      const errBody = await safeJson(res)
      return { status: 'failed', error: errBody?.error || `HTTP ${res.status}` }
    }
    const json = await safeJson(res)
    if (json == null) {
      return { status: 'sent', type: 'unknown', recipientCount: 0 }
    }
    return json
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
