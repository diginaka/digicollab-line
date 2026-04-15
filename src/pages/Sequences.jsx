import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Play, Clock, MessageSquare, Trash2, Workflow, Loader2, Users,
  Send, CheckCircle2, XCircle, AlertCircle, StopCircle, Calendar,
} from 'lucide-react'
import { demoSequences } from '../lib/demoData'
import { supabase, isSupabaseMode, resolveConnectionId } from '../lib/supabase'

const SEND_TIME_OPTIONS = [
  { value: '09:00', label: '午前9時（JST）' },
  { value: '12:00', label: '正午（JST）' },
  { value: '18:00', label: '午後6時（JST）' },
  { value: 'custom', label: 'カスタム時刻' },
]

export default function Sequences({ isTokenSet, connection }) {
  // シーケンス一覧
  const [sequences, setSequences] = useState(isTokenSet ? [] : demoSequences)
  const [selected, setSelected] = useState(isTokenSet ? null : demoSequences[0])
  const [connectionId, setConnectionId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // 選択シーケンスの詳細
  const [steps, setSteps] = useState([])
  const [deliveryStats, setDeliveryStats] = useState([])

  // ステップ追加フォーム
  const [newStepBody, setNewStepBody] = useState('')
  const [newStepDay, setNewStepDay] = useState(1)
  const [newStepLabel, setNewStepLabel] = useState('')

  // 配信開始フォーム
  const [recipientMode, setRecipientMode] = useState('all') // 'all' | 'tag'
  const [recipientTag, setRecipientTag] = useState('')
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [sendTimePreset, setSendTimePreset] = useState('09:00')
  const [customTime, setCustomTime] = useState('09:00')
  const [friends, setFriends] = useState([])
  const [starting, setStarting] = useState(false)
  const [startResult, setStartResult] = useState(null)

  // ========== 一覧ロード ==========
  const loadSequences = useCallback(async () => {
    if (!isTokenSet) {
      setSequences(demoSequences)
      setSelected(demoSequences[0])
      return
    }
    if (!isSupabaseMode || !supabase) {
      setSequences([])
      setSelected(null)
      setError('データベース接続がありません')
      return
    }
    if (!connection?.channelId) {
      setError('LINE接続がありません。設定画面で接続してください。')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const connId = await resolveConnectionId(connection.channelId)
      if (!connId) {
        setError('LINE接続情報が見つかりません。設定画面で接続テストを実行してください。')
        setSequences([])
        return
      }
      setConnectionId(connId)

      const { data, error: err } = await supabase
        .from('line_sequences')
        .select('*')
        .eq('connection_id', connId)
        .order('created_at', { ascending: false })
      if (err) throw err

      const mapped = (data || []).map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description || '',
        triggerType: s.trigger_type,
        isActive: s.is_active,
      }))
      setSequences(mapped)
      if (!selected || !mapped.find((s) => s.id === selected?.id)) {
        setSelected(mapped[0] || null)
      }
    } catch (err) {
      setError(err.message || 'シーケンス取得エラー')
    } finally {
      setLoading(false)
    }
  }, [isTokenSet, connection?.channelId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadSequences()
  }, [loadSequences])

  // ========== 選択シーケンスのステップ + 配信状況ロード ==========
  const loadStepsAndStats = useCallback(async () => {
    if (!isTokenSet || !isSupabaseMode || !supabase || !selected?.id) {
      setSteps([])
      setDeliveryStats([])
      return
    }
    try {
      // ステップ本文: generated_step_contents
      const { data: stepData } = await supabase
        .from('generated_step_contents')
        .select('*')
        .eq('funnel_id', selected.id)
        .eq('channel', 'line')
        .order('step_number', { ascending: true })
      setSteps(stepData || [])

      // 配信状況: delivery_queue
      const { data: queueData } = await supabase
        .from('delivery_queue')
        .select('step_number, status')
        .eq('funnel_id', selected.id)
        .eq('channel', 'line')
      setDeliveryStats(queueData || [])
    } catch (err) {
      console.warn('ステップ/配信状況の取得エラー:', err.message)
    }
  }, [isTokenSet, selected?.id])

  useEffect(() => {
    loadStepsAndStats()
  }, [loadStepsAndStats])

  // ========== 友だち一覧ロード（受信者選択用） ==========
  useEffect(() => {
    if (!isTokenSet || !isSupabaseMode || !supabase || !connectionId) {
      setFriends([])
      return
    }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('line_user_tags')
        .select('id, line_user_id, tags, is_active')
        .eq('connection_id', connectionId)
        .eq('is_active', true)
      if (!cancelled) setFriends(data || [])
    })()
    return () => {
      cancelled = true
    }
  }, [isTokenSet, connectionId])

  // ========== シーケンス新規作成 ==========
  const createSequence = async () => {
    if (!isTokenSet || !isSupabaseMode || !supabase) return
    const name = window.prompt('新しいステップ配信名を入力してください（例: 新規顧客フォローアップ）')
    if (!name) return
    const connId = connectionId || (await resolveConnectionId(connection?.channelId))
    if (!connId) {
      alert('LINE接続情報が見つかりません。設定画面で接続してください。')
      return
    }
    const { data, error: err } = await supabase
      .from('line_sequences')
      .insert({
        connection_id: connId,
        name,
        description: '',
        trigger_type: 'friend_added',
        is_active: false,
      })
      .select()
      .single()
    if (err) {
      alert('作成失敗: ' + err.message)
      return
    }
    const newSeq = {
      id: data.id,
      name: data.name,
      description: '',
      triggerType: data.trigger_type,
      isActive: false,
    }
    setSequences([newSeq, ...sequences])
    setSelected(newSeq)
  }

  // ========== ステップ追加 ==========
  const addStep = async () => {
    if (!selected?.id || !newStepBody.trim()) {
      alert('本文を入力してください')
      return
    }
    const nextNumber = steps.length > 0 ? Math.max(...steps.map((s) => s.step_number || 0)) + 1 : 1
    const { error: err } = await supabase
      .from('generated_step_contents')
      .insert({
        funnel_id: selected.id,
        step_number: nextNumber,
        step_label: newStepLabel || `ステップ ${nextNumber}`,
        channel: 'line',
        body: newStepBody,
        day: newStepDay,
        delivery_method: 'auto',
        delivery_status: 'draft',
      })
    if (err) {
      alert('ステップ追加失敗: ' + err.message)
      return
    }
    setNewStepBody('')
    setNewStepLabel('')
    setNewStepDay((d) => d + 1)
    loadStepsAndStats()
  }

  // ========== ステップ削除 ==========
  const deleteStep = async (stepId) => {
    if (!window.confirm('このステップを削除しますか？')) return
    const { error: err } = await supabase
      .from('generated_step_contents')
      .delete()
      .eq('id', stepId)
    if (err) {
      alert('削除失敗: ' + err.message)
      return
    }
    loadStepsAndStats()
  }

  // ========== 配信開始: delivery_queue へ一括INSERT ==========
  const startDelivery = async () => {
    setStartResult(null)
    if (!selected?.id || steps.length === 0) {
      setStartResult({ ok: false, message: 'ステップを1つ以上追加してください' })
      return
    }
    if (!connectionId) {
      setStartResult({ ok: false, message: 'LINE接続情報が見つかりません' })
      return
    }

    // 配信対象を取得
    let recipients = friends
    if (recipientMode === 'tag' && recipientTag) {
      recipients = friends.filter((f) => (f.tags || []).includes(recipientTag))
    }
    if (recipients.length === 0) {
      setStartResult({ ok: false, message: '配信対象がいません' })
      return
    }

    // 配信時刻: startDate + send time (JST)
    const [hh, mm] = (sendTimePreset === 'custom' ? customTime : sendTimePreset).split(':').map(Number)

    setStarting(true)
    try {
      const rows = []
      for (const recipient of recipients) {
        for (const step of steps) {
          // startDate を基点に step.day の何日目かオフセット
          // JSTで指定時刻になるようにUTCに変換（JST = UTC+9）
          const d = new Date(`${startDate}T00:00:00+09:00`)
          d.setDate(d.getDate() + ((step.day || 1) - 1))
          d.setHours(hh, mm, 0, 0)
          rows.push({
            funnel_id: selected.id,
            content_id: step.id,
            channel: 'line',
            recipient_line_id: recipient.line_user_id,
            step_number: step.step_number,
            scheduled_at: d.toISOString(),
            status: 'pending',
            metadata: {
              connection_id: connectionId,
              line_user_id: recipient.line_user_id,
            },
          })
        }
      }

      const { error: insertErr } = await supabase.from('delivery_queue').insert(rows)
      if (insertErr) throw insertErr

      // generated_step_contents の delivery_status を pending に更新
      await supabase
        .from('generated_step_contents')
        .update({ delivery_method: 'auto', delivery_status: 'pending' })
        .eq('funnel_id', selected.id)

      // シーケンスをアクティブ化
      await supabase.from('line_sequences').update({ is_active: true }).eq('id', selected.id)
      setSelected({ ...selected, isActive: true })
      setSequences(sequences.map((s) => (s.id === selected.id ? { ...s, isActive: true } : s)))

      setStartResult({ ok: true, message: `${rows.length}件を配信キューに登録しました（${recipients.length}人 × ${steps.length}ステップ）` })
      loadStepsAndStats()
    } catch (err) {
      setStartResult({ ok: false, message: '配信開始失敗: ' + (err.message || err) })
    } finally {
      setStarting(false)
    }
  }

  // ========== 配信キャンセル ==========
  const cancelDelivery = async () => {
    if (!selected?.id) return
    if (!window.confirm('この配信をキャンセルしますか？未送信のメッセージが停止されます（送信済みは取り消せません）')) return
    try {
      const { error: err } = await supabase
        .from('delivery_queue')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('funnel_id', selected.id)
        .eq('status', 'pending')
      if (err) throw err
      await supabase.from('line_sequences').update({ is_active: false }).eq('id', selected.id)
      setSelected({ ...selected, isActive: false })
      setSequences(sequences.map((s) => (s.id === selected.id ? { ...s, isActive: false } : s)))
      setStartResult({ ok: true, message: '配信をキャンセルしました' })
      loadStepsAndStats()
    } catch (err) {
      setStartResult({ ok: false, message: 'キャンセル失敗: ' + (err.message || err) })
    }
  }

  // ========== 集計 ==========
  const statsByStep = steps.map((step) => {
    const stepRows = deliveryStats.filter((s) => s.step_number === step.step_number)
    return {
      step_number: step.step_number,
      label: step.step_label || `ステップ ${step.step_number}`,
      total: stepRows.length,
      sent: stepRows.filter((r) => r.status === 'sent').length,
      pending: stepRows.filter((r) => r.status === 'pending' || r.status === 'claimed').length,
      failed: stepRows.filter((r) => r.status === 'failed').length,
      cancelled: stepRows.filter((r) => r.status === 'cancelled').length,
    }
  })

  const hasActiveDelivery = deliveryStats.some((s) => s.status === 'pending' || s.status === 'claimed')
  const allTags = Array.from(new Set(friends.flatMap((f) => f.tags || [])))
  const recipientsPreview =
    recipientMode === 'all'
      ? friends.length
      : recipientTag
        ? friends.filter((f) => (f.tags || []).includes(recipientTag)).length
        : 0

  return (
    <div className="p-6 max-w-7xl mx-auto" data-page="sequences">
      {loading && (
        <div className="bg-white rounded-xl border border-slate-200 p-10 flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#06C755' }} />
          <div className="text-sm">シーケンスを読み込み中...</div>
        </div>
      )}

      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 mb-4">{error}</div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* シーケンス一覧 */}
          <div className="lg:col-span-1 space-y-3">
            <button
              onClick={createSequence}
              disabled={!isTokenSet}
              className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-600 hover:border-green-500 hover:text-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
              data-add-sequence
            >
              <Plus className="w-4 h-4" /> 新しいステップ配信を作成
            </button>

            {sequences.length === 0 && isTokenSet && (
              <div className="bg-white rounded-xl border border-slate-200 p-6 text-center">
                <Workflow className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <div className="text-sm font-bold text-slate-700">ステップ配信はまだありません</div>
                <div className="text-xs text-slate-500 mt-1">上のボタンから作成しましょう</div>
              </div>
            )}

            {sequences.map((seq) => (
              <button
                key={seq.id}
                onClick={() => setSelected(seq)}
                className={`w-full text-left bg-white rounded-xl border p-4 transition ${
                  selected?.id === seq.id ? 'border-green-500 ring-2 ring-green-100' : 'border-slate-200 hover:border-slate-300'
                }`}
                data-sequence-card
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="font-bold text-slate-800 text-sm">{seq.name}</div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full ${
                      seq.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {seq.isActive ? '配信中' : '停止中'}
                  </span>
                </div>
                <div className="text-xs text-slate-500 truncate">{seq.description || 'ステップ配信'}</div>
              </button>
            ))}
          </div>

          {/* 詳細エリア */}
          {selected && (
            <div className="lg:col-span-2 space-y-4">
              {/* ヘッダー */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-bold text-slate-800 text-lg">{selected.name}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      funnel_id: <code className="font-mono">{selected.id}</code>
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-bold ${
                      selected.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {selected.isActive ? '● 配信中' : '停止中'}
                  </span>
                </div>
              </div>

              {/* 配信状況ダッシュボード */}
              {statsByStep.some((s) => s.total > 0) && (
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                    <Workflow className="w-4 h-4" style={{ color: '#06C755' }} /> 配信状況
                  </h3>
                  <div className="space-y-2">
                    {statsByStep.map((s) => (
                      <div key={s.step_number} className="flex items-center gap-2 text-sm p-2 rounded-lg bg-slate-50">
                        <div className="shrink-0 w-8 h-8 rounded bg-white border border-slate-200 flex items-center justify-center font-bold text-xs">
                          {s.step_number}
                        </div>
                        <div className="flex-1 min-w-0 truncate">{s.label}</div>
                        <div className="flex items-center gap-2 text-xs shrink-0">
                          {s.sent > 0 && (
                            <span className="flex items-center gap-0.5 text-green-700"><CheckCircle2 className="w-3 h-3" /> {s.sent}</span>
                          )}
                          {s.pending > 0 && (
                            <span className="flex items-center gap-0.5 text-amber-700"><Clock className="w-3 h-3" /> {s.pending}</span>
                          )}
                          {s.failed > 0 && (
                            <span className="flex items-center gap-0.5 text-red-700"><XCircle className="w-3 h-3" /> {s.failed}</span>
                          )}
                          {s.cancelled > 0 && (
                            <span className="flex items-center gap-0.5 text-slate-500"><StopCircle className="w-3 h-3" /> {s.cancelled}</span>
                          )}
                          <span className="text-slate-400">/ {s.total}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {hasActiveDelivery && (
                    <button
                      onClick={cancelDelivery}
                      className="mt-3 px-3 py-1.5 border border-red-300 text-red-600 rounded-lg text-xs font-bold hover:bg-red-50 flex items-center gap-1.5"
                    >
                      <StopCircle className="w-3 h-3" /> 配信をキャンセル
                    </button>
                  )}
                </div>
              )}

              {/* ステップ一覧 */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" style={{ color: '#06C755' }} /> ステップ ({steps.length})
                </h3>

                {steps.length === 0 ? (
                  <div className="text-center py-6 text-sm text-slate-400">
                    ステップがまだありません。下のフォームから追加してください。
                  </div>
                ) : (
                  <div className="space-y-2 mb-4">
                    {steps.map((step) => (
                      <div key={step.id} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-slate-600">
                            ステップ {step.step_number}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" /> Day {step.day || 1}
                          </span>
                          {step.step_label && (
                            <span className="text-xs text-slate-500 truncate">{step.step_label}</span>
                          )}
                          <button
                            onClick={() => deleteStep(step.id)}
                            className="ml-auto text-slate-400 hover:text-red-500"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="text-sm text-slate-700 whitespace-pre-wrap">{step.body}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ステップ追加フォーム */}
                <div className="border-t border-slate-100 pt-4">
                  <div className="text-xs font-bold text-slate-600 mb-2">新しいステップを追加</div>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <input
                      type="text"
                      value={newStepLabel}
                      onChange={(e) => setNewStepLabel(e.target.value)}
                      placeholder="ラベル（例: ご挨拶）"
                      className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-500"
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 shrink-0">Day</span>
                      <input
                        type="number"
                        min="1"
                        value={newStepDay}
                        onChange={(e) => setNewStepDay(Number(e.target.value) || 1)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-500"
                      />
                    </div>
                  </div>
                  <textarea
                    value={newStepBody}
                    onChange={(e) => setNewStepBody(e.target.value)}
                    placeholder="メッセージ本文を入力..."
                    rows={4}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-500 resize-none mb-2"
                  />
                  <button
                    onClick={addStep}
                    disabled={!newStepBody.trim()}
                    className="px-4 py-2 rounded-lg text-white text-sm font-bold flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: '#06C755' }}
                  >
                    <Plus className="w-4 h-4" /> ステップを追加
                  </button>
                </div>
              </div>

              {/* 配信開始フォーム */}
              {steps.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                    <Send className="w-4 h-4" style={{ color: '#06C755' }} /> 配信を開始
                  </h3>

                  {/* 対象者 */}
                  <div className="mb-3">
                    <div className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-1">
                      <Users className="w-3 h-3" /> 配信対象
                    </div>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="radio"
                          checked={recipientMode === 'all'}
                          onChange={() => setRecipientMode('all')}
                          className="w-4 h-4"
                        />
                        <span>全友だち ({friends.length}人)</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="radio"
                          checked={recipientMode === 'tag'}
                          onChange={() => setRecipientMode('tag')}
                          className="w-4 h-4"
                          disabled={allTags.length === 0}
                        />
                        <span>タグで絞り込み</span>
                        {recipientMode === 'tag' && (
                          <select
                            value={recipientTag}
                            onChange={(e) => setRecipientTag(e.target.value)}
                            className="ml-2 px-2 py-1 border border-slate-200 rounded text-sm"
                          >
                            <option value="">タグを選択</option>
                            {allTags.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        )}
                      </label>
                    </div>
                  </div>

                  {/* 配信開始日 + 時刻 */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div>
                      <div className="text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> 開始日
                      </div>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-500"
                      />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> 配信時刻
                      </div>
                      <select
                        value={sendTimePreset}
                        onChange={(e) => setSendTimePreset(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-500"
                      >
                        {SEND_TIME_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      {sendTimePreset === 'custom' && (
                        <input
                          type="time"
                          value={customTime}
                          onChange={(e) => setCustomTime(e.target.value)}
                          className="mt-2 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-500"
                        />
                      )}
                    </div>
                  </div>

                  <div className="text-xs text-slate-500 mb-3">
                    配信予定: {recipientsPreview}人 × {steps.length}ステップ = {recipientsPreview * steps.length}件
                  </div>

                  <button
                    onClick={startDelivery}
                    disabled={starting || recipientsPreview === 0}
                    className="w-full py-3 rounded-lg text-white font-bold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: '#06C755' }}
                  >
                    {starting ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> 登録中...</>
                    ) : (
                      <><Play className="w-4 h-4" /> 配信を開始</>
                    )}
                  </button>

                  {startResult && (
                    <div className={`mt-3 p-3 rounded-lg text-sm flex items-start gap-2 ${
                      startResult.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
                    }`}>
                      {startResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                      {startResult.message}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
