import { Link } from "react-router-dom";
import type { Activity } from "../types";
import { PARTICIPATION_LABELS } from "../types";
import { TrustBadge } from "./TrustBadge";

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function ActivityCard({ activity }: { activity: Activity }) {
  const types = activity.participationTypes.split(",");
  return (
    <Link
      to={`/activities/${activity.id}`}
      className="block bg-white rounded-2xl border p-3.5 shadow-sm active:scale-[0.99] transition"
      style={activity.isHelpRequest ? { borderColor: "#f59e0b", borderWidth: 2 } : { borderColor: "#e5e7eb" }}
    >
      <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
        {activity.isHelpRequest && (
          <span className="badge bg-amber-100 text-amber-800 font-bold">🆘 おたすけ募集</span>
        )}
        <span className="badge" style={{ background: "var(--brand-soft)", color: "var(--brand-dark)" }}>
          {activity.genre}
        </span>
        {activity.beginnerFriendly && (
          <span className="badge bg-amber-50 text-amber-700">初心者歓迎</span>
        )}
      </div>
      <h3 className="font-bold text-[15px] leading-snug mb-1">{activity.title}</h3>
      <p className="text-xs text-gray-500 mb-2">
        📍 {activity.city} ・ 🕒 {formatDate(activity.dateTime)}
      </p>
      <p className="text-xs text-gray-600 line-clamp-2 mb-2">{activity.description}</p>
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {types.map((t) => (
            <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {PARTICIPATION_LABELS[t as keyof typeof PARTICIPATION_LABELS]}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {activity.organization.trust && <TrustBadge trust={activity.organization.trust} />}
          <span className="text-xs font-semibold" style={{ color: "var(--brand-dark)" }}>
            {activity.organization.name}
          </span>
        </div>
      </div>
    </Link>
  );
}
