# トビヨリのアプリを共同開発するための指示

- 作業開始時に `docs/agent-collaboration.md` と `docs/collaboration-status.md`、README、Gitの状態を確認する。
- CodexとClaude Codeで同じ目的・仕様・検証結果を引き継ぐ。別のAIの会話を自動で読めるとは扱わない。確認した内容と未確認を分ける。
- 同じファイルを二つのツールで同時編集しない。Claude Codeの改修は別worktreeで始め、確認後に差分を取り込む。読むだけのレビューは同じworktreeを使ってよい。
- 依頼された範囲を実装・検証する。GitHubへの送信・main統合・Cloudflareへの公開、Slackやメールの送信は、その操作についての利用者の指示がある時だけ行う。
- 現行はHTML/CSS/JavaScript、Cloudflare Workers、Durable Object内SQLite、画像R2。古い企画書から技術構成を推測しない。
- UIソースと `成果物/gunma-community-map.html` 内の埋込みを一致させる。公開用ビルドは `node scripts/build-assets.cjs`。実表示を確認する。
- 本人の新しい訂正を優先。団体登録目標20は目標であり実績ではない。募集文のAI下書き機能は不採用で、勝手に追加しない。
- 会議の助言・仕様・実装・公開・効果確認を区別する。11/23の最新方針は自分たちの独立DBで運用すること。利用者の指示なくSHARED_DATA_ORIGINを設定して旧保存先へ戻さない。
- 個人情報、認証情報、私的な会議記録、支払い情報、データベース、個人用Cloudflare設定をコードやGitへ入れない。レビューの入力にも含めない。
- 日本語は自然で具体的に。検証していない内容を「完了」「確認済み」としない。
