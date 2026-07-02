# 機能③ リッチメニュー個別切替 — アーキテクチャ要約

> 2026-05-02 実装。LINE 公式アカウントのリッチメニューを **個別ユーザーごとに自動 / 手動切替** できるようにする 3 機能ロードマップの最終機能。

## 全体アーキテクチャ

```
[Frontend]                    [Supabase]                    [n8n]                       [LINE Messaging API]
RichMenus.jsx ───INSERT──────▶ line_rich_menus
                                target_tags / priority

Messages.jsx ────RPC──────────▶ enqueue_richmenu_refresh ───pg_net──▶ WF-LINE-RICHMENU
   (再実行)                                                            refresh_user_link
                                                                            │
                              line_user_tags ──AFTER trigger───────▶       │
                              tags 更新                                     ▼
                                                                       resolver (tags ∩ target_tags)
                                                                            │
                                                                            ├─ link──▶ POST link API
                                                                            └─ unlink▶ DELETE link API
                                                                            │
                                                                  ◀──────── complete_richmenu_link RPC
                              line_user_richmenu_links             (status=linked/unlinked/failed)
                              (状態台帳)

Messages.jsx ────WF直叩き─────────────────────────────────▶ WF-LINE-RICHMENU
   (固定/解除)   linkUserRichMenu / unlinkUserRichMenu       link_user / unlink_user
```

## DB 構成 (Supabase migrations 021/022/023)

| Object | 役割 |
|---|---|
| `line_user_richmenu_links` (新規 table) | 個別 link/unlink の状態台帳。partial unique で `status='linked'` は 1 user 1 row |
| `line_rich_menus.priority` (新規 column) | 個別切替時の優先順位 (大きいほど優先) |
| `line_rich_menus.target_tags` (既存) | OR マッチで個別切替対象を決める |
| `enqueue_richmenu_refresh(connection_id, line_user_id, source)` (新 RPC) | フロント / トリガから refresh を非同期発火 (RETURNS uuid = link_record_id) |
| `complete_richmenu_link(link_id, status, rich_menu_id, error)` (新 RPC) | n8n からの完了通知 (RETURNS void) |
| `apply_richmenu_rules_to_all_users(connection_id)` (新 RPC) | コンソール用の遡及適用 (RETURNS int = 件数) |
| `trg_line_user_tags_richmenu_refresh` (新 trigger) | line_user_tags.tags 変更時に enqueue_richmenu_refresh を非同期発火 |

RLS は既存 `line_*` テーブル統一パターン: `anon_access_*` (auth.role()='anon') + `own_*` (connection_id IN line_connections WHERE user_id = auth.uid())

## n8n WF-LINE-RICHMENU 拡張 (13 → 23 ノード)

### 9 actions

| # | action | エンドポイント |
|---|---|---|
| 0 | list | LINE GET /v2/bot/richmenu/list |
| 1 | create | LINE POST /v2/bot/richmenu |
| 2 | upload_image | LINE POST /v2/bot/richmenu/{id}/content |
| 3 | set_default | LINE POST /v2/bot/user/all/richmenu/{id} |
| 4 | cancel_default | LINE DELETE /v2/bot/user/all/richmenu |
| 5 | delete | LINE DELETE /v2/bot/richmenu/{id} |
| **6** | **link_user** | LINE POST /v2/bot/user/{userId}/richmenu/{richMenuId} |
| **7** | **unlink_user** | LINE DELETE /v2/bot/user/{userId}/richmenu |
| **8** | **refresh_user_link** | resolver → 6 or 7 にルーティング |

### 新規 10 ノード

- `rm-link-user` / `rm-unlink-user` (HTTP, onError: continueErrorOutput)
- `rm-prep-link-success` / `rm-prep-unlink-success` / `rm-prep-fail` (Code 整形)
- `rm-complete-rpc` (HTTP → complete_richmenu_link RPC)
- `rm-refresh-fetch-tags` / `rm-refresh-fetch-menus` (HTTP GET to Supabase)
- `rm-refresh-resolve` (Code, target_tags OR マッチ + priority DESC で 1 件選定)
- `rm-resolved-switch` (Switch on resolvedAction = link / unlink)

## Frontend (digicollab-line)

| ファイル | 変更内容 |
|---|---|
| `src/lib/lineProxy.js` | `richMenuProxy` (9 actions サポート、コメント更新) / `linkUserRichMenu` / `unlinkUserRichMenu` 便利関数追加 |
| `src/pages/RichMenus.jsx` | dbMenus / availableTags state / loadDbMenus / loadAvailableTags / createMenu に line_rich_menus INSERT 追加 / saveMenuMeta (UPDATE or INSERT) / メニューカード badge / プレビューパネル「自動切替設定」 / CreateModal 「自動切替設定」 |
| `src/pages/Messages.jsx` | richMenuPanel state / loadRichMenuStatus / handleRefreshAuto / handlePinTo / handleUnlink / 会話ヘッダのトグル + 展開パネル UI (現在状態 / アクション / 履歴) |
| `supabase/migrations/021〜023.sql` | DDL 適用済の SQL ファイル (本番は MCP で適用済、これらはローカル文書) |

## 教訓継承 (機能①② → 機能③) の遵守チェック

| 教訓 | 適用箇所 | 遵守状況 |
|---|---|---|
| ① n8n Code ノードで `$env.X` 禁止 | WF 全体 | ✅ Supabase 認証は credential `ggbicx9TBJ3h1T5T` 経由 |
| ② Code ノードからの fetch は不可 | rm-refresh-fetch-tags/menus を HTTP Request ノードで分離 | ✅ |
| ③ `$('NodeName').first()` は throw する | rm-prep-link-success で resolver 参照を try/catch | ✅ |
| ④ partial unique は on_conflict 不可 | complete_richmenu_link で 2 ステップ処理 | ✅ |
| ⑤ RPC RETURNS 型は呼び出し元期待と整合 | complete_richmenu_link は RETURNS void | ✅ |
| ⑥ 配信パイプラインで管理画面表示連動は明示実装 | line_user_richmenu_links への状態書き戻しを完了通知 RPC で確実に行う | ✅ |
| ⑦ 着手前 WF backup 必須 | `.claude-instructions/n8n-backups/wf-line-richmenu-2026-05-02-pre-individual-link.json` | ✅ |

## 主要 ID リファレンス

```
Supabase project_id: whpqheywobndaeaikchh
LINE connection_id: 1feb3eb9-e2d1-45cb-a1a5-14345600c213
LINE user_id (達也さん maru): U3245bf90258ccfae3b6ea2f43dfe390b
WF-LINE-RICHMENU id: QvjtVzobntX7xr4W (active)
WF-LINE-RICHMENU webhook: https://n8n.digicollabo.com/webhook/dc-line-richmenu
n8n base URL: https://n8n.digicollabo.com
LINE bot frontend: https://line.digicollabo.com
Supabase Header Auth credential (n8n): ggbicx9TBJ3h1T5T
```

## テストパターン (Cowork が Phase 1 で実施予定)

| # | テスト | 期待結果 |
|---|---|---|
| α | `link_user` 直接 curl | スマホで richmenu A が即時表示 |
| β | `unlink_user` 直接 curl | 個別リンク解除、デフォルトに戻る |
| γ | `refresh_user_link` を target_tags 一致タグで叩く | 該当 richmenu に自動 link |
| δ | `refresh_user_link` を target_tags 不一致タグで叩く | unlink (デフォルト降格) |
| ε | priority 付き複数候補 | 最高 priority メニューが選ばれる |
| ζ | `line_user_tags.tags` を SQL UPDATE | trigger → enqueue → WF → link 完了が一連で走る |

## Phase 2 (将来拡張)

- リトライ cron (`status='failed'` を pg_cron で 10 分毎に再実行)
- ルール優先順位の UI ドラッグ並べ替え
- Phase 5: A/B 切替 / 期間限定切替 / リッチメニュー画像の AI 自動生成

## 関連 backup / snapshot

- 着手前: `.claude-instructions/n8n-backups/wf-line-richmenu-2026-05-02-pre-individual-link.json` (13 ノード)
- 拡張後: `.claude-instructions/n8n-backups/wf-line-richmenu-2026-05-02-individual-link-final.json` (23 ノード + 設計メモ + 教訓継承明記)
