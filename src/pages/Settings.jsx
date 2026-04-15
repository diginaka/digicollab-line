import { useState } from 'react'
import { Key, CheckCircle2, XCircle, ExternalLink, Zap, MessageSquare, Info, Copy, Check, LogOut } from 'lucide-react'
import { supabase, isSupabaseMode } from '../lib/supabase'

// 自動配信連携サーバー ベースURL（CORS回避プロキシ）
// 環境変数が未設定でもデフォルト値で動作するようにハードコード
const N8N_BASE = import.meta.env.VITE_N8N_WEBHOOK_BASE || 'https://n8n.digicollabo.com'
const LINE_EVENTS_WEBHOOK = `${N8N_BASE}/webhook/dc-line-events`
const LINE_TEST_CONNECTION_URL = `${N8N_BASE}/webhook/dc-line-test-connection`

export default function Settings({ connection, setConnection, loading }) {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
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

  const testConnection = async () => {
    if (!connection.channelAccessToken) {
      setTestResult({ ok: false, message: 'Channel Access Tokenを入力してください' })
      return
    }

    setTesting(true)
    setTestResult(null)
    try {
      // 自動配信連携サーバー経由でLINE APIにアクセス（CORS回避）
      const res = await fetch(LINE_TEST_CONNECTION_URL, {
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

        // BYOK方式: 認証なしで channel_id をキーに upsert（anon RLS経由）
        // 既存の line_connections 行があれば更新、無ければ作成
        if (isSupabaseMode && supabase && data.botId) {
          try {
            const existing = await supabase
              .from('line_connections')
              .select('id')
              .eq('channel_id', data.botId)
              .order('updated_at', { ascending: false })
              .limit(1)
              .maybeSingle()

            const payload = {
              channel_access_token: connection.channelAccessToken,
              channel_id: data.botId,
              bot_name: data.botName || null,
              bot_icon_url: data.pictureUrl || null,
              n8n_webhook_url: LINE_EVENTS_WEBHOOK,
              is_connected: true,
              connected_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }

            if (existing.data?.id) {
              await supabase.from('line_connections').update(payload).eq('id', existing.data.id)
            } else {
              await supabase.from('line_connections').insert(payload)
            }
          } catch (err) {
            console.warn('DB保存エラー（接続テストは成功しています）:', err.message)
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

  // トークンマスク表示（先頭6文字 + ドット + 末尾4文字）
  const maskToken = (t) => {
    if (!t) return ''
    if (t.length <= 12) return '●'.repeat(t.length)
    return `${t.slice(0, 6)}${'●'.repeat(Math.min(12, t.length - 10))}${t.slice(-4)}`
  }

  // 接続解除（切断）
  const disconnect = async () => {
    if (!window.confirm('LINE接続を解除しますか？保存されているトークンも削除されます。')) return

    // state クリア
    setConnection({
      ...connection,
      channelAccessToken: '',
      botName: '',
      botIconUrl: '',
      channelId: '',
      n8nWebhookUrl: '',
      isConnected: false,
    })
    setTestResult(null)

    // DBのis_connectedフラグを更新（channel_id基準）
    if (isSupabaseMode && supabase && connection.channelId) {
      try {
        await supabase
          .from('line_connections')
          .update({
            is_connected: false,
            updated_at: new Date().toISOString(),
          })
          .eq('channel_id', connection.channelId)
      } catch (err) {
        console.warn('切断時のDB更新エラー:', err.message)
      }
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
        {connection.isConnected ? (
          // ===== 接続済み表示 =====
          <>
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3 mb-3">
              {connection.botIconUrl ? (
                <img src={connection.botIconUrl} alt={connection.botName} className="w-12 h-12 rounded-full shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center font-bold text-lg text-green-700 shrink-0">
                  {(connection.botName || 'L').charAt(0)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-bold text-green-900 text-sm">✅ 接続済み</div>
                <div className="text-sm text-green-800 font-bold truncate">{connection.botName || 'LINE Bot'}</div>
                {connection.channelId && (
                  <div className="text-[10px] text-green-600 font-mono">Bot ID: {connection.channelId}</div>
                )}
              </div>
            </div>

            <Field label="Channel Access Token（保存済み）">
              <div
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono text-slate-500 select-none"
                data-token-masked
              >
                {maskToken(connection.channelAccessToken)}
              </div>
            </Field>

            <button
              onClick={disconnect}
              className="mt-1 px-4 py-2 bg-white border border-red-300 text-red-600 rounded-lg text-sm font-bold hover:bg-red-50 flex items-center gap-1.5"
              data-disconnect
            >
              <LogOut className="w-4 h-4" /> 接続を解除
            </button>
          </>
        ) : (
          // ===== 未接続: 入力 + テストボタン =====
          <>
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
          </>
        )}
      </Section>

      {/* LINE Webhook URL設定カード（接続成功時のみ表示・目立つデザイン） */}
      {connection.isConnected && (
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-400 rounded-xl p-5 mb-4 shadow-sm" data-webhook-setup>
          <div className="flex items-start gap-2 mb-3">
            <div className="text-2xl">📋</div>
            <div className="flex-1">
              <h3 className="font-bold text-green-900 text-base">次のステップ: Webhook URLを設定</h3>
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

      {/* LINE Login セクション - 将来のメール×LINE紐付け機能用。現時点では非表示 */}
      {/*
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
      */}

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
