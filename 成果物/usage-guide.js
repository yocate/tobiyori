function homeGuideSummaryHTML(){
 return `<section class="section container home-guide-summary" aria-labelledby="homeGuideTitle"><div class="section-head"><div><h2 id="homeGuideTitle">はじめての方へ</h2><p>使い方は、ご利用ガイドで確認できます。</p></div><button class="btn btn-secondary btn-sm" data-nav="guide">ご利用ガイド</button></div><div class="home-guide-lines"><div><h3>参加までの流れ</h3><p>活動を探す → 内容を確認 → 申し込む → 承認後に参加</p><a href="#/guide/participant">参加する方向けのガイドを見る</a></div><div><h3>参加の記録</h3><p>参加履歴・ポイント・バッジはマイページで確認できます。</p><a href="#/mypage">マイページを見る</a></div><div><h3>コミュニティを運営する方へ</h3><p>団体登録から募集、参加者の受け入れまでをご案内します。</p><a href="#/guide/community">コミュニティ向けのガイドを見る</a></div></div></section>`;
}
function viewGuide(){
 const org=current.param==='community';
 return `<div class="container section usage-guide"><div class="section-head"><div><div class="eyebrow">Guide</div><h1>ご利用ガイド</h1><p>知りたい項目を開いて、使い方を確認できます。</p></div></div><nav class="guide-audience" aria-label="利用する立場"><a href="#/guide/participant" ${!org?'aria-current="page"':''}>参加する方向け</a><a href="#/guide/community" ${org?'aria-current="page"':''}>コミュニティ運営者向け</a></nav><h2>${org?'コミュニティの登録から活動後まで':'活動を見つけて参加するまで'}</h2>${org?`
 <details open><summary>1 団体を登録する</summary><p>「団体をかんたん登録」から、団体名・種類・地域・活動ジャンル・紹介文を入力します。学生団体やサークルも登録できます。紹介文の下書き補助を使い、内容を確認してから提出してください。</p><button class="btn btn-primary btn-sm" data-nav="orgSignup">団体を登録する</button></details>
 <details><summary>2 活動写真やSNSで雰囲気を伝える</summary><p>登録フォーム、または地域団体用ページの「活動写真・SNS」から写真を3枚まで登録できます。JPEG・PNG・WebP形式で、1枚5MB以下の写真を選びます。写っている人の掲載同意を確認し、説明文も添えましょう。</p><p>公式ホームページやSNSのURLを入力すると、公開後の団体紹介から開けます。写真・リンクの更新も審査対象です。</p></details>
 <details><summary>3 募集を作って審査に提出する</summary><p>「募集の作成」から活動名、ジャンル、対象学年、活動地域、内容を入力します。初参加者にも分かるように、具体的な作業、持ち物、責任者、交通手段、危険性、保険情報を整えてください。急な人手不足には「おたすけ募集」を使えます。</p><p>本番では代表者の本人確認と募集の事前審査を経て公開します。試作版の審査操作は同じブラウザ内のデモです。</p></details>
 <details><summary>4 応募者を確認して受け入れる</summary><p>「応募者の確認」で申込内容と参加条件を確認します。承認前に活動の説明を行い、承認した参加者に集合場所や当日の連絡方法を案内する運用を想定しています。</p><p>個人SNSの交換を必須にせず、サービス内の連絡を基本とします。初回は昼間・公共の場所・複数人での活動を推奨します。未成年者は保護者同意などの手続きを確認してください。</p></details>
 <details><summary>5 活動完了を報告して次につなげる</summary><p>「活動完了報告」で参加と活動内容を記録し、お礼や次回の案内を伝えます。事故や困りごとは運営に相談してください。継続参加は本人の希望を確かめて相談します。</p><p>実績や信頼ランクでは、人数だけでなく、事前説明・フォロー・安全情報の更新などの丁寧な運営を大切にします。ランクは安全を保証するものではありません。</p></details>
 <div class="guide-actions"><button class="btn btn-primary" data-nav="org">地域団体用ページへ</button><button class="btn btn-secondary" data-nav="safety">安心・安全について</button></div>
 `:`
 <details open><summary>1 気になる活動を探す</summary><p>地図や一覧から、キーワード・市町村・ジャンル・大学・対象学年などで探します。大学に関係するサークルも検索できます。地図が開けない場合は一覧検索やGoogleマップへのリンクをご利用ください。</p><button class="btn btn-primary btn-sm" data-nav="list">活動を探す</button></details>
 <details><summary>2 活動内容と団体を確認する</summary><p>活動の目的、作業内容、日時、持ち物、参加条件、交通手段、危険性、保険、撮影方針を確認します。団体紹介では普段の活動写真や公式SNSも参考にできます。</p><p>公開画面では大まかな地域を確認し、正確な集合場所は承認後に案内する設計です。確認状況や口コミだけで判断せず、不明点は事前に相談しましょう。</p></details>
 <details><summary>3 見学や体験参加を申し込む</summary><p>活動詳細で「見学する」「体験参加する」「継続参加を相談する」から選びます。必要事項を入力して申し込み、マイページで状況を確認します。申し込んだ時点で参加確定ではありません。</p><p>未成年者は、保護者同意などの追加手続きが必要になる場合があります。試作版の申し込みはブラウザ内のデモで、実在団体へ送信されません。</p></details>
 <details><summary>4 承認後に参加する</summary><p>承認と当日の案内を確認してから参加します。責任者や緊急連絡先を確認し、不安なことや参加できなくなった場合は事前に相談します。</p><p>個人SNSの交換は必須ではありません。勧誘や無断撮影など、気になることがあれば相談・通報を利用してください。</p></details>
 <details><summary>5 参加の記録とポイントを見る</summary><p>マイページで、申込状況・参加予定・参加履歴・ポイント・ジャンルバッジを確認できます。プロフィールの興味を登録すると、条件に合う活動を理由付きで紹介します。アバターも自分好みに作成できます。</p><p>レベルは「ふもと → 妙義 → 榛名 → 赤城 → 上毛三山マスター」。到達点は${LEVELS.map(l=>`${l.name} ${l.min}pt`).join('、')}です。ポイントに合わせてロゴのキャラクターが山を登ります。宝箱は達成を表すイラストで、景品との交換機能はありません。</p><p>活動証明の表示はサンプルです。正式な証明書発行は今後の対応となります。</p><button class="btn btn-secondary btn-sm" data-nav="mypage">マイページで確認する</button></details>
 <div class="guide-actions"><button class="btn btn-primary" data-nav="list">活動を探す</button><button class="btn btn-secondary" data-nav="safety">安心・安全について</button></div>
 `}<p class="guide-demo-note">現在はサンプルデータで操作を試すプロトタイプです。保存した内容はこのブラウザでのみ確認でき、実際の本人確認・連絡配信・参加承認とは異なります。</p></div>${footerHTML()}`;
}
