import { useState } from 'react'
import { Key, CheckCircle2, ExternalLink, Zap, MessageSquare, Info, Copy, Check } from 'lucide-react'

// SE-5 PR-B（2026-06-24）: LINE 接続（Channel Access Token）の管理は
// 「統合ツール設定」（ハブ digicollabo.com）へ集約された。本画面はトークンの
// 入力・接続テスト・DB への直書き（anon upsert / 接続解除書き込み）を行わず、
// 接続ステータスの read-only 表示と、統合ツール設定への導線のみを担う。
// ボット基本設定・Webhook URL 表示は従来どおり維持する。

// 自動配信連携サーバー ベースURL（CORS回避プロキシ）
const N8N_BASE = import.meta.env.VITE_N8N_WEBHOOK_BASE || 'https://n8n.digicollabo.com'
const LINE_EVENTS_WEBHOOK = `${N8N_BASE}/webhook/dc-line-events`

// ハブ（統合ツール設定）。SSO ハブと同じ既定値を流用する。
const HUB_URL = import.meta.env.VITE_AUTH_HUB_URL || 'https://digicollabo.com'
const INTEGRATIONS_URL = `${HUB_URL}/#/integrations`

export default function Settings({ connection, setConnection, loading }) {
  const [copied, setCopied] = useState(false)

  const update = (field, value) => setConnection({ ...connection, [field]: value })

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500 text-sm">
          接続情報を読み込み中...
        </div>
      </div>
    )
  }

  const copyWebhookUrl = async () => {
    try {
      await navigator.clipboard.writeText(LINE_EVENTS_WEBHOOK)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = LINE_EVENTS_WEBHOOK
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto" data-page="settings">
      {/* 接続の入口案内（トークン設定は統合ツール設定へ集約） */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 mb-5" data-setup-guide>
        <div className="flex items-start gap-2 mb-3">
          <Info className="w-5 h-5 text-yellow-700 shrink-0 mt-0.5" />
          <h3 className="font-bold text-yellow-900">LINE 接続は「統合ツール設定」で行います</h3>
        </div>
        <p className="text-sm text-yellow-900 ml-1">
          チャネルアクセストークンの登録・接続テスト・接続解除は、管理画面の
          <strong>「統合ツール設定」</strong>に移動しました。トークンは暗号化して安全に保存され、
          本画面では設定しません。本画面では接続状態の確認とボット基本設定・Webhook
          URL の確認ができます。
        </p>
        <a
          href={INTEGRATIONS_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 mt-3 text-sm font-bold text-yellow-800 hover:text-yellow-900"
          data-integrations-link
        >
          統合ツール設定を開く <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Messaging API 接続状態（read-only） */}
      <Section icon={Key} title="LINE Messaging API（接続状態）">
        {connection.isConnected ? (
          // ===== 接続済み表示（read-only） =====
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3" data-line-status="connected">
            {connection.botIconUrl ? (
              <img src={connection.botIconUrl} alt={connection.botName} className="w-12 h-12 rounded-full shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center font-bold text-lg text-green-700 shrink-0">
                {(connection.botName || 'L').charAt(0)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="font-bold text-green-900 text-sm flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> 接続済み
              </div>
              <div className="text-sm text-green-800 font-bold truncate">{connection.botName || 'LINE Bot'}</div>
              {connection.channelId && (
                <div className="text-[10px] text-green-600 font-mono">Bot ID: {connection.channelId}</div>
              )}
              <div className="text-[11px] text-green-700 mt-1">
                アクセストークンは統合ツール設定で暗号化管理されています。
              </div>
            </div>
          </div>
        ) : (
          // ===== 未接続表示（入口は統合ツール設定） =====
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg" data-line-status="disconnected">
            <div className="text-sm font-bold text-slate-700 mb-1">未接続</div>
            <p className="text-xs text-slate-500">
              LINE 公式アカウントを接続するには、
              <a
                href={INTEGRATIONS_URL}
                target="_blank"
                rel="noreferrer"
                className="text-green-700 font-bold underline hover:text-green-900 inline-flex items-center gap-1"
                data-integrations-link
              >
                統合ツール設定 <ExternalLink className="w-3 h-3" />
              </a>
              からトークンを登録してください。
            </p>
          </div>
        )}
      </Section>

      {/* LINE Webhook URL 設定カード（接続成功時のみ表示・read-only 表示） */}
      {connection.isConnected && (
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-400 rounded-xl p-5 mb-4 shadow-sm" data-webhook-setup>
          <div className="flex items-start gap-2 mb-3">
            <div className="text-2xl">📋</div>
            <div className="flex-1">
              <h3 className="font-bold text-green-900 text-base">Webhook URL（LINE Developers に設定）</h3>
              <p className="text-xs text-green-800 mt-1">この設定は1回だけ行えばOKです。</p>
            </div>
          </div>

          <ol className="text-sm text-slate-700 space-y-1 mb-4 list-decimal list-inside ml-1">
            <li>下のURLをコピー</li>
            <li>
              <a
                href="https://developers.line.biz/console/"
                target="_blank"
                rel="noreferrer"
                className="text-green-700 font-bold underline hover:text-green-900 inline-flex items-center gap-1"
              >
                LINE Developersコンソール <ExternalLink className="w-3 h-3" />
              </a>
              → Messaging API設定 → Webhook URL に貼り付け
            </li>
            <li>「Webhookの利用」を<strong>ON</strong>にする</li>
          </ol>

          <div className="flex items-stretch gap-2 mb-2">
            <div className="flex-1 px-3 py-3 bg-white border-2 border-green-300 rounded-lg text-sm font-mono text-slate-800 break-all flex items-center shadow-inner">
              {LINE_EVENTS_WEBHOOK}
            </div>
            <button
              onClick={copyWebhookUrl}
              className={`px-5 rounded-lg text-sm font-bold flex items-center gap-1.5 transition shadow-sm ${
                copied
                  ? 'bg-green-600 text-white'
                  : 'bg-white border-2 border-green-500 text-green-700 hover:bg-green-50'
              }`}
              data-copy-webhook
            >
              {copied ? <><Check className="w-4 h-4" /> コピーしました！</> : <><Copy className="w-4 h-4" /> コピー</>}
            </button>
          </div>

          <div className="text-[11px] text-slate-600 mt-2">
            ※ LINEからのイベント（友だち追加・メッセージ受信など）がこのURLに届きます。
          </div>
        </div>
      )}

      {/* 自動配信連携（表示のみ・接続時に自動設定） */}
      <Section icon={Zap} title="自動配信連携">
        <p className="text-xs text-slate-500 mb-3">
          ステップ配信の実行やリッチメニューの自動切替に使用します。
          接続時に自動設定されます。
        </p>
        <Field label="Webhook URL">
          <input
            type="text"
            value={connection.n8nWebhookUrl}
            onChange={(e) => update('n8nWebhookUrl', e.target.value)}
            placeholder="https://example.com/webhook/..."
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-500"
          />
        </Field>
      </Section>

      {/* ボット基本設定 */}
      <Section icon={MessageSquare} title="ボット基本設定">
        <Field label="あいさつメッセージ（友だち追加時）">
          <textarea
            value={connection.greetingMessage}
            onChange={(e) => update('greetingMessage', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-500 resize-none"
          />
        </Field>
        <div className="flex items-center gap-2 mt-3">
          <input
            type="checkbox"
            id="auto-reply"
            checked={connection.autoReplyEnabled}
            onChange={(e) => update('autoReplyEnabled', e.target.checked)}
            className="w-4 h-4 rounded"
          />
          <label htmlFor="auto-reply" className="text-sm text-slate-700">自動応答を有効にする</label>
        </div>
      </Section>
    </div>
  )
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-100">
        <Icon className="w-5 h-5" style={{ color: '#06C755' }} />
        <h3 className="font-bold text-slate-800">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-bold text-slate-600 mb-1.5">{label}</label>
      {children}
    </div>
  )
}
