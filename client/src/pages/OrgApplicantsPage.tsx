import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import { APPLICATION_STATUS_LABELS, PARTICIPATION_LABELS, type Application } from "../types";

export function OrgApplicantsPage() {
  const { activityId } = useParams<{ activityId: string }>();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityTitle, setActivityTitle] = useState("");

  useEffect(() => {
    if (!activityId) return;
    Promise.all([
      api.get<Application[]>(`/applications/for-activity/${activityId}`),
      api.get<{ title: string }>(`/activities/${activityId}`),
    ])
      .then(([apps, act]) => {
        setApplications(apps);
        setActivityTitle(act.title);
      })
      .finally(() => setLoading(false));
  }, [activityId]);

  async function setStatus(appId: string, status: "APPROVED" | "DECLINED") {
    const updated = await api.patch<Application>(`/applications/${appId}/status`, { status });
    setApplications((prev) => prev.map((a) => (a.id === appId ? { ...a, status: updated.status } : a)));
  }

  async function setRecord(
    appId: string,
    patch: { attended?: boolean; certificateIssued?: boolean; orientationGiven?: boolean; followUpSent?: boolean },
  ) {
    const record = await api.put(`/applications/${appId}/record`, patch);
    setApplications((prev) => prev.map((a) => (a.id === appId ? { ...a, record: record as Application["record"] } : a)));
  }

  if (loading) return <p className="text-xs text-gray-400 text-center py-10">読み込み中...</p>;

  return (
    <div className="px-4 py-4">
      <h1 className="text-lg font-bold mb-1">申込者一覧</h1>
      <p className="text-xs text-gray-500 mb-4">{activityTitle}</p>

      {applications.length === 0 && <p className="text-xs text-gray-400 text-center py-8">まだ申込がありません。</p>}

      <div className="flex flex-col gap-3">
        {applications.map((a) => (
          <div key={a.id} className="rounded-2xl bg-white border border-gray-200 p-3.5">
            <div className="flex items-center justify-between mb-1">
              <p className="font-bold text-sm">{a.student?.name}</p>
              <span className="badge bg-gray-100 text-gray-600">{APPLICATION_STATUS_LABELS[a.status]}</span>
            </div>
            <p className="text-xs text-gray-500 mb-1">{a.student?.email}</p>
            <p className="text-xs text-gray-500 mb-2">参加形式: {PARTICIPATION_LABELS[a.participationType]}</p>
            {a.message && <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2 mb-2">「{a.message}」</p>}

            {a.status === "APPLIED" && (
              <div className="flex gap-2 mb-2">
                <button onClick={() => setStatus(a.id, "APPROVED")} className="text-xs px-3 py-1.5 rounded-lg text-white" style={{ background: "var(--brand)" }}>
                  承認する
                </button>
                <button onClick={() => setStatus(a.id, "DECLINED")} className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600">
                  見送る
                </button>
              </div>
            )}

            {a.status === "APPROVED" && (
              <div className="pt-2 border-t border-gray-100">
                <div className="flex gap-2 flex-wrap mb-2">
                  <button
                    onClick={() => setRecord(a.id, { orientationGiven: !a.record?.orientationGiven })}
                    className="text-xs px-3 py-1.5 rounded-lg border"
                    style={a.record?.orientationGiven ? { background: "#eef4ff", borderColor: "#6d8fe0", color: "#3450a3" } : { borderColor: "#d1d5db" }}
                  >
                    {a.record?.orientationGiven ? "✅ 事前説明ずみ" : "初参加者への事前説明を記録"}
                  </button>
                  <button
                    onClick={() => setRecord(a.id, { attended: !a.record?.attended })}
                    className="text-xs px-3 py-1.5 rounded-lg border"
                    style={a.record?.attended ? { background: "#e6f5ee", borderColor: "var(--brand)", color: "var(--brand-dark)" } : { borderColor: "#d1d5db" }}
                  >
                    {a.record?.attended ? "✅ 出席済み" : "出席を記録"}
                  </button>
                </div>
                {a.record?.attended && (
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => setRecord(a.id, { certificateIssued: !a.record?.certificateIssued })}
                      className="text-xs px-3 py-1.5 rounded-lg border"
                      style={a.record?.certificateIssued ? { background: "#fffbeb", borderColor: "#f59e0b", color: "#b45309" } : { borderColor: "#d1d5db" }}
                    >
                      {a.record?.certificateIssued ? "🏅 証明発行済み" : "活動証明を発行"}
                    </button>
                    <button
                      onClick={() => setRecord(a.id, { followUpSent: !a.record?.followUpSent })}
                      className="text-xs px-3 py-1.5 rounded-lg border"
                      style={a.record?.followUpSent ? { background: "#fdf1e7", borderColor: "#c98a4b", color: "#9a5b23" } : { borderColor: "#d1d5db" }}
                    >
                      {a.record?.followUpSent ? "✅ お礼・フォロー済み" : "お礼・フォローを記録"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
