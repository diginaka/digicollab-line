-- 機能③ Migration 021: line_user_richmenu_links 状態台帳 + line_rich_menus.priority カラム追加 + enqueue_richmenu_refresh RPC
-- 適用日: 2026-05-02 (Supabase MCP `apply_migration` で適用済)
-- 関連: 機能3 リッチメニュー個別切替 指示文（2026!5!2）.md / 機能3 確定判断 + 教訓継承 アドオン（2026!5!2）.md
-- RLS は既存 line_* テーブル (line_rich_menus, line_user_tags) と同じ anon_access + connection_id ownership パターン

-- 状態台帳
CREATE TABLE IF NOT EXISTS public.line_user_richmenu_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.line_connections(id) ON DELETE CASCADE,
  line_user_id text NOT NULL,
  rich_menu_id uuid REFERENCES public.line_rich_menus(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('pending','linked','unlinked','failed')),
  last_attempted_at timestamptz,
  last_error text,
  retry_count int NOT NULL DEFAULT 0,
  source text NOT NULL CHECK (source IN ('tag_trigger','manual','migration_apply','wh_follow')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- partial unique: 1ユーザー1接続につき currently linked は最大1件 (history は status=linked 以外で残す)
-- 教訓④: partial unique は PostgREST の on_conflict で扱えない → UPSERT は使わず complete_richmenu_link RPC で 2 ステップ処理する
CREATE UNIQUE INDEX IF NOT EXISTS uniq_line_user_richmenu_links_current_linked
  ON public.line_user_richmenu_links (connection_id, line_user_id)
  WHERE status = 'linked';

CREATE INDEX IF NOT EXISTS idx_line_user_richmenu_links_status
  ON public.line_user_richmenu_links (status, last_attempted_at);

CREATE INDEX IF NOT EXISTS idx_line_user_richmenu_links_user
  ON public.line_user_richmenu_links (connection_id, line_user_id, status);

COMMENT ON TABLE public.line_user_richmenu_links IS '個別ユーザーへのリッチメニュー紐付け状態。LINE Messaging API の link/unlink を発行した結果を永続化。status=linked は現在の紐付け、failed/unlinked は履歴。pg_net で WF-LINE-RICHMENU の refresh_user_link を呼ぶトリガ経由で書き込まれる。';

-- line_rich_menus に優先順位カラムを追加 (同じユーザーが複数 target_tags にマッチした場合の選択ルール)
ALTER TABLE public.line_rich_menus
  ADD COLUMN IF NOT EXISTS priority int NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.line_rich_menus.priority IS '個別切替時のマッチ優先順位 (大きいほど優先)。同一ユーザーが複数の target_tags にマッチした場合、priority DESC + updated_at DESC で1つだけ選ぶ。';

-- updated_at 自動更新トリガ
CREATE OR REPLACE FUNCTION public.touch_line_user_richmenu_links_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_line_user_richmenu_links ON public.line_user_richmenu_links;
CREATE TRIGGER trg_touch_line_user_richmenu_links
  BEFORE UPDATE ON public.line_user_richmenu_links
  FOR EACH ROW EXECUTE FUNCTION public.touch_line_user_richmenu_links_updated_at();

-- RLS (既存 line_rich_menus / line_user_tags パターンに統一)
ALTER TABLE public.line_user_richmenu_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anon_access_richmenu_links ON public.line_user_richmenu_links;
CREATE POLICY anon_access_richmenu_links
  ON public.line_user_richmenu_links
  FOR ALL
  USING (auth.role() = 'anon'::text);

DROP POLICY IF EXISTS own_richmenu_links ON public.line_user_richmenu_links;
CREATE POLICY own_richmenu_links
  ON public.line_user_richmenu_links
  FOR ALL
  USING (connection_id IN (SELECT id FROM public.line_connections WHERE user_id = auth.uid()));

-- enqueue helper RPC: フロントから手動切替時に呼ぶ点とトリガから呼ぶ点を統一
CREATE OR REPLACE FUNCTION public.enqueue_richmenu_refresh(
  p_connection_id uuid,
  p_line_user_id text,
  p_source text DEFAULT 'manual'
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link_id uuid;
  v_request_id bigint;
  v_webhook_url text := 'https://n8n.digicollabo.com/webhook/dc-line-richmenu';
BEGIN
  IF p_source NOT IN ('tag_trigger','manual','migration_apply','wh_follow') THEN
    RAISE EXCEPTION 'invalid source: %', p_source;
  END IF;

  INSERT INTO public.line_user_richmenu_links (connection_id, line_user_id, status, source, last_attempted_at)
  VALUES (p_connection_id, p_line_user_id, 'pending', p_source, now())
  RETURNING id INTO v_link_id;

  SELECT net.http_post(
    url := v_webhook_url,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object(
      'action', 'refresh_user_link',
      'connection_id', p_connection_id,
      'line_user_id', p_line_user_id,
      'link_record_id', v_link_id,
      'source', p_source
    )
  ) INTO v_request_id;

  RETURN v_link_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_richmenu_refresh(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_richmenu_refresh(uuid, text, text) TO authenticated, service_role, anon;

COMMENT ON FUNCTION public.enqueue_richmenu_refresh IS 'リッチメニュー切替を非同期で WF-LINE-RICHMENU に投げる統一エントリポイント。pending レコードを INSERT してから pg_net で n8n を叩く。完了通知は WF 側で line_user_richmenu_links.status を更新する。';
