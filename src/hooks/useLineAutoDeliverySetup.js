// LINE 自動配信セットアップフック
//
// AI 一括生成済みの下書き (generated_step_contents.channel='line') を
// Supabase の delivery_queue に予約配信レコードとして INSERT する。
// Brevo のような外部 API は呼ばず、配信実行は n8n WF-DE (5分 cron) が担当する。
//
// メール側 useAutoDeliverySetup の LINE 版。Brevo 予約 API 相当を
// delivery_queue INSERT で代替するため、ロールバック処理は単純化している。

import { useCallback, useState } from 'react'
import { supabase, isSupabaseMode } from '../lib/supabase'

/**
 * 起点日時 + day オフセットから scheduled_at (ISO 8601 UTC) を計算
 * day=1 (即時) → 0時間オフセット
 * day=3 → 2日後
 */
function computeScheduledAt(baseDate, day) {
  const offsetDays = Math.max(0, Number(day) - 1)
  const d = new Date(baseDate.getTime() + offsetDays * 24 * 60 * 60 * 1000)
  return d.toISOString()
}

/**
 * generated_step_contents 1 行から day を取り出す。
 * day カラム → metadata.delay_days+1 → step_number の順でフォールバック。
 */
function resolveDay(content) {
  if (content.day !== null && content.day !== undefined) return content.day
  const delay = content.metadata?.delay_days
  if (delay !== null && delay !== undefined) return Number(delay) + 1
  return content.step_number ?? 1
}

export function useLineAutoDeliverySetup() {
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  /**
   * @param {object} params
   * @param {string} params.funnelId
   * @param {Array<{id:string, step_number:number, body:string, day?:number, metadata?:object}>} params.contents
   * @param {string} params.recipientLineId  テスト配信先 (Phase 1 では単一)
   * @param {string} params.startAt  ISO 8601 文字列 (1通目の配信開始日時)
   */
  const setupAutoDelivery = useCallback(async ({ funnelId, contents, recipientLineId, startAt }) => {
    if (!isSupabaseMode || !supabase) {
      const msg = 'Supabase に接続されていません'
      setError(msg)
      throw new Error(msg)
    }
    if (!funnelId) {
      const msg = 'funnel_id が指定されていません'
      setError(msg)
      throw new Error(msg)
    }
    if (!contents || contents.length === 0) {
      const msg = '配信コンテンツがありません'
      setError(msg)
      throw new Error(msg)
    }
    if (!recipientLineId) {
      const msg = '配信先 LINE user ID を入力してください'
      setError(msg)
      throw new Error(msg)
    }

    setRunning(true)
    setError(null)
    setResult(null)

    try {
      const startDate = startAt ? new Date(startAt) : new Date()
      if (Number.isNaN(startDate.getTime())) {
        throw new Error('配信開始日時の形式が不正です')
      }

      const queueRows = contents.map((content) => {
        const day = resolveDay(content)
        const scheduledAt = computeScheduledAt(startDate, day)
        return {
          funnel_id: funnelId,
          step_number: content.step_number,
          channel: 'line',
          recipient_line_id: recipientLineId,
          scheduled_at: scheduledAt,
          status: 'pending',
          metadata: {
            // WF-DE 互換のため metadata.line_user_id にも格納
            line_user_id: recipientLineId,
            content_id: content.id,
            source: 'flow_builder_ai_generation',
          },
        }
      })

      const { data: insertedQueue, error: insertError } = await supabase
        .from('delivery_queue')
        .insert(queueRows)
        .select()

      if (insertError) {
        throw new Error(`delivery_queue INSERT 失敗: ${insertError.message}`)
      }

      // generated_step_contents の状態を draft → pending に遷移させ、
      // EmbeddedDraftView のバッジを「下書き」→「自動配信中」に切り替える
      const contentIds = contents.map((c) => c.id).filter(Boolean)
      const updatePartials = []
      if (contentIds.length > 0) {
        const { error: updateError } = await supabase
          .from('generated_step_contents')
          .update({
            delivery_status: 'pending',
            delivery_method: 'auto',
            updated_at: new Date().toISOString(),
          })
          .in('id', contentIds)
        if (updateError) {
          // 配信キュー登録は成功しているので、ここはログ警告に留めて続行
          console.warn(
            'generated_step_contents 更新失敗 (配信は継続):',
            updateError.message,
          )
          updatePartials.push(updateError.message)
        }
      }

      const finalResult = {
        ok: true,
        successCount: insertedQueue?.length ?? queueRows.length,
        queueRows: insertedQueue ?? queueRows,
        warnings: updatePartials,
      }
      setResult(finalResult)
      return finalResult
    } catch (err) {
      const message = err?.message || '自動配信のセットアップに失敗しました'
      setError(message)
      setResult({ ok: false, error: message })
      throw err
    } finally {
      setRunning(false)
    }
  }, [])

  const reset = useCallback(() => {
    setError(null)
    setResult(null)
  }, [])

  return { setupAutoDelivery, running, error, result, reset }
}
