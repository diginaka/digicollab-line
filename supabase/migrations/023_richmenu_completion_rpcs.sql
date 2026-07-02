-- 機能③ Migration 023: WF からの完了通知 RPC + 全ユーザーへの遡及適用 RPC
-- 適用日: 2026-05-02 (Supabase MCP `apply_migration` で適用済)
-- 教訓⑤ (機能②継承): n8n の HTTP Request からの呼び出しに使うため complete_richmenu_link は RETURNS void
--                    フロントから呼ぶ enqueue_richmenu_refresh / apply_richmenu_rules_to_all_users は uuid / int OK

-- WF-LINE-RICHMENU が処理完了後に呼ぶ完了通知 RPC
CREATE OR REPLACE FUNCTION public.complete_richmenu_link(
  p_link_id uuid,
  p_status text,
  p_rich_menu_id uuid DEFAULT NULL,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('linked','unlinked','failed') THEN
    RAISE EXCEPTION 'invalid status: %', p_status;
  END IF;

  -- 教訓④継承: partial unique は on_conflict 不可 → 2 ステップで明示処理
  -- 同一ユーザーで status='linked' の他レコードを 'unlinked' に降格 (history化)
  IF p_status = 'linked' THEN
    UPDATE public.line_user_richmenu_links cur
       SET status = 'unlinked', updated_at = now()
      FROM public.line_user_richmenu_links target
     WHERE target.id = p_link_id
       AND cur.connection_id = target.connection_id
       AND cur.line_user_id = target.line_user_id
       AND cur.id <> target.id
       AND cur.status = 'linked';
  END IF;

  -- 対象 row を新 status に UPDATE
  UPDATE public.line_user_richmenu_links
     SET status = p_status,
         rich_menu_id = COALESCE(p_rich_menu_id, rich_menu_id),
         last_error = p_error,
         retry_count = retry_count + CASE WHEN p_status = 'failed' THEN 1 ELSE 0 END,
         last_attempted_at = now()
   WHERE id = p_link_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_richmenu_link(uuid, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_richmenu_link(uuid, text, uuid, text) TO authenticated, service_role, anon;

COMMENT ON FUNCTION public.complete_richmenu_link IS 'WF-LINE-RICHMENU の link/unlink 完了後に呼ばれる完了通知 RPC。RETURNS void で n8n HTTP Request の JSON parse 互換。status=linked の場合は同一ユーザーの既存 linked を unlinked に降格してから対象 row を更新 (partial unique 制約のため 2 ステップ)。';

-- 全ユーザー遡及適用 (manual ops 用、フロント UI からは呼ばない)
CREATE OR REPLACE FUNCTION public.apply_richmenu_rules_to_all_users(p_connection_id uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  rec record;
BEGIN
  FOR rec IN
    SELECT line_user_id FROM public.line_user_tags
     WHERE connection_id = p_connection_id AND COALESCE(is_active, true)
  LOOP
    PERFORM public.enqueue_richmenu_refresh(p_connection_id, rec.line_user_id, 'migration_apply');
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_richmenu_rules_to_all_users(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_richmenu_rules_to_all_users(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.apply_richmenu_rules_to_all_users IS '指定 connection の全 line_user_tags 行に対して enqueue_richmenu_refresh を発火させる遡及適用 RPC。Phase 1 ではコンソール (Supabase MCP execute_sql) からの手動運用のみ、フロント UI には公開しない。';
