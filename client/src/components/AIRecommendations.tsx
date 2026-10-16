import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Recommendation } from "../types";

export function AIRecommendations() {
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Recommendation[]>("/activities/recommended/for-me")
      .then(setRecs)
      .catch(() => setRecs([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading || recs.length === 0) return null;

  return (
    <div className="px-4 pt-3">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-sm font-bold">🤖 AIおすすめ</span>
        <span className="text-[10px] text-gray-400">あなたの興味・希望条件から選定</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
        {recs.map((r) => (
          <Link
            key={r.activity.id}
            to={`/activities/${r.activity.id}`}
            className="shrink-0 w-64 bg-white rounded-2xl border border-gray-200 p-3 shadow-sm"
          >
            <div className="flex items-center gap-1 flex-wrap mb-1">
              {r.activity.isHelpRequest && <span className="badge bg-amber-100 text-amber-800 text-[10px]">🆘</span>}
              <span className="badge text-[10px]" style={{ background: "var(--brand-soft)", color: "var(--brand-dark)" }}>
                {r.activity.genre}
              </span>
            </div>
            <p className="font-bold text-sm leading-snug mb-1 line-clamp-2">{r.activity.title}</p>
            <p className="text-[11px] text-gray-500 mb-2">{r.activity.city} ・ {r.activity.organization.name}</p>
            {r.reasons.length > 0 && (
              <p className="text-[11px] rounded-lg bg-gray-50 px-2 py-1.5 text-gray-600">
                💡 {r.reasons[0]}
              </p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
