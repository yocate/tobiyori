# トビヨリ

群馬のコミュニティと活動を探し、参加前の疑問を解消して、申込みから参加記録まで確認できるWebアプリです。

- 利用者画面：[tobiyori.hibinoba.com](https://tobiyori.hibinoba.com/)
- 運営・コミュニティ担当者画面：[operator.html](https://tobiyori.hibinoba.com/operator.html)
- ステージング：[tobiyori-staging.hibinoba.com](https://tobiyori-staging.hibinoba.com/)

## 主な使い方

1. **活動を探す**：一覧・地図・コミュニティの紹介から内容を確認します。「よりみち発見」では現在地または市を選び、開催中・7日以内・14日以内の活動を距離の目安で探せます。現在地は検索時だけ取得し、端末内の照合に使います。公開エリアの目安位置がない活動は近隣検索に出ません。
2. **参加前に確かめる**：活動の参加条件と次の操作を先に表示します。活動への質問と、コミュニティへの匿名質問は別の掲示板です。コミュニティへの質問はログインして送信し、担当者が回答すると質問と回答を公開します。質問者の名前は表示しません。
3. **参加を検討・申し込む**：活動ごとのラウンジは任意の交流場所です。ラウンジへの入室、コミュニティの保存・フォローはいずれも参加申込みにはなりません。申込み後、担当者が受け入れると参加予定になります。
4. **参加を振り返る**：担当者が参加完了を記録した活動はマイページの参加記録で確認できます。その記録から満足度と感想を投稿し、本人が編集・削除できます。口コミはコミュニティの「参加者の口コミ」と件数にも反映され、他の利用者が通報できます。

マイページは「参加」「保存・フォロー」「設定」に整理しています。保存したコミュニティは詳細を見返すため、フォローは新着通知を受けるための機能です。運営へのご意見は匿名質問とは別に送れます。画面で使う語とその意味は [docs/ux-language.md](docs/ux-language.md) にまとめています。

## 運営・コミュニティ担当者の操作

運営者はコミュニティの掲載・確認、活動の審査、相談・通報、ご意見を扱います。コミュニティ担当者は募集、申込みと参加完了、活動への質問、コミュニティへの匿名質問への回答を扱います。回答前の匿名質問は公開されず、担当者が不適切な質問を非表示にできます。参加完了の確認と口コミの投稿・編集・削除の権限はサーバー側でも検証します。

## ローカルで起動

Node.js 24以上を用意し、このフォルダーで実行します。

```sh
npm ci
npm run start:tobiyori
```

利用者画面は `http://localhost:4177/`、運営・担当者画面は `http://localhost:4177/operator.html` です。`tobiyori-server.cjs` が `成果物/gunma-community-map.html` を配信し、データを `.tobiyori-data/` のSQLiteに保存します。Windowsでは依存関係の準備後に「トビヨリを起動.cmd」も使用できます。

新しいパソコンでは利用者データが空の状態で始まります。アプリで新規登録した後、運営者にするアカウントは「運営管理者を設定.cmd」で指定します。ローカルと本番のアカウント・掲載内容は自動同期しません。

## 実装と配置

| ファイル | 内容 |
| --- | --- |
| `成果物/gunma-community-map.html` | 実際に配信する利用者・運営画面。画面変更時の反映先 |
| `成果物/*.js`、`成果物/*.css` | 機能ごとの編集用コード。HTMLに埋め込まれた対応箇所も更新する |
| `app.cjs` | アカウント・保存処理を含むAPI本体。ローカルとCloudflareで共通 |
| `community-service.cjs`、`community-questions.cjs` | コミュニティ、活動、参加、口コミ、匿名質問の処理 |
| `waiting-room.cjs`、`activity-questions.cjs` | ラウンジと活動ごとの質問 |
| `feedback.cjs` | 運営へのご意見と集計 |
| `tobiyori-server.cjs` | ローカル用のNodeサーバー |
| `cloudflare/`、`scripts/build-assets.cjs` | 本番用Workerと公開アセットのビルド |
| `test-*.cjs` | API・画面・権限の確認用テスト |

`client/` と `server/` には別構成のReact / TypeScript / Prisma版のコードもあります。現在公開しているアプリの修正には、ルートのサーバーと `成果物/` を使用します。

## テスト

変更に関係するテストを選んで実行します。画面テストにはPlaywrightとChromeが必要です。

```sh
node test-community-questions.cjs
node test-nearby-discovery.cjs
node test-serendipity.cjs
npm run test:communities
npm run cf:build
```

`test-community-questions.cjs` は公開範囲と権限、`test-nearby-discovery.cjs` は現在地・開催時期・匿名質問の画面操作を確認します。Cloudflare上の通しテストは [docs/cloudflare.md](docs/cloudflare.md) を参照してください。

## 本番環境

Cloudflare Workers、SQLite Durable Object、R2で動かします。構成、デプロイ、運用上の課題は [docs/cloudflare.md](docs/cloudflare.md) に記載しています。ステージングで確認してから本番に反映します。

```sh
npm run cf:deploy:staging
npm run cf:deploy:production
```

両コマンドはビルドを含みます。設定済みの通常変数を保持し、ローカルの既定の環境ファイルを読み込まないオプションを付けています。

## ソースの共有

`.gitignore` はアプリのソース、必要な画像、テストを対象とし、利用者データベース、セッション、秘密情報、生成物、個人資料を除外します。ソースを共有しても、ローカルの利用者データやログイン状態は共有されません。
