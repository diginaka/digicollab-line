-- 機能③ Migration 022: line_user_tags の AFTER INSERT/UPDATE トリガから enqueue_richmenu_refresh を呼ぶ
-- 適用日: 2026-05-02 (Supabase MCP `apply_migration` で適用済)
-- tags 配列が変化、または unfollow → follow に戻った時に WF-LINE-RICHMENU の refresh_user_link を非同期発火

CREATE OR REPLACE FUNCTION public.line_user_tags_after_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_should_refresh bool := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_should_refresh := COALESCE(NEW.is_active, true);
  ELSIF TG_OP = 'UPDATE' THEN
    -- tags が変わった
    IF (OLD.tags IS DISTINCT FROM NEW.tags) THEN
      v_should_refresh := true;
    END IF;
    -- unfollow → follow に戻った
    IF (COALESCE(OLD.is_active,false) = false AND COALESCE(NEW.is_active,false) = true) THEN
      v_should_refresh := true;
    END IF;
  END IF;

  IF v_should_refresh AND NEW.connection_id IS NOT NULL THEN
    -- 失敗しても本トランザクションは止めない (BEGIN/EXCEPTION で WARNING のみ)
    BEGIN
      PERFORM public.enqueue_richmenu_refresh(NEW.connection_id, NEW.line_user_id, 'tag_trigger');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'enqueue_richmenu_refresh failed for %/%: %', NEW.connection_id, NEW.line_user_id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_line_user_tags_richmenu_refresh ON public.line_user_tags;
CREATE TRIGGER trg_line_user_tags_richmenu_refresh
  AFTER INSERT OR UPDATE OF tags, is_active ON public.line_user_tags
  FOR EACH ROW EXECUTE FUNCTION public.line_user_tags_after_change();

COMMENT ON TRIGGER trg_line_user_tags_richmenu_refresh ON public.line_user_tags
  IS 'tags 配列が変化した、または unfollow → follow に戻った時に WF-LINE-RICHMENU の refresh_user_link を非同期で呼ぶ。失敗時は WARNING のみで本トランザクションは継続。';
