import { supabase } from './supabase'

/**
 * URL パラメータから sso_token / sso_refresh を読み取り、
 * Supabase Auth にセッションを注入する。
 * アプリ起動時の最初に1度だけ呼ぶ。
 *
 * フロービルダー本体（digicollabo.com）からリダイレクト時に
 * ?sso_token=xxx&sso_refresh=yyy が付与される想定。
 *
 * @returns {Promise<boolean>} SSO注入に成功したかどうか
 */
export async function initSSO() {
  if (!supabase) return false

  const url = new URL(window.location.href)
  const accessToken = url.searchParams.get('sso_token')
  const refreshToken = url.searchParams.get('sso_refresh')
  if (!accessToken || !refreshToken) return false

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })

  // URLからトークンを除去（履歴・ブックマークから漏洩防止）
  url.searchParams.delete('sso_token')
  url.searchParams.delete('sso_refresh')
  window.history.replaceState({}, '', url.toString())

  if (error) {
    console.error('[SSO] setSession失敗:', error)
    return false
  }
  return true
}
