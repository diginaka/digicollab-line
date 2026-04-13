import { useState } from 'react'
import { Key, CheckCircle2, XCircle, ExternalLink, Zap, MessageSquare, Info } from 'lucide-react'
import { getBotInfo } from '../lib/lineApi'

export default function Settings({ connection, setConnection }) {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  const update = (field, value) => setConnection({ ...connection, [field]: value })

  const testConnection = async () => {
    if (!connection.channelAccessToken) {
      setTestResult({ ok: false, message: 'Channel Access Tokenを入力してください' })
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const info = await getBotInfo(connection.channelAccessToken)
      setConnection({
        ...connection,
        botName: info.displayName || 'LINE Bot',
        botIconUrl: info.pictureUrl || '',
        isConnected: true,
      })
      setTestResult({ ok: true, message: `接続成功！ ${info.displayName}` })
    } catch (err) {
      setTestResult({ ok: false, message: `接続失敗: ${err.message}。CORS制限の場合はn8n中継を検討してください。` })
      setConnection({ ...connection, isConnected: false })
    } finally {
      setTesting(false)
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
          <li>成功したら準備完了！友だち管理・配信が利用できます</li>
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

        <div className="flex items-center gap-3 mt-3">
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

        {connection.isConnected && connection.botName && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center font-bold text-green-700">
              {connection.botName.charAt(0)}
            </div>
            <div>
              <div className="font-bold text-green-900 text-sm">{connection.botName}</div>
              <div className="text-xs text-green-700">接続済み</div>
            </div>
          </div>
        )}
      </Section>

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

      {/* n8n連携 */}
      <Section icon={Zap} title="n8n Webhook連携">
        <p className="text-xs text-slate-500 mb-3">
          ステップ配信の実行、リッチメニューの自動切替、CORS制限の回避などに使用します。
        </p>
        <Field label="Webhook URL">
          <input
            type="text"
            value={connection.n8nWebhookUrl}
            onChange={(e) => update('n8nWebhookUrl', e.target.value)}
            placeholder="https://n8n.example.com/webhook/..."
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
