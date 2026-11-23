# 新サイトの公開設定

2026年11月23日の最新方針は、自分たちのCloudflareと独立したDBで運用すること。正式URLは `https://tobiyori.com`、運営者入口は `/operator.html`。`www.tobiyori.com` と従来のworkers.dev入口は正式URLへ転送する。

旧サイトとの共有を行っていた時期の `wrangler.personal.json`・`wrangler.domain.json` を再利用してはならない。`SHARED_DATA_ORIGIN` は設定せず、新サイトのDB・R2・管理者設定を保持する。旧サイトのアカウント・申込み・残席・連絡板が自動同期されるとは案内しない。新サイトの利用者は新サイト用のアカウントでログインする。

## 公開する時

1. 共有Gitの最新と手元の変更を確認し、対象のテストと `node scripts/build-assets.cjs` を実行する。
2. 個人用の独立DB向け設定を使う。アカウントID、DB/R2のバインディング、ID対応表を含む実設定はリポジトリ外で管理する。今回の統合版は外部の `wrangler.reviewed-own.json` を使う。
3. 設定の `main` と `assets.directory` が公開したい作業フォルダーを指すこと、`APP_ORIGIN` が正式URLであること、`SHARED_DATA_ORIGIN` がないことを確認する。
4. 明示した空の環境ファイルと `--keep-vars` でdry-runを確認し、利用者の公開指示の範囲でデプロイする。デフォルトの `npm run cf:deploy:production` は従来サイト向けのため、この新サイト用には使わない。
5. 公開履歴の反映率、HTMLとCSP、公開カタログ、別名ホストの転送、通知接続を確認する。実募集へのテスト申込み・投稿や、DB復元を公開確認のために行わない。

## 移行に関係する処理

- ID対応表は旧サイトから共有されたURLを、新サイトに存在するIDへ読み替えるもの。自分たちのDBでは、旧アカウントを使えるという共有モードの案内を表示しない。
- 別名ホストへのGET/HEADは301、それ以外は308で正式URLへ転送し、POSTのメソッドを保つ。
- `/internal/restore` は `RESTORE_SECRET` が未設定なら無効。通常の公開で鍵を有効化したり、復元を実行したりしない。
- 復元用のコードは、不完全なバックアップを拒否し、事前保存から置換までを直列化する。`test-restore-backup.cjs` のローカル試験と、本番データを復元したことは区別する。

今回、Claude Code側の独立運用への変更と、Codex側の入力保持・更新競合・通知接続の修正を同じソースへ統合した。元の別作業フォルダーは書き換えていない。
