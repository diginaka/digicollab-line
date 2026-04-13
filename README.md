# デジコラボ LINE

自分のLINE公式アカウントを日本語UIで簡単に管理できるマーケティングツール。
Lステップの簡易代替として、友だち管理・ステップ配信・一斉配信・リッチメニュー切替をシンプルな画面で操作できます。

## 特徴

- **BYOK（Bring Your Own Key）方式** — ユーザー自身のLINE Channel Access Tokenを使用
- **データはLINE側に留まる** — 友だち情報はLINE APIから都度取得、デジコラボ側は保存しません
- **二刀流モード** — Supabase接続 / standalone の両対応
- **FuseBase埋め込み対応** — iframe内でも正しくレイアウト

## クイックスタート

```bash
npm install
cp .env.example .env
# .env を編集（standaloneなら空でもOK）
npm run dev
```

`npm run build` でビルドし、`dist/` を任意のホスティングに配置してください。

## LINE設定

1. [LINE Developersコンソール](https://developers.line.biz/console/)でチャネル作成
2. Messaging APIを有効化
3. 「チャネルアクセストークン（長期）」を発行
4. アプリの「設定」画面に貼り付けて接続テスト

## 画面構成

- ダッシュボード（友だち数・配信数・稼働シーケンス）
- 友だち管理（タグ付け・検索・詳細パネル）
- ステップ配信（ビジュアルステップビルダー）
- 一斉配信（タグ絞り込み + プレビュー）
- リッチメニュー（LINE風プレビュー）
- 設定（Token・LIFF・n8n Webhook）

## Supabaseテーブル設計（supabaseモード時）

以下のSQLを実行してください。

```sql
-- ユーザー別LINE接続設定
CREATE TABLE line_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_access_token TEXT NOT NULL,
  channel_id TEXT,
  bot_name TEXT,
  bot_icon_url TEXT,
  liff_url TEXT,
  n8n_webhook_url TEXT,
  greeting_message TEXT DEFAULT 'ようこそ！',
  auto_reply_enabled BOOLEAN DEFAULT true,
  auto_reply_keywords JSONB DEFAULT '[]',
  is_connected BOOLEAN DEFAULT false,
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE line_user_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES line_connections(id) ON DELETE CASCADE,
  line_user_id TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  email TEXT,
  stripe_customer_id TEXT,
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(connection_id, line_user_id)
);

CREATE TABLE line_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES line_connections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('friend_added', 'tag_added', 'purchase_completed', 'keyword_match')),
  trigger_config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE line_sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID REFERENCES line_sequences(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  delay_minutes INTEGER DEFAULT 0,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'flex', 'image', 'video')),
  message_content TEXT NOT NULL,
  condition_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE line_broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES line_connections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_tags TEXT[] DEFAULT '{}',
  message_content TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed')),
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  total_sent INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE line_rich_menus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES line_connections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  line_rich_menu_id TEXT,
  layout_type TEXT DEFAULT '2x3',
  areas_json JSONB NOT NULL DEFAULT '[]',
  target_tags TEXT[] DEFAULT '{}',
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE line_delivery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES line_connections(id) ON DELETE CASCADE,
  delivery_type TEXT NOT NULL CHECK (delivery_type IN ('broadcast', 'sequence', 'individual')),
  reference_id UUID,
  total_sent INTEGER DEFAULT 0,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS有効化とポリシー設定
ALTER TABLE line_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_user_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_rich_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_delivery_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_connection" ON line_connections FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_tags" ON line_user_tags FOR ALL USING (connection_id IN (SELECT id FROM line_connections WHERE user_id = auth.uid()));
CREATE POLICY "own_sequences" ON line_sequences FOR ALL USING (connection_id IN (SELECT id FROM line_connections WHERE user_id = auth.uid()));
CREATE POLICY "own_steps" ON line_sequence_steps FOR ALL USING (sequence_id IN (SELECT s.id FROM line_sequences s JOIN line_connections c ON s.connection_id = c.id WHERE c.user_id = auth.uid()));
CREATE POLICY "own_broadcasts" ON line_broadcasts FOR ALL USING (connection_id IN (SELECT id FROM line_connections WHERE user_id = auth.uid()));
CREATE POLICY "own_rich_menus" ON line_rich_menus FOR ALL USING (connection_id IN (SELECT id FROM line_connections WHERE user_id = auth.uid()));
CREATE POLICY "own_logs" ON line_delivery_logs FOR ALL USING (connection_id IN (SELECT id FROM line_connections WHERE user_id = auth.uid()));

-- standalone配布版用（anon）
CREATE POLICY "anon_access" ON line_connections FOR ALL USING (auth.role() = 'anon');
CREATE POLICY "anon_access" ON line_user_tags FOR ALL USING (auth.role() = 'anon');
CREATE POLICY "anon_access" ON line_sequences FOR ALL USING (auth.role() = 'anon');
CREATE POLICY "anon_access" ON line_sequence_steps FOR ALL USING (auth.role() = 'anon');
CREATE POLICY "anon_access" ON line_broadcasts FOR ALL USING (auth.role() = 'anon');
CREATE POLICY "anon_access" ON line_rich_menus FOR ALL USING (auth.role() = 'anon');
CREATE POLICY "anon_access" ON line_delivery_logs FOR ALL USING (auth.role() = 'anon');
```

## データの所在（重要）

| データ | 保存先 |
|---|---|
| 友だち一覧・プロフィール | LINE側（API都度取得） |
| メッセージ送受信履歴 | LINE側 |
| Channel Access Token | Supabase（暗号化推奨） |
| ステップ配信シナリオ定義 | Supabase |
| 一斉配信の予約・履歴 | Supabase |
| リッチメニュー設定 | Supabase + LINE側 |

個人情報はSupabaseに保存しません。
