// LINE 版シーケンス状態判定フック (mail/digicollab-mail/src/hooks/useSequenceStatus.js の LINE 移植)
//
// 判定ロジック:
//   - empty : generated_step_contents (channel='line') の line が 0 件
//   - draft : line がある + delivery_method !== 'auto' (= delivery_queue に投入していない)
//   - active: 1 件以上 delivery_method='auto'
//   - error : active かつ 直近 72h 内に delivery_status='failed' あり
//
// activeSteps Map は (step_number) -> generated_step_contents row。
// 各カードの「自動配信中」バッジ判定に使う。
//
// LINE は mail と異なり fb_optin_line_sequences のような専用テーブルを持たず、
// delivery_queue / generated_step_contents.delivery_method で active を判定する。
import { useEffect, useState, useCallback } from 'react'
import { supabase, isSupabaseMode } from '../lib/supabase'

const RECENT_FAILED_WINDOW_HOURS = 72

export function useSequenceStatus(funnelId) {
  const [state, setState] = useState({
    status: 'empty',
    draftCount: 0,
    activeSteps: new Map(),
    hasFailedRecent: false,
    loading: false,
    error: null,
  })

  const load = useCallback(async () => {
    if (!isSupabaseMode || !supabase || !funnelId) {
      setState({
        status: 'empty',
        draftCount: 0,
        activeSteps: new Map(),
        hasFailedRecent: false,
        loading: false,
        error: null,
      })
      return
    }

    setState((s) => ({ ...s, loading: true, error: null }))

    try {
      const { data: rows, error } = await supabase
        .from('generated_step_contents')
        .select(
          'id, step_number, delivery_method, delivery_status, scheduled_at, updated_at',
        )
        .eq('funnel_id', funnelId)
        .eq('channel', 'line')
        .order('step_number', { ascending: true })

      if (error) throw error

      const draftCount = rows?.length || 0
      const activeSteps = new Map()
      ;(rows || [])
        .filter((r) => r.delivery_method === 'auto')
        .forEach((r) => activeSteps.set(r.step_number, r))

      // 直近 failed (delivery_status='failed' or delivery_queue.status='failed')
      let hasFailedRecent = false
      if (activeSteps.size > 0) {
        const sinceIso = new Date(
          Date.now() - RECENT_FAILED_WINDOW_HOURS * 3600 * 1000,
        ).toISOString()
        const { data: failedRows, error: failedErr } = await supabase
          .from('delivery_queue')
          .select('id')
          .eq('funnel_id', funnelId)
          .eq('channel', 'line')
          .eq('status', 'failed')
          .gte('updated_at', sinceIso)
          .limit(1)
        if (!failedErr) {
          hasFailedRecent = (failedRows?.length || 0) > 0
        }
      }

      let status = 'empty'
      if (activeSteps.size > 0) {
        status = hasFailedRecent ? 'error' : 'active'
      } else if (draftCount > 0) {
        status = 'draft'
      }

      setState({
        status,
        draftCount,
        activeSteps,
        hasFailedRecent,
        loading: false,
        error: null,
      })
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err.message || 'シーケンス状態の取得に失敗しました',
      }))
    }
  }, [funnelId])

  useEffect(() => {
    load()
  }, [load])

  return { ...state, refresh: load }
}
