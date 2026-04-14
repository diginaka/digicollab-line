import { useState } from 'react'
import { Key, CheckCircle2, XCircle, ExternalLink, Zap, MessageSquare, Info, Copy, Check } from 'lucide-react'
import { supabase, isSupabaseMode } from '../lib/supabase'

// n8n Webhook Base URL（CORS回避プロキシ）
const N8N_BASE = import.meta.env.VITE_N8N_WEBHOOK_BASE || ''
const LINE_EVENTS_WEBHOOK = N8N_BASE ? `${N8N_BASE}/webhook/dc-line-events` : ''

export default function Settings({ connection, setConnection }) {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [copied, setCopied] = useState(false)

  const update = (field, value) => setConnection({ ...connection, [field]: value })

  const testConnection = async () => {
    if (!connection.channelAccessToken) {
      setTestResult({ ok: false, message: 'Channel Access Tokenを入力してください' })
      return
    }
    if (!N8N_BASE) {
      setTestResult({ ok: false, message: '連携サーバーのURLが設定されていません。管理者にお問い合わせください。' })
      return
    }

    setTesting(true)
    setTestResult(null)
    try {
      // n8n Webhookプロキシ経由でLINE APIにアクセス（CORS回避）
      const res = await fetch(`${N8N_BASE}/webhook/dc-line-test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: connection.channelAccessToken }),
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }

      const data = await res.json()

      if (data.status === 'connected') {
        const next = {
          ...connection,
          botName: data.botName || 'LINE Bot',
          botIconUrl: data.pictureUrl || '',
          channelId: data.botId || '',
          n8nWebhookUrl: LINE_EVENTS_WEBHOOK,
          isConnected: true,
        }
        setConnection(next)
        setTestResult({ ok: true, message: `接続成功！ ${data.botName || 'LINE Bot'}` })

        // Supabaseモード時は line_connections テーブルに保存
        if (isSupabaseMode && supabase) {
          try {
            const { data: userData } = await supabase.auth.getUser()
            const userId = userData?.user?.id
            if (userId) {
              await supabase.from('line_connections').upsert(
                {
                  user_id: userId,
                  channel_access_token: connection.channelAccessToken,
                  channel_id: data.botId || null,
                  bot_name: data.botName || null,
                  bot_icon_url: data.pictureUrl || null,
                  n8n_webhook_url: LINE_EVENTS_WEBHOOK,
                  is_connected: true,
                  connected_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
                { onConflict: 'user_id' },
              )
            }
          } catch (err) {
            console.warn('Supabase保存エラー（接続テストは成功しています）:', err.message)
          }
        }
      } else {
        const errMsg = data.error || data.message || 'LINE APIへの接続に失敗しました'
        setTestResult({
          ok: false,
          message: `接続失敗: ${errMsg}`,
        })
        setConnection({ ...connection, isConnected: false })
      }
    } catch (err) {
      setTestResult({
        ok: false,
        message: `接続失敗: ${err.message}`,
      })
      setConnection({ ...connection, isConnected: false })
    } finally {
      setTesting(false)
    }
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
      {/* 初期セットアップ手順 */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 mb-5" data-setup-guide>
        <div className="flex items-start gap-2 mb-3">
          <Info className="w-5 h-5 text-yellow-700 shrink-0 mt-0.5" />
          <h3 className="font-bold text-yellow-900">初期セットアップ手順</h3>
        </div>
        <ol className="space-y-2 text-sm text-yellow-900 list-decimal list-inside ml-1">
          <li>LINE Developersコンソールでチャネル（Messaging API）を作成</li>
          <li>「Messaging API設定」タブで「チャネルアクセストークン（長期）」を発行</li>
          <li>発行されたトークンを下のフィールドに貼り付け</li>
          <li>「接続テスト」ボタンで動作確認</li>
          <li>成功したら、表示されるWebhook URLをLINE Developersに貼り付け</li>
        </ol>
        <a
          href="https://developers.line.biz/console/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 mt-3 text-sm font-bold text-yellow-800 hover:text-yellow-900"
        >
          LINE Developersコンソールを開く <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Messaging API設定 */}
      <Section icon={Key} title="LINE Messaging API（必須）">
        <Field label="Channel Access Token（長期）">
          <input
            type="password"
            value={connection.channelAccessToken}
            onChange={(e) => update('channelAccessToken', e.target.value)}
            placeholder="eyJhbGciOi..."
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-green-500"
            data-token-input
          />
        </Field>

        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <button
            onClick={testConnection}
            disabled={testing}
            className="px-4 py-2 text-white rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
            style={{ backgroundColor: '#06C755' }}
            data-test-connection
          >
            <Zap className="w-4 h-4" /> {testing ? 'テスト中...' : '接続テスト'}
          </button>
          {testResult && (
            <div className={`flex items-center gap-1.5 text-sm ${testResult.ok ? 'text-green-700' : 'text-red-600'}`}>
              {testResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {testResult.message}
            </div>
          )}
        </div>

        {!testResult?.ok && testResult && (
          <div className="mt-2 text-xs text-slate-500 ml-1">
            💡 ヒント: Channel Access Tokenが正しいか、Messaging APIが有効化されているか確認してください。
          </div>
        )}

        {connection.isConnected && connection.botName && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
            {connection.botIconUrl ? (
              <img src={connection.botIconUrl} alt={connection.botName} className="w-10 h-10 rounded-full" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center font-bold text-green-700">
                {connection.botName.charAt(0)}
              </div>
            )}
            <div>
              <div className="font-bold text-green-900 text-sm">✅ LINE接続済み — {connection.botName}</div>
              <div className="text-xs text-green-700">Messaging API経由で接続されています</div>
            </div>
          </div>
        )}
      </Section>

      {/* LINE Webhook URL設定カード（接続成功時のみ表示） */}
      {connection.isConnected && LINE_EVENTS_WEBHOOK && (
        <Section icon={Zap} title="📋 LINE Webhook URL設定">
          <p className="text-sm text-slate-600 mb-3">
            接続テスト成功後、以下のURLを<strong>LINE Developersコンソール</strong>の
            「Messaging API設定 → Webhook URL」に貼り付けてください。
          </p>

          <div className="flex items-stretch gap-2 mb-3">
            <div className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-700 break-all flex items-center">
              {LINE_EVENTS_WEBHOOK}
            </div>
            <button
              onClick={copyWebhookUrl}
              className={`px-4 rounded-lg text-sm font-bold flex items-center gap-1.5 transition ${
                copied ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {copied ? <><Check className="w-4 h-4" /> コピー済み</> : <><Copy className="w-4 h-4" /> コピー</>}
            </button>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
            <div className="font-bold mb-1">⚙️ LINE Developersコンソールでの設定</div>
            <ul className="list-disc list-inside space-y-1 text-blue-800">
              <li>Messaging API設定 → Webhook設定 → 上記URLを貼り付け</li>
              <li>「Webhookの利用」を <strong>ON</strong> にする</li>
              <li>「検証」ボタンで接続確認（Success表示なら完了）</li>
            </ul>
          </div>
        </Section>
      )}

      {/* LINE Login */}
      <Section icon={ExternalLink} title="LINE Login（オプション）">
        <p className="text-xs text-slate-500 mb-3">
          LINE Login経由でメールアドレスを自動取得し、デジコラボ メール（MailerLite）や決済（Stripe）と紐づけます。
        </p>
        <Field label="LIFF URL">
          <input
            type="text"
            value={connection.liffUrl}
            onChange={(e) => update('liffUrl', e.target.value)}
            placeholder="https://liff.line.me/..."
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-500"
          />
        </Field>
      </Section>

      {/* 自動配信連携 */}
      <Section icon={Zap} title="自動配信連携">
        <p className="text-xs text-slate-500 mb-3">
          ステップ配信の実行やリッチメニューの自動切替に使用します。
          接続テスト成功時に自動設定されます。
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
