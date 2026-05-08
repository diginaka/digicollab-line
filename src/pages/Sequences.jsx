// LINE シーケンス管理ページ
//
// mail/digicollab-mail/src/pages/Sequences.jsx の構造を LINE 用に移植。
// メール側の <Sequences /> と並列の役割を担い、AI 一括生成された LINE
// メッセージのシーケンスを funnel ごとにグルーピングして一覧表示する。
//
// 機能:
//   - シーケンス一覧 (折りたたみカード) + 配信キュー の 2 タブ
//   - 埋め込み時 (?embed=true&funnel_id=xxx) は ヘッダーに当該 funnel の状態 + 「自動配信を有効化する」ボタン
//   - 各ステップごとに「編集」「テスト送信」ボタン
//
// 注意:
//   - 旧 EmbeddedDraftView の単一 funnel ビューを完全に置き換える。
//   - メール側 (digicollab-mail) には一切手を入れない (regression 防止)。
import { useEffect, useMemo, useState } from 'react'
import {
  Workflow,
  Loader2,
  AlertCircle,
  MessageSquare,
  Clock,
  CheckCircle2,
  XCircle,
  Send,
  Sparkles,
  RefreshCw,
  ChevronRight,
  Info,
  Zap,
  Pencil,
  X as XIcon,
} from 'lucide-react'
import { supabase, isSupabaseMode } from '../lib/supabase'
import { useFlowContext } from '../hooks/useFlowContext'
import { useFunnelSequences } from '../hooks/useFunnelSequences'
import { useSequenceStatus } from '../hooks/useSequenceStatus'
import SequenceStatusBadge from '../components/sequences/SequenceStatusBadge'
import EditStepModal from '../components/sequences/EditStepModal'
import TestSendModal from '../components/sequences/TestSendModal'
import ConfirmActivationModal from '../components/sequences/ConfirmActivationModal'

const LINE_GREEN = '#06C755'

export default function Sequences({ isTokenSet, connection }) {
  const { funnelId: embeddedFunnelId, isEmbedded } = useFlowContext()

  const [tab, setTab] = useState('sequences') // 'sequences' | 'queue'
  const [expandedFunnelId, setExpandedFunnelId] = useState(null)
  const [queueItems, setQueueItems] = useState([])
  const [queueLoading, setQueueLoading] = useState(false)
  const [queueError, setQueueError] = useState('')

  const [toast, setToast] = useState('')
  const [toastError, setToastError] = useState('')
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [testSendTarget, setTestSendTarget] = useState(null) // step
  const [editTarget, setEditTarget] = useState(null) // { step, funnelId }

  const { sequences, loading: seqLoading, error: seqError, refresh: refreshSequences } =
    useFunnelSequences()
  const {
    status: embeddedStatus,
    activeSteps: embeddedActiveSteps,
    refresh: refreshEmbeddedStatus,
  } = useSequenceStatus(isEmbedded ? embeddedFunnelId : null)

  // 配信キュー読み込み (タブ切替時 + 自動配信セットアップ後)
  useEffect(() => {
    if (tab !== 'queue') return
    if (!isSupabaseMode || !supabase) {
      setQueueItems([])
      return
    }
    let cancelled = false
    ;(async () => {
      setQueueLoading(true)
      setQueueError('')
      try {
        const { data, error } = await supabase
          .from('delivery_queue')
          .select('*')
          .eq('channel', 'line')
          .order('scheduled_at', { ascending: false })
          .limit(100)
        if (cancelled) return
        if (error) throw error
        setQueueItems(data || [])
      } catch (err) {
        if (!cancelled) {
          setQueueError(err.message || '配信キューの取得に失敗しました')
          setQueueItems([])
        }
      } finally {
        if (!cancelled) setQueueLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tab])

  // 埋め込み時、対象 funnel のシーケンスは初期 expanded
  useEffect(() => {
    if (isEmbedded && embeddedFunnelId && expandedFunnelId === null) {
      const has = sequences.some((s) => s.funnel_id === embeddedFunnelId)
      if (has) setExpandedFunnelId(embeddedFunnelId)
    }
  }, [isEmbedded, embeddedFunnelId, sequences, expandedFunnelId])

  // トースト自動消去
  useEffect(() => {
    if (!toast && !toastError) return
    const t = setTimeout(() => {
      setToast('')
      setToastError('')
    }, 4000)
    return () => clearTimeout(t)
  }, [toast, toastError])

  const embeddedSequence = useMemo(
    () => (isEmbedded ? sequences.find((s) => s.funnel_id === embeddedFunnelId) || null : null),
    [isEmbedded, embeddedFunnelId, sequences],
  )

  const handleConfirmSuccess = ({ upsertedCount }) => {
    setToast(`✓ 自動配信を有効化しました（${upsertedCount}通登録）`)
    setToastError('')
    refreshEmbeddedStatus()
    refreshSequences()
  }
  const handleConfirmError = (msg) => {
    setToast('')
    setToastError(`自動配信の有効化に失敗しました: ${msg}`)
  }
  const handleTestSendSuccess = ({ recipient, stepNumber }) => {
    setToast(`✓ ${recipient.slice(0, 8)}... に ${stepNumber}通目をテスト送信しました`)
    setToastError('')
  }
  const handleTestSendError = (msg) => {
    setToast('')
    setToastError(msg)
  }
  const handleEditSaved = ({ stepNumber }) => {
    setToast(`✓ ${stepNumber}通目を保存しました`)
    setToastError('')
    refreshSequences()
    refreshEmbeddedStatus()
  }
  const handleEditError = (msg) => {
    setToast('')
    setToastError(`編集の保存に失敗しました: ${msg}`)
  }

  const handleDeleteSequence = async (funnelId, funnelName) => {
    if (!isSupabaseMode || !supabase) return
    if (!confirm(`シーケンス「${funnelName || funnelId}」の AI 生成コンテンツをすべて削除しますか？`))
      return
    try {
      const { error } = await supabase
        .from('generated_step_contents')
        .delete()
        .eq('funnel_id', funnelId)
        .eq('channel', 'line')
      if (error) throw error
      refreshSequences()
      setToast('シーケンスを削除しました')
    } catch (err) {
      setToastError(`削除失敗: ${err.message || ''}`)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto" data-page="sequences">
      {/* トースト */}
      {toast && (
        <div
          className="mb-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg p-2 text-sm flex items-center justify-between gap-2"
          data-toast="success"
        >
          <span>{toast}</span>
          <button
            onClick={() => setToast('')}
            className="text-emerald-600/60 hover:text-emerald-700"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {toastError && (
        <div
          className="mb-3 bg-red-50 border border-red-200 text-red-700 rounded-lg p-2 text-sm flex items-center justify-between gap-2"
          data-toast="error"
        >
          <span>{toastError}</span>
          <button
            onClick={() => setToastError('')}
            className="text-red-600/60 hover:text-red-700"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {seqError && (
        <div className="mb-3 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {seqError}
        </div>
      )}

      {/* 埋め込み時の主要アクション帯 */}
      {isEmbedded && isSupabaseMode && (
        <div
          className="mb-4 bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3"
          data-embed-actions
        >
          <SequenceStatusBadge status={embeddedStatus} size="lg" />
          <div className="flex-1 min-w-[200px] text-xs text-slate-500">
            {embeddedStatus === 'active' &&
              `自動配信中（${embeddedActiveSteps.size}通登録済み）— 友だち追加した人に自動で LINE が届きます`}
            {embeddedStatus === 'draft' &&
              '生成済みのメッセージを「自動配信を有効化」すると、友だち追加した人へ自動配信が開始されます'}
            {embeddedStatus === 'error' &&
              '直近の配信でエラーが発生しています。配信キュータブを確認してください'}
            {embeddedStatus === 'empty' &&
              'まだメッセージが生成されていません。フロービルダーで AI 生成を実行してください'}
          </div>
          <button
            onClick={() => setShowConfirmModal(true)}
            disabled={embeddedStatus === 'empty' || !embeddedSequence}
            className="px-4 py-2 text-white rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-40 flex items-center gap-2"
            style={{ backgroundColor: LINE_GREEN }}
            data-confirm-activation-trigger
            title={
              embeddedStatus === 'empty'
                ? 'まずフロービルダーでメッセージを生成してください'
                : '友だち追加した人に、このシーケンスを自動配信します'
            }
          >
            <Zap className="w-4 h-4" />
            {embeddedStatus === 'active' || embeddedStatus === 'error'
              ? '自動配信の設定を更新'
              : '自動配信を有効化する'}
          </button>
        </div>
      )}

      {/* 案内 */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4 text-sm text-emerald-900">
        <div className="flex items-start gap-2">
          <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
          <div className="flex-1">
            <div className="font-bold mb-1">ステップ配信（LINE シーケンス）</div>
            フロービルダーで生成された AI ステップ LINE メッセージをここで一覧・管理できます。
            「自動配信を有効化」すると、友だち追加した人に day 設定の差分で自動配信されます。
          </div>
        </div>
      </div>

      {/* タブ */}
      <div className="bg-white border border-slate-200 rounded-xl mb-4 flex items-center px-1">
        <TabButton active={tab === 'sequences'} onClick={() => setTab('sequences')}>
          <Workflow className="w-4 h-4" />
          シーケンス一覧
        </TabButton>
        <TabButton active={tab === 'queue'} onClick={() => setTab('queue')}>
          <Clock className="w-4 h-4" />
          配信キュー
        </TabButton>
        <div className="flex-1" />
        <button
          onClick={tab === 'sequences' ? refreshSequences : () => setTab('queue')}
          className="px-3 py-2 text-slate-500 hover:text-slate-700 text-xs font-bold flex items-center gap-1.5"
          title="再読み込み"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          更新
        </button>
      </div>

      {/* スタンドアロン警告 */}
      {!isSupabaseMode && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold mb-1">スタンドアロンモードです</div>
              シーケンス管理には Supabase 連携が必要です。フロービルダーから開いてください。
            </div>
          </div>
        </div>
      )}

      {/* 一覧 */}
      {tab === 'sequences' ? (
        seqLoading ? (
          <div className="py-16 flex justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : sequences.length === 0 ? (
          <EmptyState
            icon={Workflow}
            title="シーケンスがありません"
            description="フロービルダーで AI 一括生成を実行すると、ここに自動でシーケンスが登録されます。"
          />
        ) : (
          <div className="space-y-3">
            {sequences.map((seq) => (
              <SequenceCard
                key={seq.funnel_id}
                sequence={seq}
                expanded={expandedFunnelId === seq.funnel_id}
                onToggle={() =>
                  setExpandedFunnelId(
                    expandedFunnelId === seq.funnel_id ? null : seq.funnel_id,
                  )
                }
                onDelete={() => handleDeleteSequence(seq.funnel_id, seq.funnel_name)}
                onTestSend={(step) => setTestSendTarget(step)}
                onEdit={(step) => setEditTarget({ step, funnelId: seq.funnel_id })}
                isEmbeddedTarget={isEmbedded && embeddedFunnelId === seq.funnel_id}
              />
            ))}
          </div>
        )
      ) : queueLoading ? (
        <div className="py-16 flex justify-center text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : queueError ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {queueError}
        </div>
      ) : queueItems.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="配信キューが空です"
          description="「自動配信を有効化する」を実行すると、ここに配信スケジュールが表示されます。"
        />
      ) : (
        <QueueList items={queueItems} />
      )}

      {/* 自動配信確定モーダル */}
      {showConfirmModal && embeddedSequence && (
        <ConfirmActivationModal
          funnelId={embeddedFunnelId}
          contents={embeddedSequence.steps}
          activeSteps={embeddedActiveSteps}
          defaultLineUserId=""
          onClose={() => setShowConfirmModal(false)}
          onSuccess={handleConfirmSuccess}
          onError={handleConfirmError}
        />
      )}

      {/* テスト送信モーダル */}
      {testSendTarget && (
        <TestSendModal
          step={testSendTarget}
          channelId={connection?.channelId}
          channelAccessToken={isTokenSet ? connection?.channelAccessToken : ''}
          defaultLineUserId=""
          onClose={() => setTestSendTarget(null)}
          onSuccess={handleTestSendSuccess}
          onError={handleTestSendError}
        />
      )}

      {/* 編集モーダル */}
      {editTarget && (
        <EditStepModal
          step={editTarget.step}
          funnelId={editTarget.funnelId}
          onClose={() => setEditTarget(null)}
          onSaved={handleEditSaved}
          onError={handleEditError}
        />
      )}
    </div>
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-xs font-bold flex items-center gap-1.5 transition-colors ${
        active
          ? 'border-b-2'
          : 'text-slate-500 hover:text-slate-700 border-b-2 border-transparent'
      }`}
      style={
        active ? { color: LINE_GREEN, borderColor: LINE_GREEN } : undefined
      }
    >
      {children}
    </button>
  )
}

function SequenceCard({
  sequence,
  expanded,
  onToggle,
  onDelete,
  onTestSend,
  onEdit,
  isEmbeddedTarget,
}) {
  const stepCount = sequence.steps.length
  const { status, activeSteps } = useSequenceStatus(sequence.funnel_id)

  return (
    <div
      className={`bg-white border rounded-xl overflow-hidden ${
        isEmbeddedTarget ? 'border-emerald-300 ring-2 ring-emerald-100' : 'border-slate-200'
      }`}
      data-funnel-card={sequence.funnel_id}
    >
      <button
        onClick={onToggle}
        className="w-full p-5 flex items-start gap-3 text-left hover:bg-slate-50"
      >
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${LINE_GREEN}15` }}
        >
          <Workflow className="w-5 h-5" style={{ color: LINE_GREEN }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <div className="text-sm font-bold text-slate-800 truncate">
              {sequence.funnel_name || sequence.funnel_id}
            </div>
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `${LINE_GREEN}20`, color: '#0a8b3f' }}
            >
              {stepCount} 通
            </span>
            <SequenceStatusBadge status={status} size="sm" />
          </div>
          {sequence.pattern_name && (
            <div className="text-xs text-slate-500 mb-2">
              パターン: {sequence.pattern_name}
            </div>
          )}
          <div className="flex items-center gap-1 text-xs text-slate-600 flex-wrap">
            {sequence.steps.slice(0, 6).map((step, i) => (
              <div key={step.id} className="flex items-center gap-1">
                {i > 0 && <span className="text-slate-300">→</span>}
                <span className="px-2 py-0.5 rounded bg-slate-100 flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" />
                  {step.step_number}通目
                </span>
              </div>
            ))}
            {stepCount > 6 && <span className="text-slate-400">...</span>}
          </div>
        </div>
        <ChevronRight
          className={`w-4 h-4 text-slate-400 shrink-0 mt-1 transition-transform ${
            expanded ? 'rotate-90' : ''
          }`}
        />
      </button>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50 p-4 space-y-3">
          {sequence.steps.map((step) => {
            const isActive = activeSteps?.has(step.step_number)
            const day =
              step.day ??
              (step.metadata?.delay_days != null
                ? Number(step.metadata.delay_days) + 1
                : step.step_number)
            return (
              <div
                key={step.id}
                className="bg-white rounded-lg border border-slate-200 p-4"
                data-step-card
                data-step-number={step.step_number}
              >
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded"
                    style={{ backgroundColor: `${LINE_GREEN}20`, color: '#0a8b3f' }}
                  >
                    {step.step_number}通目
                  </span>
                  <span className="text-xs text-slate-500">
                    配信: {day === 1 ? '即時' : `${day - 1}日後`}
                  </span>
                  {step.metadata?.flex_format === 'flex' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
                      Flex
                    </span>
                  )}
                  <div className="flex-1" />
                  {isActive && (
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 inline-flex items-center gap-1"
                      data-step-active
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      自動配信中
                    </span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onEdit?.(step)
                    }}
                    title="このメッセージの本文・配信日を編集"
                    className="text-[11px] px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800 inline-flex items-center gap-1"
                    data-edit-step-trigger={step.step_number}
                  >
                    <Pencil className="w-3 h-3" />
                    編集
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onTestSend?.(step)
                    }}
                    title="自分の LINE userId にこの step を単発送信"
                    className="text-[11px] px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800 inline-flex items-center gap-1"
                    data-test-send-trigger={step.step_number}
                  >
                    <Send className="w-3 h-3" />
                    テスト送信
                  </button>
                </div>
                {step.preview && (
                  <div className="text-xs font-bold text-slate-700 mb-1">
                    {step.preview}
                  </div>
                )}
                <pre className="text-xs text-slate-600 whitespace-pre-wrap font-sans max-h-32 overflow-y-auto">
                  {step.body?.substring(0, 240) || '(本文なし)'}
                  {step.body?.length > 240 ? '...' : ''}
                </pre>
              </div>
            )
          })}

          {/* 削除ボタン */}
          <button
            onClick={onDelete}
            className="text-xs text-red-600 hover:text-red-700 font-bold flex items-center gap-1"
          >
            このシーケンスを削除
          </button>
        </div>
      )}
    </div>
  )
}

const QUEUE_STATUS = {
  pending: { label: '予約済み', icon: Clock, cls: 'bg-blue-100 text-blue-700' },
  scheduled: { label: '予約済み', icon: Clock, cls: 'bg-blue-100 text-blue-700' },
  sent: { label: '配信済み', icon: CheckCircle2, cls: 'bg-green-100 text-green-700' },
  failed: { label: '失敗', icon: XCircle, cls: 'bg-red-100 text-red-700' },
  cancelled: { label: 'キャンセル', icon: XCircle, cls: 'bg-slate-100 text-slate-600' },
  sending: { label: '送信中', icon: Send, cls: 'bg-yellow-100 text-yellow-700' },
}

function QueueList({ items }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <table className="w-full">
        <thead className="bg-slate-50 text-xs text-slate-600">
          <tr>
            <th className="px-4 py-3 text-left font-bold">ステータス</th>
            <th className="px-4 py-3 text-left font-bold">シーケンス</th>
            <th className="px-4 py-3 text-left font-bold">ステップ</th>
            <th className="px-4 py-3 text-left font-bold">宛先</th>
            <th className="px-4 py-3 text-left font-bold">予定日時</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => {
            const s = QUEUE_STATUS[item.status] || QUEUE_STATUS.pending
            const Icon = s.icon
            const recipient = item.recipient_line_id || item.metadata?.line_user_id || '—'
            return (
              <tr key={item.id} className="hover:bg-slate-50 text-sm">
                <td className="px-4 py-3">
                  <span
                    className={`text-xs px-2 py-1 rounded-full inline-flex items-center gap-1 ${s.cls}`}
                  >
                    <Icon className="w-3 h-3" />
                    {s.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600 text-xs truncate max-w-[180px]">
                  {item.metadata?.funnel_name || item.funnel_id || '—'}
                </td>
                <td className="px-4 py-3 text-slate-600 text-xs">
                  {item.step_number}通目
                </td>
                <td className="px-4 py-3 text-slate-800 text-xs truncate max-w-[200px] font-mono">
                  {typeof recipient === 'string' && recipient.length > 12
                    ? recipient.slice(0, 8) + '...'
                    : recipient}
                </td>
                <td className="px-4 py-3 text-slate-600 text-xs">
                  {item.scheduled_at
                    ? new Date(item.scheduled_at).toLocaleString('ja-JP')
                    : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl py-16 text-center">
      <Icon className="w-10 h-10 mx-auto mb-3 text-slate-300" />
      <div className="text-sm font-bold text-slate-600 mb-1">{title}</div>
      <div className="text-xs text-slate-400 max-w-md mx-auto px-4">{description}</div>
    </div>
  )
}
