# Cloudflare への商用デプロイ

## 構成

```
ブラウザ ──HTTPS──▶ Cloudflare (WAF / DDoS / TLS)
                     │
                     ├─ Static Assets ……… index.html・画像・Leaflet（CDN配信）
                     │
                     └─ Worker (cloudflare/worker.js) ※水平スケール
                          ├ Host固定・HTTP→HTTPS・セキュリティヘッダー（CSPはインラインJSのハッシュのみ許可）
                          ├ レート制限（認証 10回/分/IP、API 600回/分/IP）
                          ├ パスワードのscrypt計算（DBを止めないようWorker側で実行）
                          ├ JSON内の data:image を R2 へ保存し /media/<hash>.jpg に置換（有効なセッション確認後のみ・重複排除）
                          ├ /media/* 配信（R2 + エッジキャッシュ、immutable）
                          └─▶ Durable Object "TobiyoriDatabase"（1個・SQLite）
                                ├ app.cjs をそのまま実行（node:http 互換の薄い層のみ）
                                ├ トランザクションは storage.transactionSync
                                ├ 毎分のAlarm：期限処理（tidy）、公式サイト取得、管理者同期、日次バックアップ
                                └ 自動のPITR（30日分）＋ R2 への日次論理バックアップ
```

| 判断 | 理由 |
| --- | --- |
| 主DBは D1 ではなく SQLite Durable Object | 既存コードは同期SQLの結果で分岐する作りで、D1（非同期）に移すと全面書き換えになる。DOなら同期APIのまま、強い一貫性で動く |
| scrypt は Worker で計算 | DOは単一スレッド。ログイン集中時にDB全体が止まるのを防ぐ |
| 画像は R2 | DO SQLite は1値あたり約2MBが上限。写真3枚×900KBが1列に入る現状では超え得る。配信もCDNに乗る |
| ローカル用 Node サーバーは残す | 同じ app.cjs を使うので、既存テストがそのまま回帰テストになる |

Claude と Codex がそれぞれ独立に設計し、結論（DO + R2）が一致した構成です。Codex は scrypt と公式サイト取得を別の Node コンテナに隔離する案も出しました。今回は採用していません。理由は次のとおりです。

- Worker はリクエストごとに別インスタンスで動くため、CPU負荷はレート制限と組み合わせれば十分抑えられる
- Workers の fetch は私設ネットワークへ到達できないため、Node版のDNSピン留めが守っていた主な脅威（社内・メタデータへのSSRF）が成立しない

URL・リダイレクト・サイズ・時間の検査は Workers 版にも残しています。

## 初回セットアップ

前提として、Cloudflare の有料プラン（Workers Paid）と、Cloudflare に置いたドメインが必要です。

1. ドメインは `wrangler.jsonc` で設定済み（本番 `tobiyori.hibinoba.com`、ステージング `tobiyori-staging.hibinoba.com`）。DNSレコードと証明書はデプロイ時に Cloudflare が自動作成する。
2. ログインしてR2バケットを作る。
   ```sh
   npx wrangler login
   npm run cf:setup:staging
   npm run cf:setup:production
   ```
3. デプロイする（ビルドは自動で走る）。
   ```sh
   npm run cf:deploy:staging
   TOBIYORI_BASE=https://tobiyori-staging.hibinoba.com npm run test:cloudflare
   npm run cf:deploy:production
   ```
4. 運営管理者を設定する。
   1. アプリで新規登録する。
   2. ログイン中に `https://<ドメイン>/api/me` を開き、`id` を確認する。
   3. そのIDを登録する（複数ならカンマ区切り）。1分以内に反映される。
      ```sh
      npx wrangler secret put ADMIN_ACCOUNT_IDS --env production
      ```

   メールアドレスではなくIDで指定するのは、登録時にメールの所有確認がないためです。メールで指定すると、第三者が先に同じアドレスで登録して管理者になれてしまいます。リストが正本で、IDを外すと1分以内に権限が取り消されます（未設定にすると管理者がいなくなります）。

5. Cloudflare ダッシュボードで次を設定する。
   - SSL/TLS を Full (strict) にする
   - Always Use HTTPS をオンにする
   - WAF マネージドルールを有効にする
   - Bot Fight Mode を有効にする

## ローカルでの確認

```sh
npm run cf:dev            # http://localhost:8877 （本番と同じ workerd で実行）
npm run test:cloudflare   # 別ターミナルで
```

ローカルのデータは `.wrangler/` に保存されます（Git管理外）。

## 運用

- **ご意見**：利用者・団体担当・運営の誰でも、「その他」メニューやフッターから匿名で送れる。運営画面の「ご意見」で、画面別・種類別の集計、対応状況とタグの記録、CSV出力（Excelでそのまま開ける形式）ができる。アカウント・IP・連絡先は保存しない。送信時のアプリの版も記録するので、改善の前後を比べられる。

- **ログ**：ダッシュボードの Workers → Observability で確認できる。Cookie・パスワード・トークンは記録しない。
- **復旧**：
  - DOの更新は30日間、任意の時点に戻せる（`ctx.storage.getBookmarkForTime` → `onNextSessionRestoreBookmark`）。
  - 加えて、`tobiyori-backups` バケットの `db/YYYY-MM-DD.json` に日次の全テーブルが残る。セッションは除外。
  - バックアップには個人情報が含まれる。このバケットは公開しない。
- **スキーマ変更**：既存と同じく起動時の `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE` で行う。列は「追加 → 移行 → 削除」の順に分けて行う。

## 商用前に残っている課題

| 優先度 | 内容 |
| --- | --- |
| 高 | 地図タイル `tile.openstreetmap.org` は利用規約上、商用・高負荷の利用が認められていない。MapTiler・Stadia などの商用タイルに切り替え、`MAP_TILE_ORIGIN` を設定する |
| 高 | 利用規約・プライバシーポリシー・特定商取引法表記（有償機能がある場合）の整備。未成年の参加者を扱うため、保護者同意の運用も確認する |
| 中 | 単一DOの処理能力（目安で数百件/秒）を負荷試験で確認する。超える場合は、公開一覧のキャッシュ化、または地域単位でのDO分割を検討する |
| 中 | 参照されなくなったR2画像の掃除（現在は削除しない） |
| 中 | `style-src 'unsafe-inline'`（style属性が212か所あるため）。CSSのクラスへ移せば外せる |
| 低 | DO の配置場所は `locationHint: apac` で、東京になるとは限らない |
| 低 | `tobiyori-lounge-cute-v2.png`（1.8MB）を WebP に変換する |

Googleログインは 2026-10-16 に削除しました（メールアドレスとパスワードのみ）。戻す場合は、削除したコミットを `git revert` してください。
