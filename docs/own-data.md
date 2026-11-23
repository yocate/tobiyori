# 自分のCloudflareで、自分のデータを使って動かす

2026年11月23日、新しい入口（tobiyori.com）は、旧サイトのデータを共通で使う形（[shared-data.md](shared-data.md)）をやめ、自分のCloudflareアカウントのDurable Objectを正本にしました。旧サイトのアカウントは引き継いでいないため、利用者は tobiyori.com で登録し直します。

## 設定

- `APP_ORIGIN`: 正式な住所（例 `https://tobiyori.com`）。セッションはホストごとなので、自分のデータで動かすときの住所は1つにする。
- `REDIRECT_HOSTS`: 同じWorkerにつないだ別の住所（カンマ区切りのホスト名）。`APP_ORIGIN` へ転送する。GET/HEADは301、それ以外はメソッドを保つ308。`SHARED_DATA_ORIGIN` があるときは使わない。
- `SHARED_DATA_ID_ALIASES`: 自分のデータで動かすときも使える。共通データの期間に配ったURL（旧サイトのID）を、自分のDBのIDへ読み替える。向きは「旧サイトのID → 自分のDBのID」。
- `OWN_DATA_ACCOUNT_NOTICE`: `existing` のときだけ「これまでのトビヨリのアカウントでログインできます」を表示する。旧サイトのバックアップを読み込んだ場合に使う。
- `SHARED_DATA_ORIGIN` と `SHARED_FRONTEND_ORIGINS` は設定しない。設定すると共通データの形に戻る。

アカウントIDを含む個人用のWrangler設定はリポジトリに入れない。

## 旧サイトのバックアップを読み込む（任意）

旧サイトの日次バックアップ（`db/YYYY-MM-DD.json`）があれば、アカウント・パスワード・申込み・連絡板を引き継げる。セッションは含まれないので、ログインは1回やり直しになる。

1. `wrangler secret put RESTORE_SECRET`（32文字以上）
2. `wrangler r2 object put <BACKUPSのバケット>/restore/<名前>.json --file <バックアップ> --remote`
3. `POST /internal/restore`、`Authorization: Bearer <RESTORE_SECRET>`、本文 `{"key":"restore/<名前>.json","replace":true}`
4. 終わったら `wrangler secret delete RESTORE_SECRET`

- 読み込む前のデータは `db/pre-restore-<時刻>.json` に保存する。これを同じ手順で読み込めば戻せる。
- 中身が不完全なバックアップは、削除の前に拒否する。読み込み中は他の書き込みを止める。
- `RESTORE_SECRET` がない間、`/internal/restore` は404を返す。共通データの形の間は409で拒否する。

## 確認

```sh
node test-restore-backup.cjs
node test-shared-data.cjs
node test-frontend-origin.cjs
```
