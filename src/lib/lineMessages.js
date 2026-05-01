// Step 4: LINE 1:1 メッセージング フロント連携ヘルパ
// 受信側 (Step 2 WF-LINE-WH) と送信側 (Step 3 WF-LINE-REPLY) のフロント実装で使用。

import { supabase, isSupabaseMode } from './supabase'

const N8N_BASE = import.meta.env.VITE_N8N_WEBHOOK_BASE || 'https://n8n.digicollabo.com'
const REPLY_URL = `${N8N_BASE}/webhook/dc-line-reply`

const STORAGE_BUCKET = 'line-attachments'
const SIGNED_URL_TTL_SEC = 60 * 60 // 1 hour（フロント表示用、Phase 1）

/**
 * 会話一覧取得: connection 配下の line_friends + 各 friend の最新メッセージ + 未読件数
 *
 * Phase 1 はクライアント側で結合（友だち数が小規模前提）。
 * スケールする場合は RPC list_line_conversations を採用検討（migration 011 で定義済）。
 */
export async function fetchConversations(connectionId) {
  if (!isSupabaseMode || !supabase || !connectionId) {
    return { data: [], error: null }
  }

  // 1. line_friends 一覧（display_name / picture_url キャッシュ）
  const { data: friends, error: fErr } = await supabase
    .from('line_friends')
    .select('id, line_user_id, display_name, picture_url, fetched_at')
    .eq('connection_id', connectionId)
    .order('fetched_at', { ascending: false, nullsFirst: false })

  if (fErr) return { data: [], error: fErr }
  if (!friends || friends.length === 0) return { data: [], error: null }

  // 2. 各 friend の line_messages を一括取得（最新→古い）
  const lineUserIds = friends.map((f) => f.line_user_id)
  const { data: messages, error: mErr } = await supabase
    .from('line_messages')
    .select('line_user_id, message_type, text_content, direction, created_at, read_at')
    .eq('connection_id', connectionId)
    .in('line_user_id', lineUserIds)
    .order('created_at', { ascending: false })

  if (mErr) return { data: [], error: mErr }

  // 3. クライアント側で集約（最新1件 + 未読カウント）
  const conversations = friends.map((f) => {
    const userMessages = (messages || []).filter((m) => m.line_user_id === f.line_user_id)
    const last = userMessages[0] || null
    const unread = userMessages.filter((m) => m.direction === 'in' && !m.read_at).length
    return {
      ...f,
      last_message: last ? (last.text_content || `[${last.message_type}]`) : null,
      last_message_at: last?.created_at || null,
      last_direction: last?.direction || null,
      unread_count: unread,
    }
  })

  // 最新メッセージがある順（無いものは末尾）
  conversations.sort((a, b) => {
    if (!a.last_message_at && !b.last_message_at) return 0
    if (!a.last_message_at) return 1
    if (!b.last_message_at) return -1
    return new Date(b.last_message_at) - new Date(a.last_message_at)
  })

  return { data: conversations, error: null }
}

/**
 * 個別会話のメッセージ一覧（古い→新しい順）
 */
export async function fetchMessages(connectionId, lineUserId, limit = 200) {
  if (!isSupabaseMode || !supabase || !connectionId || !lineUserId) {
    return { data: [], error: null }
  }
  const { data, error } = await supabase
    .from('line_messages')
    .select(
      'id, direction, message_type, text_content, sticker_id, package_id, storage_path, send_method, send_error, sent_at, read_at, created_at'
    )
    .eq('connection_id', connectionId)
    .eq('line_user_id', lineUserId)
    .order('created_at', { ascending: true })
    .limit(limit)
  return { data: data || [], error }
}

/**
 * 既読化 RPC 呼び出し (migration 016)
 *   direction='in' AND read_at IS NULL の行を read_at=now() に更新。
 */
export async function markMessagesRead(connectionId, lineUserId) {
  if (!isSupabaseMode || !supabase || !connectionId || !lineUserId) {
    return { count: 0, error: null }
  }
  const { data, error } = await supabase.rpc('mark_line_messages_read', {
    p_connection_id: connectionId,
    p_line_user_id: lineUserId,
  })
  return { count: data || 0, error }
}

/**
 * Storage signed URL を生成（image/video 表示用）
 *   1時間 TTL（Phase 1）。失効時は再フェッチで再生成。
 *   storage RLS は connection 所有者のみ SELECT 可（migration 011 line_attachments_owner_read）。
 */
export async function getAttachmentSignedUrl(storagePath, ttlSec = SIGNED_URL_TTL_SEC) {
  if (!isSupabaseMode || !supabase || !storagePath) return null
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, ttlSec)
  if (error) {
    console.warn('[lineMessages.getAttachmentSignedUrl] failed:', error.message)
    return null
  }
  return data?.signedUrl || null
}

/**
 * WF-LINE-REPLY 経由で返信送信
 *
 *   POST https://n8n.digicollabo.com/webhook/dc-line-reply
 *   body: { connection_id, line_user_id, message_text, force_method }
 *   response: { status, send_method, line_message_id, send_error }
 */
export async function sendReply({ connectionId, lineUserId, messageText, forceMethod = 'auto' }) {
  try {
    const res = await fetch(REPLY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connection_id: connectionId,
        line_user_id: lineUserId,
        message_text: messageText,
        force_method: forceMethod,
      }),
    })
    if (!res.ok) {
      return { status: 'error', send_error: `HTTP ${res.status}` }
    }
    return await res.json()
  } catch (err) {
    return { status: 'error', send_error: err.message || 'network_error' }
  }
}
