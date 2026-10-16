import { useEffect, useState } from "react";
import { api } from "../api/client";
import { TrustBadge } from "../components/TrustBadge";
import type { Community, Organization, Report } from "../types";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  suspended: boolean;
  createdAt: string;
}

type AdminCommunity = Community & { createdBy: { name: string; email: string }; _count: { memberships: number; posts: number } };

type Tab = "orgs" | "reports" | "users" | "communities";

const REPORT_STATUS_LABELS: Record<Report["status"], string> = {
  OPEN: "未対応",
  IN_PROGRESS: "対応中",
  RESOLVED: "対応済み",
};

type AdminOrg = Organization & { representative: { name: string; email: string } };

function BadgeAdder({ org, onAdded }: { org: AdminOrg; onAdded: () => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!value.trim()) return;
    setBusy(true);
    try {
      const current = org.trust?.specialBadges ?? [];
      await api.patch(`/admin/organizations/${org.id}/badges`, { specialBadges: [...current, value.trim()] });
      setValue("");
      onAdded();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-1.5 mt-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="表彰バッジを付与(例: 後継者育成に積極的)"
        className="flex-1 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs"
      />
      <button onClick={add} disabled={busy || !value.trim()} className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 disabled:opacity-40">
        付与
      </button>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 text-xs py-2 rounded-lg font-semibold"
      style={active ? { background: "var(--brand)", color: "#fff" } : { background: "#f3f4f6", color: "#6b7280" }}
    >
      {children}
    </button>
  );
}

export function AdminDashboardPage() {
  const [tab, setTab] = useState<Tab>("orgs");
  const [orgs, setOrgs] = useState<AdminOrg[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [communities, setCommunities] = useState<AdminCommunity[]>([]);
  const [loading, setLoading] = useState(true);

  function reload() {
    setLoading(true);
    Promise.all([
      api.get<AdminOrg[]>("/admin/organizations"),
      api.get<Report[]>("/admin/reports"),
      api.get<AdminUser[]>("/admin/users"),
      api.get<AdminCommunity[]>("/admin/communities"),
    ])
      .then(([o, r, u, c]) => {
        setOrgs(o);
        setReports(r);
        setUsers(u);
        setCommunities(c);
      })
      .finally(() => setLoading(false));
  }

  useEffect(reload, []);

  async function verifyOrg(id: string, verifiedStatus: "APPROVED" | "REJECTED") {
    await api.patch(`/admin/organizations/${id}/verify`, { verifiedStatus });
    reload();
  }

  async function updateReportStatus(id: string, status: Report["status"]) {
    await api.patch(`/admin/reports/${id}/status`, { status });
    reload();
  }

  async function toggleSuspend(id: string, suspended: boolean) {
    await api.patch(`/admin/users/${id}/suspend`, { suspended });
    reload();
  }

  async function toggleCommunitySuspend(id: string, suspended: boolean) {
    await api.patch(`/admin/communities/${id}/suspend`, { suspended });
    reload();
  }

  if (loading) return <p className="text-xs text-gray-400 text-center py-10">読み込み中...</p>;

  return (
    <div className="px-4 py-4">
      <h1 className="text-lg font-bold mb-4">運営管理ダッシュボード</h1>

      <div className="flex gap-1.5 mb-4">
        <TabButton active={tab === "orgs"} onClick={() => setTab("orgs")}>団体承認</TabButton>
        <TabButton active={tab === "reports"} onClick={() => setTab("reports")}>通報対応</TabButton>
        <TabButton active={tab === "users"} onClick={() => setTab("users")}>ユーザー管理</TabButton>
        <TabButton active={tab === "communities"} onClick={() => setTab("communities")}>コミュニティ</TabButton>
      </div>

      {tab === "orgs" && (
        <div className="flex flex-col gap-3">
          {orgs.map((o) => (
            <div key={o.id} className="rounded-2xl bg-white border border-gray-200 p-3.5">
              <div className="flex items-center justify-between mb-1">
                <p className="font-bold text-sm">{o.name}</p>
                <div className="flex items-center gap-1.5">
                  {o.trust && o.verifiedStatus === "APPROVED" && <TrustBadge trust={o.trust} />}
                  <span
                    className="badge"
                    style={
                      o.verifiedStatus === "APPROVED"
                        ? { background: "#e6f5ee", color: "#1f7a53" }
                        : o.verifiedStatus === "REJECTED"
                          ? { background: "#fee2e2", color: "#b91c1c" }
                          : { background: "#fffbeb", color: "#b45309" }
                    }
                  >
                    {o.verifiedStatus === "APPROVED" ? "承認済み" : o.verifiedStatus === "REJECTED" ? "却下" : "確認待ち"}
                  </span>
                </div>
              </div>
              <p className="text-xs text-gray-500 mb-1">{o.category} ・ 代表: {o.representative.name}({o.representative.email})</p>
              <p className="text-xs text-gray-600 mb-2">{o.description}</p>
              <p className="text-xs text-gray-500 mb-2">保険: {o.insuranceInfo}</p>
              {o.trust && o.trust.specialBadges.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {o.trust.specialBadges.map((b) => (
                    <span key={b} className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">🏅 {b}</span>
                  ))}
                </div>
              )}
              {o.trust && o.trust.openReportCount > 0 && (
                <p className="text-xs text-red-600 mb-2">⚠️ 未対応の安全上の懸念が{o.trust.openReportCount}件あります</p>
              )}
              {o.verifiedStatus !== "APPROVED" && (
                <div className="flex gap-2">
                  <button onClick={() => verifyOrg(o.id, "APPROVED")} className="text-xs px-3 py-1.5 rounded-lg text-white" style={{ background: "var(--brand)" }}>
                    承認する
                  </button>
                  <button onClick={() => verifyOrg(o.id, "REJECTED")} className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600">
                    却下する
                  </button>
                </div>
              )}
              {o.verifiedStatus === "APPROVED" && <BadgeAdder org={o} onAdded={reload} />}
            </div>
          ))}
        </div>
      )}

      {tab === "reports" && (
        <div className="flex flex-col gap-3">
          {reports.length === 0 && <p className="text-xs text-gray-400 text-center py-8">通報はありません。</p>}
          {reports.map((r) => (
            <div key={r.id} className="rounded-2xl bg-white border border-gray-200 p-3.5">
              <div className="flex items-center justify-between mb-1">
                <p className="font-bold text-sm">{r.targetLabel}</p>
                <span className="badge bg-gray-100 text-gray-600">{REPORT_STATUS_LABELS[r.status]}</span>
              </div>
              <p className="text-xs text-gray-500 mb-1">対象: {r.targetType} ・ {r.reporter ? `${r.reporter.name}(${r.reporter.email})` : "匿名"}</p>
              <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2 mb-2">{r.reason}</p>
              <div className="flex gap-2">
                {r.status !== "IN_PROGRESS" && (
                  <button onClick={() => updateReportStatus(r.id, "IN_PROGRESS")} className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600">
                    対応中にする
                  </button>
                )}
                {r.status !== "RESOLVED" && (
                  <button onClick={() => updateReportStatus(r.id, "RESOLVED")} className="text-xs px-3 py-1.5 rounded-lg text-white" style={{ background: "var(--brand)" }}>
                    対応済みにする
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "users" && (
        <div className="flex flex-col gap-3">
          {users.map((u) => (
            <div key={u.id} className="rounded-2xl bg-white border border-gray-200 p-3.5">
              <div className="flex items-center justify-between mb-1">
                <p className="font-bold text-sm">{u.name}</p>
                <span className="badge bg-gray-100 text-gray-600">{u.role}</span>
              </div>
              <p className="text-xs text-gray-500 mb-2">{u.email}</p>
              <button
                onClick={() => toggleSuspend(u.id, !u.suspended)}
                className="text-xs px-3 py-1.5 rounded-lg border"
                style={u.suspended ? { background: "#fee2e2", borderColor: "#fca5a5", color: "#b91c1c" } : { borderColor: "#d1d5db", color: "#6b7280" }}
              >
                {u.suspended ? "利用停止を解除する" : "利用を停止する"}
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === "communities" && (
        <div className="flex flex-col gap-3">
          {communities.length === 0 && <p className="text-xs text-gray-400 text-center py-8">コミュニティはありません。</p>}
          {communities.map((c) => (
            <div key={c.id} className="rounded-2xl bg-white border border-gray-200 p-3.5">
              <div className="flex items-center justify-between mb-1">
                <p className="font-bold text-sm">{c.name}</p>
                <span className="badge" style={c.suspended ? { background: "#fee2e2", color: "#b91c1c" } : { background: "#e6f5ee", color: "#1f7a53" }}>
                  {c.suspended ? "停止中" : "公開中"}
                </span>
              </div>
              <p className="text-xs text-gray-500 mb-1">
                {c.interestTag}{c.university ? ` ・ ${c.university}` : ""}{c.city ? ` ・ ${c.city}` : ""} ・ 作成者: {c.createdBy.name}({c.createdBy.email})
              </p>
              <p className="text-xs text-gray-600 mb-2">{c.description}</p>
              <p className="text-xs text-gray-500 mb-2">👥 {c._count.memberships}人参加 ・ 💬 {c._count.posts}件投稿</p>
              <button
                onClick={() => toggleCommunitySuspend(c.id, !c.suspended)}
                className="text-xs px-3 py-1.5 rounded-lg border"
                style={c.suspended ? { borderColor: "#d1d5db", color: "#6b7280" } : { background: "#fee2e2", borderColor: "#fca5a5", color: "#b91c1c" }}
              >
                {c.suspended ? "公開を再開する" : "停止する"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
