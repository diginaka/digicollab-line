// LINE シーケンス各ステップ「テスト送信」モーダル
//
// mail/TestSendModal.jsx の LINE 版:
//   - 入力: LINE userId (33 桁の "U..." 形式)
//   - 送信経路: WF-LINE-TEST (n8n) 経由 → 失敗時 LINE Push API (BYOK token) でフォールバック
//   - 配信ログには記録されないテスト送信
//
// step (props) は generated_step_contents の row。{ id, step_number, body, ... }
import { useState } from 'react'
import { Loader2, X, Send, AlertTriangle, Smartphone } from 'lucide-react'
import { lineTestSendProxy, pushMessage } from '../../lib/lineProxy'
import { resolveConnectionId } from '../../lib/supabase'

const LINE_USER_ID_RE = /^U[0-9a-f]{32}$/i

export default function TestSendModal({
  step,
  channelId,
  channelAccessToken,
  defaultLineUserId = '',
  onClose,
  onSuccess,
  onError,
}) {
  const [recipient, setRecipient] = useState(defaultLineUserId)
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState('')

  const trimmed = recipient.trim()
  const isValid = LINE_USER_ID_RE.test(trimmed)

  const handleSend = async () => {
    setLocalError('')
    if (!isValid) {
      setLocalError('LINE userId は "U" + 32 文字の英数字 (例: U3245bf90258ccfae3b6ea2f43dfe390b)')
      return
    }
    if (!step?.body) {
      setLocalError('送信する本文がありません。先に編集して保存してください。')
      return
    }

    setSubmitting(true)
    try {
      const messages = [{ type: 'text', text: step.body }]

      // 1. WF-LINE-TEST (n8n) 経由を最優先
      let sent = false
      let lastError = ''
      if (channelId) {
        const connId = await resolveConnectionId(channelId)
        if (connId) {
          const r = await lineTestSendProxy({
            connectionId: connId,
            lineUserId: trimmed,
            messages,
          })
          if (r?.status === 'sent') {
            sent = true
          } else {
            lastError = r?.error || ''
          }
        }
      }

      // 2. フォールバック: BYOK token + LINE Push API (callLineApi 経由)
      if (!sent) {
        if (!channelAccessToken) {
          throw new Error(
            lastError ||
              'WF-LINE-TEST が応答せず、LINE Channel Access Token も未設定のため送信できません',
          )
        }
        const pushRes = await pushMessage(channelAccessToken, trimmed, messages)
        if (!pushRes?.success) {
          throw new Error(pushRes?.error || 'LINE Push API の呼び出しに失敗しました')
        }
      }

      onSuccess?.({
        recipient: trimmed,
        stepNumber: step.step_number,
      })
      onClose?.()
    } catch (err) {
      const msg = err?.message || 'テスト送信に失敗しました'
      setLocalError(msg)
      onError?.(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Send className="w-4 h-4" style={{ color: '#06C755' }} />
            テスト送信（{step?.step_number}通目）
          </h3>
          <button
            onClick={onClose}
            disabled={submitting}
            className="text-slate-400 hover:text-slate-600 disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {step?.body && (
          <div className="mb-3 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
            <pre className="whitespace-pre-wrap font-sans max-h-32 overflow-y-auto">
              {step.body.slice(0, 240)}
              {step.body.length > 240 ? '...' : ''}
            </pre>
          </div>
        )}

        <div className="mb-4">
          <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5" />
            送信先 LINE userId
          </label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            disabled={submitting}
            placeholder="U3245bf90258ccfae3b6ea2f43dfe390b"
            className={`w-full px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none disabled:opacity-50 ${
              recipient && !isValid
                ? 'border-red-300 focus:border-red-500'
                : 'border-slate-200 focus:border-green-500'
            }`}
            data-test-recipient
          />
          {recipient && !isValid && (
            <div className="mt-1 text-[11px] text-red-600">
              LINE userId は "U" + 32 文字の英数字
            </div>
          )}
          <div className="mt-1 text-[11px] text-slate-400">
            ※ 自分宛にテスト送信します。配信ログには記録されません。
          </div>
        </div>

        {localError && (
          <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>{localError}</div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            キャンセル
          </button>
          <button
            onClick={handleSend}
            disabled={submitting || !isValid}
            className="flex-1 px-4 py-2 text-white rounded-lg text-sm font-bold hover:opacity-90 flex items-center justify-center gap-2 disabled:opacity-40"
            style={{ backgroundColor: '#06C755' }}
            data-confirm-test-send
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                送信中...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                送信
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
