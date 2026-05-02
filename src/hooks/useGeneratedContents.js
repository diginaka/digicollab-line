import { useState, useEffect } from 'react'
import { supabase, isSupabaseMode } from '../lib/supabase'

// AI生成コンテンツをSupabaseから取得するhook
//
// Phase A.6 (2026-05-02) 修正:
//   - 旧実装は存在しない `generated_contents` テーブル + `channel_type` 列を SELECT していた。
//   - 本番 DB に実在するのは `generated_step_contents` (channel='line' / 'email') のみ。
//   - フロービルダー saveGeneratedContents.ts (機能②パイプライン) はこのテーブルに INSERT する。
//   - 本 hook を実 schema に合わせて修正し、AIContentCopyBarLine と Sequences.jsx の
//     embedded mode の両方が同じ経路で下書きを表示できるようにする。
export function useGeneratedContents(funnelId, channel = 'line') {
  const [contents, setContents] = useState([])
  const [funnelName, setFunnelName] = useState('')
  const [patternName, setPatternName] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!funnelId || !isSupabaseMode || !supabase) return

    let cancelled = false
    async function fetchContents() {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('generated_step_contents')
          .select(
            'id, funnel_id, funnel_name, pattern_name, step_number, step_label, channel, body, preview, day, metadata, flex_payload, delivery_method, delivery_status, created_at, updated_at',
          )
          .eq('funnel_id', funnelId)
          .eq('channel', channel)
          .order('step_number', { ascending: true })

        if (cancelled) return

        if (error) {
          console.warn('AI生成コンテンツ取得エラー:', error.message)
          setContents([])
          return
        }

        setContents(data || [])

        if (data?.length > 0) {
          setFunnelName(data[0].funnel_name || '')
          setPatternName(data[0].pattern_name || '')
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('AI生成コンテンツ取得失敗:', err)
          setContents([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchContents()
    return () => {
      cancelled = true
    }
  }, [funnelId, channel])

  return { contents, funnelName, patternName, loading }
}
