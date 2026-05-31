# CLAUDE.md — フロービルダー(本リポジトリ)

このファイルは Claude Code がセッション開始時に必ず自動で読み込みます。
詳細ルールは Craft の正本ドキュメントを参照してください。

## 正本ドキュメント

- フロービルダー 自律並列開発ルール v1.0(Opus 4.8 / Dynamic Workflows)
  https://docs.craft.do/editor/d/eb42ae3b-f06f-84d3-7e4a-592e6b4dc2ad/2d5bb3c9-6359-f78d-c10d-95da6229874e
- フロービルダー 2台運用 実行台帳(Live Dispatch Board)
  https://docs.craft.do/editor/d/eb42ae3b-f06f-84d3-7e4a-592e6b4dc2ad/c958a39f-79ae-d922-3bff-b62b2c9a7f02

セッション開始プロトコルは flowbuilder-session-init スキルを参照(自動適用)。
機体識別は CLAUDE.local.md を参照(gitignored・Macごと)。

## ハードルール(絶対遵守・例外なし)

1. 本番 DB(Supabase project_id: whpqheywobndaeaikchh)への書き込み・スキーマ変更は明示許可制
   - apply_migration を本番に対して実行する前に、必ず人間の許可を得ること
   - 開発中は mcp__supabase__create_branch でブランチ DB を作成して作業

2. 本番デプロイは明示許可制 & 単独エージェント実行
   - 対象本番ドメイン: digicollabo.com / cart.digicollabo.com / page.digicollabo.com / course.digicollabo.com / webinar.digicollabo.com / book.digicollabo.com / flow-builder.thefusebase.app
   - 並列ワークフローの最終ステップとして 1 本だけ起動すること
   - プレビュー(Cloudflare Pages preview branch)は並列 OK

3. 配信系(MailerLite / LINE / n8n)はデフォルト draft モード
   - 開発中・テスト中の generated_step_contents.delivery_status は 'draft' を強制
   - 本番配信は機能完成後の単独実行ステップ

4. 並列作業時は git worktree 隔離を必須
   - .claude/worktrees/{ブランチ名}/ 配下で動作
   - 触るファイル領域はオーケストレーターが起動時に明示分割

5. 破壊的操作(rm -rf, DROP TABLE, force push 等)は明示許可制

## 並列開発のブランチ構成

- 機能ブランチ 4 本: feat/xxx(worktree 隔離)
- テストブランチ 1 本: test/e2e-*(E2E を集約)
- 移行ブランチ 1 本: migration/supabase-*(DB スキーマ変更を一本化)

マージ順序: 各機能 → テスト統合 → main → プレビュー → (人間承認) → 本番(単独)

## Dynamic Workflows 起動キーワード

- プロンプトに「workflow」と入れる
- /effort ultracode
- /deep-research

要件: Claude Code v2.1.154+ / Opus 4.8。

## 起票時の必須突合

新タスク起票時、Craft §9「マスター表」と現状の .env.local / Cloudflare 環境変数を突合し、
不足を「キー名 / 用途 / 取得先」で列挙して人間の承認を得てから着手すること。

## このリポジトリ固有の情報

- リポジトリ: diginaka/digicollab-line
- 本番ドメイン: line.digicollabo.com
- 主要テーブル: flowbuilder_apps / flow_builder_funnels / generated_step_contents / funnel_templates / fb_bookings
- 管理画面: /admin
- BYOK モデル(ユーザー API キー前提)

---

最終更新: 2026/05/31(v1.0 初版)
