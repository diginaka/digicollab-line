// 二刀流モード: Supabase環境変数が設定されていればsupabaseモード、なければstandalone
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseMode = Boolean(url && anonKey)

export const supabase = isSupabaseMode
  ? createClient(url, anonKey)
  : null

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
