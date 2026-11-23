# 直して公開する流れ（氏家さん・眞柄さん共通）

tobiyori.com は、氏家さんのCloudflareアカウントで、自分たちのデータを使って動いています（[own-data.md](own-data.md)）。
2人とも、この流れで直して公開します。コマンドはWindowsのPowerShellで打つ前提です（PowerShellでは `npx` ではなく `npx.cmd`、`npm` ではなく `npm.cmd` と打つ）。

## 最初の1回だけ

1. 招待を受ける
   - GitHub：yocate/tobiyori の招待（神保さんから届く）
   - Cloudflare：氏家さんのアカウントへの招待メール
2. Node.js 24 と Git を入れる
3. コードを取ってくる
   ```powershell
   git clone https://github.com/yocate/tobiyori.git
   cd tobiyori
   npm.cmd ci
   git config user.name "<GitHubのユーザー名>"
   git config user.email "<GitHubに登録したメールアドレス>"
   ```
4. Cloudflareにログインする（ブラウザーが開くので許可する）
   ```powershell
   npx.cmd wrangler login
   ```
5. 公開先のアカウントIDを、PowerShellのプロファイルに入れておく（IDは氏家さんに聞く。Gitには入れない）
   ```powershell
   Add-Content $PROFILE '$env:CLOUDFLARE_ACCOUNT_ID = "<アカウントID>"'
   ```

## 毎回の流れ

### 1. 最新を取る
もとにする枝は、[PR #2](https://github.com/yocate/tobiyori/pull/2) が main に入るまでは `feature/move-to-own-cloudflare`、入ったあとは `main`。
```powershell
git switch feature/move-to-own-cloudflare
git pull
```
AIに頼むときは、最初に「`ClaudeとCodexの共通メモ` と `docs/publish.md` を読んでから進めて」と伝える。

### 2. 自分の枝をつくって直す
```powershell
git switch -c fix/<直す内容>
```

### 3. パソコンで確かめる
```powershell
node tobiyori-server.cjs
```
http://localhost:4177/ （運営画面は /operator.html）で見た目と動きを確認する。関係するテスト（`node test-〇〇.cjs`）も通す。

### 4. GitHubへ送る
```powershell
git add <直したファイル>
git commit -m "<何を直したか>"
git push -u origin fix/<直す内容>
```
GitHubで、もとにした枝あてのプルリクエストを作る。もう1人が見て、問題なければ入れる。

### 5. 公開する
**公開は、もとにする枝の最新からだけ行う。** 自分の枝から直接公開すると、もう1人が先に公開した変更を消してしまう。
```powershell
git switch feature/move-to-own-cloudflare
git pull
npm.cmd run cf:deploy:tobiyori-com
```
公開する前に、もう1人へ「今から公開します」と一声かける。

### 6. 公開後に確かめる
- https://tobiyori.com/ と https://tobiyori.com/operator.html が開く
- 直したところが本番で直っている
- www.tobiyori.com を開くと tobiyori.com へ移る

### 7. 記録する
`ClaudeとCodexの共通メモ` の「作業の記録」に、日時・誰が・何を公開したかを1行書く。

## 使わないもの
- `npm run cf:deploy:production` と `wrangler.jsonc`：神保さん側の旧サイト（tobiyori.hibinoba.com）用。
- `SHARED_DATA_ORIGIN` を入れた設定：神保さん側のデータを一緒に使う形に戻ってしまう。

## うまくいかないとき
- 公開を元に戻す：`npx.cmd wrangler rollback -c wrangler.tobiyori-com.jsonc`（1つ前の版に戻る。データは戻らない）
- `npx` が動かない：PowerShellでは `npx.cmd` と打つ。
