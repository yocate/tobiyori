import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { TrustBadge } from "../components/TrustBadge";
import type { Activity, Organization } from "../types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const STATUS_INFO: Record<Organization["verifiedStatus"], { label: string; bg: string; fg: string }> = {
  PENDING: { label: "運営の事前確認 待ち", bg: "#fffbeb", fg: "#b45309" },
  APPROVED: { label: "承認済み", bg: "#e6f5ee", fg: "#1f7a53" },
  REJECTED: { label: "却下されました", bg: "#fee2e2", fg: "#b91c1c" },
};

function TrustBreakdown({ org }: { org: Organization }) {
  const trust = org.trust;
  if (!trust) return null;
  return (
    <div className="rounded-2xl bg-white border border-gray-200 p-3.5 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold">信頼ランク</h2>
        <TrustBadge trust={trust} size="lg" />
      </div>
      <p className="text-[11px] text-gray-400 mb-3">
        参加人数の多さではなく、下記の行動から算出しています(スコア {trust.score}点)。
      </p>
      <div className="flex flex-col gap-1.5 text-xs text-gray-600">
        <div className="flex justify-between"><span>平均評価</span><span className="font-medium">{trust.avgRating != null ? `★${trust.avgRating.toFixed(1)}` : "まだありません"}</span></div>
        <div className="flex justify-between"><span>初参加者への事前説明率</span><span className="font-medium">{trust.orientationRate != null ? `${Math.round(trust.orientationRate * 100)}%` : "-"}</span></div>
        <div className="flex justify-between"><span>活動後のフォロー率</span><span className="font-medium">{trust.followUpRate != null ? `${Math.round(trust.followUpRate * 100)}%` : "-"}</span></div>
        <div className="flex justify-between"><span>保険情報の更新</span><span className="font-medium">{trust.insuranceRecentlyUpdated ? "直近1年以内" : "更新をおすすめします"}</span></div>
        <div className="flex justify-between"><span>未対応の安全上の懸念</span><span className="font-medium">{trust.openReportCount}件</span></div>
        {trust.specialBadges.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {trust.specialBadges.map((b) => (
              <span key={b} className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">🏅 {b}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InsuranceUpdateBox({ org, onUpdated }: { org: Organization; onUpdated: (o: Organization) => void }) {
  const [value, setValue] = useState(org.insuranceInfo);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const updated = await api.put<Organization>("/organizations/mine", { insuranceInfo: value });
      onUpdated(updated);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white border border-gray-200 p-3.5 mb-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold mb-0.5">保険・安全情報</h2>
          <p className="text-xs text-gray-500">{org.insuranceInfo}</p>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 shrink-0">
          更新する
        </button>
      </div>
      {open && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <textarea value={value} onChange={(e) => setValue(e.target.value)} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2" />
          <button onClick={save} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg text-white disabled:opacity-50" style={{ background: "var(--brand)" }}>
            {busy ? "保存中..." : "保存する"}
          </button>
        </div>
      )}
    </div>
  );
}

export function OrgDashboardPage() {
  const [org, setOrg] = useState<Organization | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get<Organization>("/organizations/mine"), api.get<Activity[]>("/activities/mine/list")])
      .then(([o, acts]) => {
        setOrg(o);
        setActivities(acts);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-xs text-gray-400 text-center py-10">読み込み中...</p>;
  if (!org) return <p className="text-xs text-gray-400 text-center py-10">団体情報が見つかりませんでした。</p>;

  const status = STATUS_INFO[org.verifiedStatus];

  return (
    <div className="px-4 py-4">
      <h1 className="text-lg font-bold mb-1">{org.name}</h1>
      <span className="badge mb-4 inline-block" style={{ background: status.bg, color: status.fg }}>
        {status.label}
      </span>

      {org.verifiedStatus === "PENDING" && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 mb-4">
          団体・代表者情報を運営が確認しています。承認されるまで活動の掲載はできません。
        </div>
      )}

      {org.health?.signOfStrain && (
        <div className="rounded-xl bg-orange-50 border border-orange-200 p-3 text-xs text-orange-800 mb-4">
          <p className="font-bold mb-1">⚠️ 運営が大変そうな兆候があります</p>
          {org.health.daysSinceLastActivityPosted != null && org.health.daysSinceLastActivityPosted > 90 && (
            <p>最後の活動掲載から{org.health.daysSinceLastActivityPosted}日経っています。</p>
          )}
          {org.health.staleApplicationCount >= 3 && (
            <p>1週間以上未対応の申込が{org.health.staleApplicationCount}件たまっています。無理のない範囲で対応してください。</p>
          )}
        </div>
      )}

      {org.verifiedStatus === "APPROVED" && (
        <>
          <TrustBreakdown org={org} />
          <InsuranceUpdateBox org={org} onUpdated={setOrg} />
        </>
      )}

      <div className="flex items-center justify-between mb-2 gap-2">
        <h2 className="text-sm font-bold">掲載中の活動</h2>
        {org.verifiedStatus === "APPROVED" && (
          <div className="flex gap-1.5 shrink-0">
            <Link to="/org/activities/new?help=1" className="text-xs px-3 py-1.5 rounded-full border-2 border-amber-400 text-amber-700 font-bold">
              🆘 おたすけ募集
            </Link>
            <Link to="/org/activities/new" className="text-xs px-3 py-1.5 rounded-full text-white" style={{ background: "var(--brand)" }}>
              + 新しい活動
            </Link>
          </div>
        )}
      </div>

      {activities.length === 0 && <p className="text-xs text-gray-400 py-6 text-center">まだ活動がありません。</p>}

      <div className="flex flex-col gap-3">
        {activities.map((a) => (
          <div key={a.id} className="rounded-2xl bg-white border p-3.5" style={a.isHelpRequest ? { borderColor: "#f59e0b", borderWidth: 2 } : { borderColor: "#e5e7eb" }}>
            {a.isHelpRequest && <span className="badge bg-amber-100 text-amber-800 font-bold mb-1.5 inline-block">🆘 おたすけ募集</span>}
            <p className="font-bold text-sm mb-1">{a.title}</p>
            <p className="text-xs text-gray-500 mb-2">{a.city} ・ {formatDate(a.dateTime)}</p>
            <div className="flex gap-2">
              <Link to={`/org/activities/${a.id}/applicants`} className="text-xs px-3 py-1.5 rounded-lg text-white" style={{ background: "var(--brand)" }}>
                申込者を確認
              </Link>
              <Link to={`/org/activities/${a.id}/edit`} className="text-xs px-3 py-1.5 rounded-lg border border-gray-300">
                編集
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
