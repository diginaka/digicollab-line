#!/usr/bin/env node
/**
 * verify:line-no-plaintext — 旧 SPA が平文 Channel Access Token を localStorage(at-rest) に
 * 残さないことを確定的に検証する（SE-5 A-2a）。
 *
 * 出典 AC:
 *   AC-1: localStorage(LS_PREFIX+connection) に channelAccessToken が残らない
 *         （新規保存されず・既存は purge）。
 *   AC-2/AC-3 は接続判定・送信経路の話で App.jsx 側の結線（isConnected 判定 / fb-line-write 経由）。
 *         本 verify は AC-1（at-rest 撤去）の機械検証に専念する。
 *
 * 設計: connectionStorage.js の純関数（sanitize / purge）と、Map ベースの偽 localStore で
 *        「保存後の serialized 文字列に channelAccessToken が現れない」ことを走査アサートする。
 *        jsdom/ブラウザ非依存（決定的・exit code）。
 */

import {
  sanitizeConnectionForStorage,
  purgePlaintextToken,
  PLAINTEXT_TOKEN_FIELD,
  CONNECTION_STORE_KEY,
} from '../src/lib/connectionStorage.js';

let failed = 0;
function assert(cond, label) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

// 実アプリ（supabase.js）の localStore を模した Map バック実装（LS_PREFIX 付与含む）。
function makeFakeStore() {
  const LS_PREFIX = 'digicollab_line_';
  const raw = new Map();
  return {
    raw,
    has(key) {
      return raw.has(LS_PREFIX + key);
    },
    serialized(key) {
      return raw.get(LS_PREFIX + key);
    },
    get(key, fallback) {
      const v = raw.get(LS_PREFIX + key);
      return v === undefined ? fallback : JSON.parse(v);
    },
    set(key, value) {
      raw.set(LS_PREFIX + key, JSON.stringify(value));
    },
  };
}

const SAMPLE = {
  channelAccessToken: 'SECRET_PLAINTEXT_TOKEN_should_never_persist',
  isConnected: true,
  botName: 'My Bot',
  channelId: '123',
  n8nWebhookUrl: 'https://n8n.example/webhook',
};

console.log('unit: sanitize / purge');
{
  const out = sanitizeConnectionForStorage(SAMPLE);
  assert(!(PLAINTEXT_TOKEN_FIELD in out), 'sanitize は channelAccessToken を除去する');
  assert(out.isConnected === true && out.botName === 'My Bot', 'sanitize は他メタ（isConnected/botName）を保持する');
  assert(SAMPLE.channelAccessToken === 'SECRET_PLAINTEXT_TOKEN_should_never_persist', 'sanitize は入力を破壊しない（純関数）');
}

console.log('purge: 既存 localStorage の後方互換クリーンアップ');
{
  const store = makeFakeStore();
  store.set(CONNECTION_STORE_KEY, SAMPLE); // レガシー: 平文トークン入りで保存済み
  assert(store.serialized(CONNECTION_STORE_KEY).includes('SECRET_PLAINTEXT_TOKEN'), '前提: purge 前は平文が serialized に存在する');

  const did = purgePlaintextToken(store);
  assert(did === true, '平文トークンを含むとき purge は true を返す');
  assert(!store.serialized(CONNECTION_STORE_KEY).includes('SECRET_PLAINTEXT_TOKEN'), 'AC-1: purge 後の serialized に平文トークンが残らない');
  assert(!store.serialized(CONNECTION_STORE_KEY).includes(PLAINTEXT_TOKEN_FIELD), 'AC-1: purge 後の serialized に channelAccessToken キー自体が無い');
  assert(store.get(CONNECTION_STORE_KEY).isConnected === true, 'purge 後も接続メタ（isConnected）は保持される');

  const again = purgePlaintextToken(store);
  assert(again === false, '冪等: 2 回目の purge は no-op（false）');
}

console.log('load+persist: App.jsx の読み込み・保存経路の再現');
{
  const store = makeFakeStore();
  store.set(CONNECTION_STORE_KEY, SAMPLE); // レガシー状態から起動

  // App initializer 相当: purge → sanitize マージ
  purgePlaintextToken(store);
  const EMPTY = { channelAccessToken: '', isConnected: false, botName: '' };
  const loaded = { ...EMPTY, ...sanitizeConnectionForStorage(store.get(CONNECTION_STORE_KEY, EMPTY)) };
  assert(loaded.channelAccessToken === '', 'メモリ上 connection.channelAccessToken は空（Dashboard/Broadcasts の demo ガードが効く）');
  assert(loaded.isConnected === true, 'メモリ上 isConnected はサーバ由来状態を保持（誤「未接続」を増やさない）');

  // persist effect 相当: サニタイズして保存（仮にトークンが混入しても除去される）
  store.set(CONNECTION_STORE_KEY, sanitizeConnectionForStorage({ ...loaded, channelAccessToken: 'leak?' }));
  assert(!store.serialized(CONNECTION_STORE_KEY).includes('channelAccessToken'), 'AC-1: 保存経路は常にサニタイズ＝トークンを新規保存しない');
}

console.log('');
if (failed === 0) {
  console.log('✓ verify:line-no-plaintext PASS — 平文 Channel Access Token は localStorage(at-rest) に残らない。');
  process.exit(0);
}
console.error(`✗ verify:line-no-plaintext FAIL — ${failed} 件の不一致。`);
process.exit(1);
