// LINE シーケンス一覧 (全 funnel) を取得するフック
//
// generated_step_contents (channel='line') を全行取得して funnel_id ごとに
// グルーピングする。シーケンス一覧画面 (Sequences.jsx) で使う。
//
// 戻り値:
//   sequences: [{
//     funnel_id, funnel_name, pattern_name,
//     steps: [generated_step_contents row, ...]
//   }, ...]
//
// 認証エラー / Supabase 未接続時は空配列で fail-soft する。
import { useCallback, useEffect, useState } from 'react'
import { supabase, isSupabaseMode } from '../lib/supabase'

export function useFunnelSequences() {
  const [sequences, setSequences] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!isSupabaseMode || !supabase) {
      setSequences([])
      return
    }
    setLoading(true)
    setError('')
    try {
      const { data, error: fetchErr } = await supabase
        .from('generated_step_contents')
        .select(
          'id, funnel_id, funnel_name, pattern_name, step_number, step_label, channel, body, preview, day, metadata, flex_payload, delivery_method, delivery_status, scheduled_at, created_at, updated_at',
        )
        .eq('channel', 'line')
        .order('funnel_id', { ascending: true })
        .order('step_number', { ascending: true })

      if (fetchErr) throw fetchErr

      const grouped = new Map()
      for (const row of data || []) {
        const key = row.funnel_id
        if (!key) continue
        if (!grouped.has(key)) {
          grouped.set(key, {
            funnel_id: row.funnel_id,
            funnel_name: row.funnel_name,
            pattern_name: row.pattern_name,
            steps: [],
          })
        }
        grouped.get(key).steps.push(row)
      }
      setSequences(Array.from(grouped.values()))
    } catch (err) {
      setError(err.message || 'シーケンス一覧の取得に失敗しました')
      setSequences([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { sequences, loading, error, refresh: load }
}
