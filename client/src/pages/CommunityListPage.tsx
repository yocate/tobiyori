import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { GUNMA_UNIVERSITIES, type Community } from "../types";

const UNIVERSITY_FILTERS = GUNMA_UNIVERSITIES.filter((u) => u !== "その他");

export function CommunityListPage() {
  const { user } = useAuth();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [q, setQ] = useState("");
  const [university, setUniversity] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (university) params.set("university", university);
    setLoading(true);
    api
      .get<Community[]>(`/communities?${params.toString()}`)
      .then(setCommunities)
      .finally(() => setLoading(false));
  }, [q, university]);

  return (
    <div className="px-4 py-4">
      <div className="flex items-start justify-between mb-1 gap-2">
        <div>
          <h1 className="text-lg font-bold mb-1">学生コミュニティ</h1>
          <p className="text-xs text-gray-500">興味・大学・地域でゆるくつながれる、学生同士の場です。</p>
        </div>
        {user?.role === "STUDENT" && (
          <Link to="/communities/new" className="text-xs px-3 py-1.5 rounded-full text-white shrink-0" style={{ background: "var(--brand)" }}>
            + 作る
          </Link>
        )}
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="興味・地域名などで検索"
        className="w-full border border-gray-300 rounded-full px-4 py-2 text-sm mt-3 mb-2"
      />

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 mb-2">
        <select
          value={university}
          onChange={(e) => setUniversity(e.target.value)}
          className="text-xs border border-gray-300 rounded-full px-2.5 py-1.5 bg-white shrink-0"
        >
          <option value="">大学: すべて</option>
          {UNIVERSITY_FILTERS.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
      </div>

      {loading && <p className="text-xs text-gray-400 text-center py-8">読み込み中...</p>}
      {!loading && communities.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-8">条件に合うコミュニティが見つかりませんでした。</p>
      )}

      <div className="flex flex-col gap-3">
        {communities.map((c) => (
          <Link key={c.id} to={`/communities/${c.id}`} className="block bg-white rounded-2xl border border-gray-200 p-3.5 shadow-sm">
            <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
              <span className="badge" style={{ background: "var(--brand-soft)", color: "var(--brand-dark)" }}>{c.interestTag}</span>
              {c.university && <span className="badge bg-blue-50 text-blue-700">{c.university}</span>}
              {c.city && <span className="badge bg-gray-100 text-gray-600">{c.city}</span>}
            </div>
            <h3 className="font-bold text-[15px] leading-snug mb-1">{c.name}</h3>
            <p className="text-xs text-gray-600 line-clamp-2 mb-2">{c.description}</p>
            <p className="text-xs text-gray-400">👥 {c._count?.memberships ?? 0}人が参加</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
