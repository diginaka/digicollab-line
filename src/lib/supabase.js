// 二刀流モード: Supabase環境変数が設定されていればsupabaseモード、なければstandalone
// SSO対応: フロービルダー本体（digicollabo.com）からトークン注入を受ける
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseMode = Boolean(url && anonKey)

export const supabase = isSupabaseMode
  ? createClient(url, anonKey, {
      auth: {
        storageKey: 'sb-digicollab-line', // 他アプリ（カート・コース等）と衝突しないユニークキー
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false, // SSO手動制御のためURL自動パース停止
      },
    })
  : null

// BYOK方式: Supabase Authを使わないため、channel_id から line_connections.id を解決する
// 呼び出し側は connection.channelId（アプリ内状態）を渡す
export async function resolveConnectionId(channelId) {
  if (!supabase || !channelId) return null
  const { data } = await supabase
    .from('line_connections')
    .select('id')
    .eq('channel_id', channelId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.id || null
}

// ローカルストレージラッパー（standaloneモード用）
const LS_PREFIX = 'digicollab_line_'

export const localStore = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(LS_PREFIX + key)
      return raw ? JSON.parse(raw) : fallback
    } catch {
      return fallback
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(LS_PREFIX + key, JSON.stringify(value))
    } catch {}
  },
}
