import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function hash(pw: string) {
  return bcrypt.hash(pw, 10);
}

async function main() {
  console.log("シードデータを投入しています...");

  // --- Operator (運営) ---
  await prisma.user.upsert({
    where: { email: "operator@d-cross.jp" },
    update: {},
    create: {
      email: "operator@d-cross.jp",
      passwordHash: await hash("password123"),
      name: "運営 太郎",
      role: "OPERATOR",
    },
  });

  // --- Students ---
  await prisma.user.upsert({
    where: { email: "student1@d-cross.jp" },
    update: {},
    create: {
      email: "student1@d-cross.jp",
      passwordHash: await hash("password123"),
      name: "田中 花子",
      role: "STUDENT",
      studentProfile: {
        create: {
          university: "群馬大学",
          interests: "子どもの学習支援,留学生との国際交流",
          availableDays: "土,日",
          transportMethod: "電車・バス",
          preferredCity: "前橋市",
        },
      },
    },
  });
  await prisma.user.upsert({
    where: { email: "student2@d-cross.jp" },
    update: {},
    create: {
      email: "student2@d-cross.jp",
      passwordHash: await hash("password123"),
      name: "鈴木 一郎",
      role: "STUDENT",
      studentProfile: {
        create: {
          university: "高崎経済大学",
          interests: "スポーツ・文化活動,祭り・イベント運営",
          availableDays: "土,日,金",
          transportMethod: "自転車",
          preferredCity: "高崎市",
        },
      },
    },
  });

  // --- Organizations + representative users ---
  // 実証版(v1)は前橋市・高崎市の2市に限定: 6団体(学生サークル1団体を含む)・活動10件(おたすけ募集を含む)
  type OrgSeed = {
    email: string;
    repName: string;
    orgName: string;
    category: string;
    description: string;
    insuranceInfo: string;
    verifiedStatus: "APPROVED" | "PENDING";
    activities: {
      title: string;
      description: string;
      genre: string;
      city: string;
      lat: number;
      lng: number;
      dateTime: string;
      participationTypes: string;
      beginnerFriendly: boolean;
      riskLevel: "LOW" | "MEDIUM" | "HIGH";
      insuranceCovered: boolean;
      capacity: number;
      transportNote?: string;
      durationMinutes?: number;
      parkingAvailable?: boolean;
      transportCost?: string;
      contactPerson?: string;
      itemsToBring?: string;
      photoPolicy?: string;
      prohibitedNotes?: string;
      isHelpRequest?: boolean;
    }[];
  };

  const orgs: OrgSeed[] = [
    {
      email: "org-matsuri@d-cross.jp",
      repName: "前橋まつり実行委員会 事務局",
      orgName: "前橋まつり実行委員会",
      category: "祭り・イベント運営",
      description: "前橋市の夏祭り・七夕まつりの企画運営を行う実行委員会です。毎年多くの学生ボランティアが活躍しています。",
      insuranceInfo: "イベント傷害保険加入済み(当日分)",
      verifiedStatus: "APPROVED",
      activities: [
        {
          title: "前橋七夕まつり 運営スタッフ募集",
          description: "会場設営、案内、屋台エリアの運営補助をお願いします。初めての方は先輩スタッフと一緒に行動するので安心です。",
          genre: "祭り・イベント運営",
          city: "前橋市",
          lat: 36.3906,
          lng: 139.0604,
          dateTime: "2026-10-04T09:00:00+09:00",
          participationTypes: "VISIT,ONE_TIME",
          beginnerFriendly: true,
          riskLevel: "LOW",
          insuranceCovered: true,
          capacity: 20,
          transportNote: "前橋駅から徒歩10分。公共施設(前橋中央公民館)集合。",
          durationMinutes: 240,
          parkingAvailable: true,
          transportCost: "実費支給あり(上限500円)",
          contactPerson: "実行委員会 事務局長 高橋",
          itemsToBring: "動きやすい服装、飲み物、軍手",
          photoPolicy: "記録用に撮影しSNSで使用する場合あり。写りたくない方は事前にお伝えください。",
          prohibitedNotes: "無断での屋台商品の持ち出し、来場者への個人的な勧誘行為は禁止です。",
        },
        {
          title: "【おたすけ募集】明日の会場設営、あと3人足りません!",
          description: "台風の影響で設営が1日押してしまい、急遽人手が足りなくなりました。テーブル・テント設営を手伝ってくれる方を探しています。単発・数時間だけでも大歓迎です。",
          genre: "祭り・イベント運営",
          city: "前橋市",
          lat: 36.3897,
          lng: 139.0631,
          dateTime: "2026-09-12T13:00:00+09:00",
          participationTypes: "ONE_TIME",
          beginnerFriendly: true,
          riskLevel: "LOW",
          insuranceCovered: true,
          capacity: 5,
          transportNote: "前橋中央公民館、直接現地集合でOKです。",
          durationMinutes: 120,
          contactPerson: "実行委員会 事務局長 高橋(当日携帯 090-xxxx-xxxx)",
          isHelpRequest: true,
        },
      ],
    },
    {
      email: "org-manabi@d-cross.jp",
      repName: "たかさき学習支援ネット 代表",
      orgName: "たかさき学習支援ネット",
      category: "子どもの学習支援",
      description: "高崎市内の公民館で、小中学生向けの無料学習会を継続的に開催しているNPOです。",
      insuranceInfo: "ボランティア活動保険加入済み",
      verifiedStatus: "APPROVED",
      activities: [
        {
          title: "土曜寺子屋 学習サポーター",
          description: "小中学生の宿題・勉強のサポートをします。教科は問いません。継続参加歓迎ですが単発体験も可能です。",
          genre: "子どもの学習支援",
          city: "高崎市",
          lat: 36.3229,
          lng: 139.0033,
          dateTime: "2026-09-26T13:00:00+09:00",
          participationTypes: "VISIT,ONE_TIME,ONGOING",
          beginnerFriendly: true,
          riskLevel: "LOW",
          insuranceCovered: true,
          capacity: 15,
          transportNote: "高崎市総合福祉センター(公共施設)、昼間開催。",
          durationMinutes: 90,
          parkingAvailable: true,
          transportCost: "無料",
          contactPerson: "代表 小林",
          itemsToBring: "筆記用具(貸出可)",
          photoPolicy: "子どもたちが写る撮影は行いません。運営スタッフのみ記録用に撮影する場合があります。",
          prohibitedNotes: "子どもたちへの連絡先交換、個別の呼び出しは禁止です。",
        },
      ],
    },
    {
      email: "org-shotengai@d-cross.jp",
      repName: "高崎新町商店街振興組合 担当",
      orgName: "高崎新町商店街振興組合",
      category: "商店街SNS・動画制作",
      description: "高崎市新町の商店街の魅力をSNSや動画で発信するプロジェクトを進めています。",
      insuranceInfo: "活動中の傷害保険は個別加入をご案内",
      verifiedStatus: "APPROVED",
      activities: [
        {
          title: "商店街PR動画 制作メンバー募集",
          description: "地元商店の紹介ショート動画を学生目線で企画・撮影・編集します。機材の貸し出しあり。",
          genre: "商店街SNS・動画制作",
          city: "高崎市",
          lat: 36.3410,
          lng: 138.9980,
          dateTime: "2026-10-10T14:00:00+09:00",
          participationTypes: "ONE_TIME,ONGOING",
          beginnerFriendly: true,
          riskLevel: "LOW",
          insuranceCovered: false,
          capacity: 8,
          transportNote: "高崎駅から徒歩15分。商店街内、昼間開催。",
          durationMinutes: 180,
          transportCost: "自己負担(高崎駅からのバス代程度)",
          contactPerson: "振興組合 担当 中村",
          itemsToBring: "スマートフォン(撮影に使う場合)",
          photoPolicy: "商店主の許可を得た店舗のみ撮影・投稿します。個人の顔出しは同意した人のみ。",
          prohibitedNotes: "許可なく店舗の商品を撮影・SNS投稿することは禁止です。",
        },
        {
          title: "空き店舗リノベ ワークショップ",
          description: "商店街の空き店舗を学生アイデアで活用するワークショップ企画メンバーを募集します。",
          genre: "空き店舗・地域資源の活用",
          city: "高崎市",
          lat: 36.3427,
          lng: 139.0005,
          dateTime: "2026-10-24T13:30:00+09:00",
          participationTypes: "VISIT,ONE_TIME",
          beginnerFriendly: true,
          riskLevel: "LOW",
          insuranceCovered: false,
          capacity: 10,
          durationMinutes: 120,
          contactPerson: "振興組合 担当 中村",
        },
      ],
    },
    {
      email: "org-koryu@d-cross.jp",
      repName: "前橋けやきサロン 代表",
      orgName: "前橋けやきサロン",
      category: "高齢者との交流",
      description: "前橋市の公民館で毎月開催している高齢者向け交流サロンです。学生ボランティアがお茶会や催し物を一緒に運営します。",
      insuranceInfo: "社会福祉協議会のボランティア保険適用",
      verifiedStatus: "PENDING",
      activities: [
        {
          title: "ふれあいサロン お手伝いスタッフ",
          description: "お茶出し、レクリエーションの進行補助、傾聴などをお願いします。複数人での参加を推奨しています。",
          genre: "高齢者との交流",
          city: "前橋市",
          lat: 36.3960,
          lng: 139.0555,
          dateTime: "2026-10-17T10:00:00+09:00",
          participationTypes: "VISIT,ONE_TIME,ONGOING",
          beginnerFriendly: true,
          riskLevel: "LOW",
          insuranceCovered: true,
          capacity: 12,
          transportNote: "前橋市中央公民館(公共施設)、昼間・複数人での活動。",
          durationMinutes: 150,
          parkingAvailable: true,
          transportCost: "無料",
          contactPerson: "代表 石田",
          itemsToBring: "エプロン(貸出可)",
          photoPolicy: "参加者の顔が写る写真は、本人の同意を得てから使用します。",
          prohibitedNotes: "参加者と二人きりで個室に入ること、外部での個別の会食への誘いは禁止です。",
        },
        {
          title: "【おたすけ募集】今週末のお茶会、配膳スタッフ急募",
          description: "予定していたスタッフが体調不良でお休みに。今週末のお茶会の配膳・片付けを手伝ってくれる方を探しています。",
          genre: "高齢者との交流",
          city: "前橋市",
          lat: 36.3968,
          lng: 139.0540,
          dateTime: "2026-09-14T10:00:00+09:00",
          participationTypes: "ONE_TIME",
          beginnerFriendly: true,
          riskLevel: "LOW",
          insuranceCovered: true,
          capacity: 3,
          transportNote: "前橋市中央公民館、直接現地集合でOKです。",
          durationMinutes: 90,
          contactPerson: "代表 石田(当日携帯 090-xxxx-xxxx)",
          isHelpRequest: true,
        },
      ],
    },
    {
      email: "org-kokusai@d-cross.jp",
      repName: "群馬国際交流ネットワーク 代表",
      orgName: "群馬国際交流ネットワーク",
      category: "留学生との国際交流",
      description: "群馬県内の留学生と地域住民・学生をつなぐ交流イベントを企画しています。",
      insuranceInfo: "イベント保険加入済み",
      verifiedStatus: "APPROVED",
      activities: [
        {
          title: "留学生と学ぶ 多文化交流カフェ",
          description: "留学生と一緒に母国の文化紹介や語学交流を行うカフェ形式のイベントです。",
          genre: "留学生との国際交流",
          city: "高崎市",
          lat: 36.3235,
          lng: 139.0107,
          dateTime: "2026-10-03T15:00:00+09:00",
          participationTypes: "VISIT,ONE_TIME",
          beginnerFriendly: true,
          riskLevel: "LOW",
          insuranceCovered: true,
          capacity: 20,
          transportNote: "高崎市民プラザ(公共施設)、昼間開催。",
          durationMinutes: 120,
          parkingAvailable: true,
          transportCost: "無料(飲み物代のみ実費)",
          contactPerson: "代表 佐々木",
          photoPolicy: "イベント記録用に撮影し、参加団体のSNSで使用する場合があります。",
          prohibitedNotes: "個人的な連絡先交換の強要、宗教・政治・勧誘目的での参加は禁止です。",
        },
      ],
    },
    {
      email: "org-circle-sports@d-cross.jp",
      repName: "群馬大学 地域スポーツ普及サークル 代表",
      orgName: "群馬大学 地域スポーツ普及サークル",
      category: "学生サークル",
      description: "群馬大学の学生サークルです。前橋市内の公園や体育館で、子ども向けスポーツ教室を開いています。学生同士でも運営しており、初めての参加でも先輩メンバーがサポートします。",
      insuranceInfo: "サークル活動保険加入済み",
      verifiedStatus: "APPROVED",
      activities: [
        {
          title: "子ども向けミニサッカー教室 ボランティア募集",
          description: "小学生向けのミニサッカー教室を毎月開催しています。ボールの準備や見守り、簡単な指導補助をお願いします。運動が得意でなくてもOKです。",
          genre: "スポーツ・文化活動",
          city: "前橋市",
          lat: 36.3833,
          lng: 139.0680,
          dateTime: "2026-09-27T09:30:00+09:00",
          participationTypes: "VISIT,ONE_TIME,ONGOING",
          beginnerFriendly: true,
          riskLevel: "MEDIUM",
          insuranceCovered: true,
          capacity: 10,
          transportNote: "前橋市総合運動公園、屋外開催のため雨天中止の場合あり。",
          durationMinutes: 120,
          parkingAvailable: true,
          transportCost: "無料",
          contactPerson: "サークル代表 渡辺(学生)",
          itemsToBring: "運動できる服装、タオル、飲み物",
          photoPolicy: "子どもが写る写真は保護者の同意がある場合のみ、団体SNSに掲載します。",
          prohibitedNotes: "子どもとの個別連絡先交換、教室後の個別の誘い出しは禁止です。",
        },
        {
          title: "【おたすけ募集】今週末の交流大会、審判・受付スタッフ求む",
          description: "近隣サークルとの交流サッカー大会を開催しますが、審判と受付が足りていません!ルールが分からなくても事前に説明します。",
          genre: "スポーツ・文化活動",
          city: "前橋市",
          lat: 36.3840,
          lng: 139.0665,
          dateTime: "2026-09-13T09:00:00+09:00",
          participationTypes: "ONE_TIME",
          beginnerFriendly: true,
          riskLevel: "LOW",
          insuranceCovered: true,
          capacity: 4,
          transportNote: "前橋市総合運動公園、直接現地集合でOKです。",
          durationMinutes: 180,
          contactPerson: "サークル代表 渡辺(学生、当日携帯 080-xxxx-xxxx)",
          isHelpRequest: true,
        },
      ],
    },
  ];

  for (const orgSeed of orgs) {
    const repUser = await prisma.user.upsert({
      where: { email: orgSeed.email },
      update: {},
      create: {
        email: orgSeed.email,
        passwordHash: await hash("password123"),
        name: orgSeed.repName,
        role: "ORG_ADMIN",
        organization: {
          create: {
            name: orgSeed.orgName,
            category: orgSeed.category,
            description: orgSeed.description,
            insuranceInfo: orgSeed.insuranceInfo,
            verifiedStatus: orgSeed.verifiedStatus,
          },
        },
      },
      include: { organization: true },
    });

    const org = await prisma.organization.findUnique({ where: { representativeUserId: repUser.id } });
    if (!org) continue;

    for (const a of orgSeed.activities) {
      const existing = await prisma.activity.findFirst({ where: { orgId: org.id, title: a.title } });
      if (existing) continue;
      await prisma.activity.create({
        data: {
          orgId: org.id,
          title: a.title,
          description: a.description,
          genre: a.genre,
          city: a.city,
          lat: a.lat,
          lng: a.lng,
          dateTime: new Date(a.dateTime),
          participationTypes: a.participationTypes,
          beginnerFriendly: a.beginnerFriendly,
          riskLevel: a.riskLevel,
          insuranceCovered: a.insuranceCovered,
          capacity: a.capacity,
          transportNote: a.transportNote,
          durationMinutes: a.durationMinutes,
          parkingAvailable: a.parkingAvailable ?? false,
          transportCost: a.transportCost,
          contactPerson: a.contactPerson,
          itemsToBring: a.itemsToBring,
          photoPolicy: a.photoPolicy,
          prohibitedNotes: a.prohibitedNotes,
          isHelpRequest: a.isHelpRequest ?? false,
        },
      });
    }
  }

  // --- Student communities (interest/university/city based, separate from activities) ---
  const student1 = await prisma.user.findUnique({ where: { email: "student1@d-cross.jp" } });
  const student2 = await prisma.user.findUnique({ where: { email: "student2@d-cross.jp" } });

  if (student1 && student2) {
    const communitySeeds = [
      {
        name: "群馬大学 国際交流サークル",
        description: "留学生と一緒に言語交換や国際イベントを企画しています。学部・学年問わず参加歓迎です。",
        interestTag: "国際交流",
        university: "群馬大学",
        city: "前橋市",
        ownerId: student1.id,
        memberId: student2.id,
        post: "今度、留学生と一緒にごはん会をやります!気になる人はぜひ参加してください。",
      },
      {
        name: "地域イベント好き集まれ",
        description: "群馬県内のお祭りやマルシェが好きな学生のゆるいコミュニティです。情報交換しましょう。",
        interestTag: "地域イベント",
        university: undefined,
        city: "高崎市",
        ownerId: student2.id,
        memberId: student1.id,
        post: "来月の高崎マルシェ、一緒に行く人いますか?",
      },
    ];

    for (const c of communitySeeds) {
      const existing = await prisma.community.findFirst({ where: { name: c.name } });
      if (existing) continue;
      const community = await prisma.community.create({
        data: {
          name: c.name,
          description: c.description,
          interestTag: c.interestTag,
          university: c.university,
          city: c.city,
          createdByUserId: c.ownerId,
          memberships: {
            create: [
              { userId: c.ownerId, role: "OWNER" },
              { userId: c.memberId, role: "MEMBER" },
            ],
          },
        },
      });
      await prisma.communityPost.create({
        data: { communityId: community.id, authorId: c.ownerId, body: c.post },
      });
    }
  }

  console.log("シードデータの投入が完了しました。");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
