# 共有データを使う入口への独自ドメイン追加

`APP_ORIGIN` の既存URLを保ったまま、`SHARED_FRONTEND_ORIGINS` にカンマ区切りで追加のHTTPS Originを指定できる。共有データモード専用の明示的な許可リストであり、任意のHost・転送先を受け付ける設定ではない。

Wranglerの `routes` に取得済みのドメインを `custom_domain:true` で追加する。CloudflareがDNS・証明書を用意する。設定ファイルの個人用アカウントIDや団体の移行対応表を共有リポジトリへ追加しない。

受信ホストに対応するOriginを、その要求の共有データ検証・CSPに使う。基礎の `APP_ORIGIN`、Durable Object、R2、共通保存先は変更しない。各ドメインのログインCookieはホスト限定のため、新しいドメインでは同じアカウントで一度ログインする。CookieをURLで引き継いだりDomain属性を広げたりしない。

`node test-frontend-origin.cjs` と `node test-shared-data.cjs` で明示ホストの受入れ、既存入口の保持、同一保存先、別Origin書込みの拒否を確認する。公開後に新旧入口のHTML・カタログ・HTTPS・ログイン・運営者入口を確認する。一般アカウントでの確認を本人の運営権限確認と混同しない。
