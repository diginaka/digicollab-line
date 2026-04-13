import { useState, useEffect } from 'react'
import { supabase, isSupabaseMode } from '../lib/supabase'

// AI生成コンテンツをSupabaseから取得するhook
// generated_contents テーブル（共通テーブル）からchannel_type='line'で絞り込み
export function useGeneratedContents(funnelId, channelType = 'line') {
  const [contents, setContents] = useState([])
  const [funnelName, setFunnelName] = useState('')
  const [patternName, setPatternName] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!funnelId || !isSupabaseMode || !supabase) return

    async function fetchContents() {
      setLoading(true)
      try {
        // generated_contents テーブルからLINE向けコンテンツを取得
        const { data, error } = await supabase
          .from('generated_contents')
          .select('*')
          .eq('funnel_id', funnelId)
          .eq('channel_type', channelType)
          .order('step_number', { ascending: true })

        if (error) {
          console.warn('AI生成コンテンツ取得エラー:', error.message)
          setContents([])
          return
        }

        setContents(data || [])

        // ファネル名・パターン名を最初のレコードから取得
        if (data?.length > 0) {
          setFunnelName(data[0].funnel_name || '')
          setPatternName(data[0].pattern_name || '')
        }
      } catch (err) {
        console.warn('AI生成コンテンツ取得失敗:', err)
        setContents([])
      } finally {
        setLoading(false)
      }
    }

    fetchContents()
  }, [funnelId, channelType])

  return { contents, funnelName, patternName, loading }
}
