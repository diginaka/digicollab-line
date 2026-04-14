// LINE Messaging API ラッパー（互換レイヤー）
// 実際のHTTP呼び出しは lineProxy.js の中継サーバー経由で行う（CORS回避）。
// 既存コードとの互換のため、成功時は data を直接返し、
// 失敗時は例外を投げる昔ながらのインターフェースを維持する。

import * as proxy from './lineProxy'

function unwrap(result) {
  if (result && result.success) return result.data
  throw new Error(result?.error || 'LINE API 呼び出しに失敗しました')
}

// 接続テスト: bot情報取得
export async function getBotInfo(token) {
  return unwrap(await proxy.getBotInfo(token))
}

// 友だち数取得（日別）
export async function getFollowersCount(token, date) {
  return unwrap(await proxy.getNumberOfFollowers(token, date))
}

// 送信済みメッセージ数取得
export async function getSentMessagesCount(token, date) {
  return unwrap(await proxy.getNumberOfMessageDeliveries(token, date))
}

// 残メッセージ配信可能数
export async function getMessageQuotaConsumption(token) {
  return unwrap(await proxy.getMessageQuotaConsumption(token))
}

export async function getMessageQuota(token) {
  return unwrap(await proxy.getMessageQuota(token))
}

// 友だちID一覧
export async function getFollowerIds(token, continuationToken) {
  return unwrap(await proxy.getFollowers(token, 1000, continuationToken))
}

// 友だちプロフィール
export async function getUserProfile(token, userId) {
  return unwrap(await proxy.getProfile(token, userId))
}

// プッシュメッセージ（個別）
export async function pushMessage(token, to, messages) {
  return unwrap(await proxy.pushMessage(token, to, messages))
}

// マルチキャスト（一斉配信、最大500人/リクエスト）
export async function multicast(token, to, messages) {
  return unwrap(await proxy.sendMulticast(token, to, messages))
}

// ブロードキャスト（全友だち一斉）
export async function broadcast(token, messages) {
  return unwrap(await proxy.sendBroadcast(token, messages))
}

// リッチメニュー一覧
export async function listRichMenus(token) {
  return unwrap(await proxy.getRichMenuList(token))
}
