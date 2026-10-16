import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { ActivityCard } from "../components/ActivityCard";
import type { Activity } from "../types";

const STEPS = [
  { icon: "👀", title: "見学する", body: "まずは活動の様子を見に行くだけでOK。雰囲気を確かめてから決められます。" },
  { icon: "🙌", title: "体験参加する", body: "1回だけの単発参加で、実際にやってみる。合わなければ続けなくても大丈夫。" },
  { icon: "🤝", title: "継続参加を相談", body: "気に入ったら団体に継続参加を相談。無理のないペースで関わり続けられます。" },
];

export function WelcomePage() {
  const [featured, setFeatured] = useState<Activity[]>([]);
  const [fresh, setFresh] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Activity[]>("/activities")
      .then((all) => {
        const byNewest = [...all].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setFresh(byNewest.slice(0, 3));

        const trusted = all.filter((a) => a.organization.trust?.rank === "両目だるま");
        const helpFirst = all.filter((a) => a.isHelpRequest);
        const pool = [...helpFirst, ...trusted, ...all];
        const seen = new Set<string>();
        const picked: Activity[] = [];
        for (const a of pool) {
          if (seen.has(a.id)) continue;
          seen.add(a.id);
          picked.push(a);
          if (picked.length >= 3) break;
        }
        setFeatured(picked);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="pb-10">
      <div className="px-5 pt-8 pb-6 text-center">
        <div className="text-4xl mb-2">🌱</div>
        <h1 className="text-xl font-bold mb-1">D-CROSS ぐんま</h1>
        <p className="text-sm text-gray-500 mb-2">
          群馬県内の学生と地域コミュニティを、安全につなぐ地域活動マッチングサービス
        </p>
        <span className="badge inline-block" style={{ background: "var(--accent-blue-soft)", color: "var(--accent-blue)" }}>
          実証版プロトタイプ・対象エリア: 前橋市 / 高崎市
        </span>
      </div>

      <div className="px-5 mb-6">
        <Link
          to="/search"
          className="block text-center py-3 rounded-xl border-2 text-sm font-semibold"
          style={{ borderColor: "var(--brand)", color: "var(--brand-dark)" }}
        >
          ログインせずに活動を見てみる
        </Link>
      </div>

      <div className="px-5 mb-6">
        <h2 className="text-sm font-bold mb-3">参加までの流れ</h2>
        <div className="flex flex-col gap-2">
          {STEPS.map((s, i) => (
            <div key={s.title} className="flex items-start gap-3 rounded-2xl bg-white border border-gray-200 p-3">
              <div className="text-2xl leading-none">{s.icon}</div>
              <div>
                <p className="text-xs font-bold mb-0.5">STEP{i + 1}. {s.title}</p>
                <p className="text-[11px] text-gray-500">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {!loading && featured.length > 0 && (
        <div className="px-5 mb-6">
          <h2 className="text-sm font-bold mb-3">注目の活動</h2>
          <div className="flex flex-col gap-3">
            {featured.map((a) => (
              <ActivityCard key={a.id} activity={a} />
            ))}
          </div>
        </div>
      )}

      {!loading && fresh.length > 0 && (
        <div className="px-5 mb-6">
          <h2 className="text-sm font-bold mb-3">新着募集</h2>
          <div className="flex flex-col gap-3">
            {fresh.map((a) => (
              <ActivityCard key={a.id} activity={a} />
            ))}
          </div>
        </div>
      )}

      <div className="px-5 mb-4">
        <div className="rounded-2xl bg-white border border-gray-200 p-4">
          <h2 className="text-sm font-bold mb-3">学生の方</h2>
          <div className="flex gap-2">
            <Link
              to="/login"
              className="flex-1 text-center py-2.5 rounded-xl text-white text-sm font-semibold"
              style={{ background: "var(--brand)" }}
            >
              ログイン
            </Link>
            <Link
              to="/register/student"
              className="flex-1 text-center py-2.5 rounded-xl border border-gray-300 text-sm font-semibold"
            >
              新規登録
            </Link>
          </div>
        </div>
      </div>

      <div className="px-5 mb-6">
        <div className="rounded-2xl bg-white border border-gray-200 p-4">
          <h2 className="text-sm font-bold mb-3">地域団体の方</h2>
          <div className="flex gap-2">
            <Link
              to="/login"
              className="flex-1 text-center py-2.5 rounded-xl text-white text-sm font-semibold"
              style={{ background: "var(--ink)" }}
            >
              ログイン
            </Link>
            <Link
              to="/register/organization"
              className="flex-1 text-center py-2.5 rounded-xl border border-gray-300 text-sm font-semibold"
            >
              団体登録を申請
            </Link>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            団体登録は運営による事前確認後、活動を掲載できます。学生サークルも同じ流れで登録できます。
          </p>
        </div>
      </div>

      <div className="text-center">
        <Link to="/report" className="text-xs text-gray-400 underline">
          匿名で通報・相談する
        </Link>
      </div>
    </div>
  );
}
