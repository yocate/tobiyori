# トビヨリ

地域コミュニティ・大学やサークル・企業の活動を探し、初参加から継続参加につなげるWebアプリです。

## 現在開発しているアプリ

現在の利用者画面は `http://localhost:4177/`、運営者画面は `http://localhost:4177/operator.html` です。
`tobiyori-server.cjs` が `成果物/gunma-community-map.html` を配信し、アカウントや団体・参加情報をローカルのSQLiteに保存します。

- 画面：HTML / CSS / JavaScript
- サーバー：Node.js 24以上（組み込みのSQLiteを使用）
- Googleログイン：Google OAuthの設定が必要
- データ保存先：`.tobiyori-data/`（Git管理対象外）

`client/` と `server/` には別構成のReact / TypeScript / Prisma版のコードもあります。現在の4177番ポートのアプリを修正するときは、ルートのサーバーと `成果物/` 内のコードを使用してください。

## 初回の起動

Node.js 24以上を用意し、このフォルダーで実行します。

```sh
npm ci
npm run start:tobiyori
```

起動後に `http://localhost:4177/` を開きます。Windowsでは依存関係の準備後に「トビヨリを起動.cmd」も使用できます。

新しいパソコンでは利用者データが空の状態で始まります。アプリの新規登録後、運営者にするアカウントは「運営管理者を設定.cmd」で指定します。
Googleログインを使う場合は「Googleログインを設定.cmd」から、各パソコンで設定してください。設定用JSONをGitHubへ追加しないでください。

## 本番環境（Cloudflare）

商用環境は Cloudflare Workers + Durable Object（SQLite）+ R2 で動かします。構成・初回セットアップ・運用は [docs/cloudflare.md](docs/cloudflare.md) を参照してください。

```sh
npm run cf:dev             # ローカルで本番と同じ実行環境を起動（http://localhost:8877）
npm run cf:deploy:staging  # ステージングへデプロイ
```

## ファイルの構成

| ファイル | 内容 |
| --- | --- |
| `成果物/gunma-community-map.html` | 現在配信している利用者画面・運営画面 |
| `成果物/*.js`、`成果物/*.css` | 機能ごとの編集用コード。HTML内に埋め込まれた同じ箇所にも変更を反映します |
| `app.cjs` | API本体（アカウント・保存処理）。ローカルとCloudflareで共通 |
| `tobiyori-server.cjs` | ローカル用のNodeサーバー（配信と app.cjs の起動） |
| `cloudflare/` | Cloudflare用の入口（Worker・Durable Object・画像のR2保存） |
| `community-service.cjs` | 団体・募集・審査・参加などの処理 |
| `waiting-room.cjs` | よりみちラウンジの処理 |
| `google-auth.cjs` | Googleログインの処理 |
| `test-*.cjs` | 機能の確認用テスト |

## 2台のパソコンで開発する流れ

別のパソコンには、送信先リポジトリを `git clone` してから上記の初回準備を行います。

1. 作業前に `git pull --ff-only` で最新の変更を取り込みます。
2. コードを修正し、画面や関係する機能を確認します。
3. `git status` と `git diff` で送るファイル・変更内容を確認します。
4. 変更したファイルを `git add ファイル名` で選び、`git commit -m "変更内容"` で記録します。
5. `git push` でGitHubへ送り、もう一方のパソコンでは作業前に再び取り込みます。

取り込みで競合が発生した場合は、両方の変更を確認して解消します。相手の変更を消す強制pushは使用しません。
GitHubで共有するのはソースコードです。アプリの利用者情報・ログイン状態・団体データが2台で自動共有されるわけではありません。

## 確認コマンド

変更に関係するテストを選んで実行します。

```sh
npm run test:account-ui
npm run test:communities
npm run test:google
```

ブラウザーを使う一部のテストにはPlaywrightとブラウザーの用意が別途必要です。

## 共有対象

`.gitignore` でアプリのコード・必要な画像・テストを共有対象とし、次のものを除外しています。

- 利用者のデータベース、セッション、ログ
- Googleの秘密キーや環境設定ファイル
- インストール済みライブラリー、生成済みファイル、バックアップ
- この作業フォルダーにある企画書、発表資料、卒論などの個人ファイル

現在のサーバーはこのパソコン内の接続向けに動作します。GitHubへのpushは、一般向けWebサービスの公開とは別の操作です。
