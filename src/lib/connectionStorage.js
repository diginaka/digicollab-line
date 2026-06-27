// SE-5 A-2a: 平文 Channel Access Token をブラウザ at-rest に残さないための純関数群。
//
// 背景:
//   旧 SPA は connection（channelAccessToken を含む）を localStorage に永続化し、
//   そこからクライアントで LINE Messaging API を直接呼んでいた（平文トークンの at-rest 保持）。
//   トークンは統合ツール設定（ハブ）で暗号化管理され、送信は fb-line-write（server 復号）経由に
//   集約済み（#14）。よってブラウザに平文トークンを残す必要はない。
//
//   本モジュールは「保存前のサニタイズ」と「既存 localStorage の一度きり purge」を
//   副作用のない純関数として提供し、App / verify から共通利用する（テスト容易性のため localStore は引数注入）。

// localStorage に残してはならない平文フィールド。
export const PLAINTEXT_TOKEN_FIELD = 'channelAccessToken';

// localStorage の connection キー名（localStore は内部で LS_PREFIX を付与する）。
export const CONNECTION_STORE_KEY = 'connection';

/**
 * localStorage へ保存する前に平文トークンを除去する（メタのみ保存）。
 * @param {object|null} connection
 * @returns {object|null} channelAccessToken を持たない新オブジェクト（入力が非オブジェクトならそのまま返す）
 */
export function sanitizeConnectionForStorage(connection) {
  if (!connection || typeof connection !== 'object') return connection;
  // eslint 不在リポにつき分割代入で除外（残りメタのみ）。
  const { [PLAINTEXT_TOKEN_FIELD]: _omitToken, ...rest } = connection;
  return rest;
}

/**
 * 既存 localStorage の connection から平文トークンを一度だけ purge する（後方互換クリーンアップ）。
 * channelAccessToken を含む場合のみサニタイズ後の値で書き戻す。除去後は冪等（再実行で no-op）。
 * @param {{get:(k:string,f:any)=>any, set:(k:string,v:any)=>void}} localStore
 * @param {string} [key=CONNECTION_STORE_KEY]
 * @returns {boolean} purge を実行したら true
 */
export function purgePlaintextToken(localStore, key = CONNECTION_STORE_KEY) {
  const stored = localStore.get(key, null);
  if (stored && typeof stored === 'object' && PLAINTEXT_TOKEN_FIELD in stored) {
    localStore.set(key, sanitizeConnectionForStorage(stored));
    return true;
  }
  return false;
}
