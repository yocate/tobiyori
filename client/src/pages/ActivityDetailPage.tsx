import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { TrustBadge } from "../components/TrustBadge";
import {
  PARTICIPATION_LABELS,
  RISK_LABELS,
  type Activity,
  type ParticipationType,
} from "../types";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ActivityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);
  const [participationType, setParticipationType] = useState<ParticipationType | "">("");
  const [message, setMessage] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .get<Activity>(`/activities/${id}`)
      .then(setActivity)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-xs text-gray-400 text-center py-10">読み込み中...</p>;
  if (!activity) return <p className="text-xs text-gray-400 text-center py-10">活動が見つかりませんでした。</p>;

  const types = activity.participationTypes.split(",") as ParticipationType[];
  const riskColor =
    activity.riskLevel === "HIGH" ? "#d64545" : activity.riskLevel === "MEDIUM" ? "#c88a1a" : "#2f9e6e";

  async function handleApply() {
    if (!participationType) {
      setApplyError("参加形式を選択してください");
      return;
    }
    setApplying(true);
    setApplyError(null);
    try {
      await api.post("/applications", { activityId: activity!.id, participationType, message });
      setApplied(true);
    } catch (err) {
      setApplyError(err instanceof ApiError ? err.message : "申込に失敗しました");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="pb-8">
      <div className="px-4 pt-4">
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          {activity.isHelpRequest && (
            <span className="badge bg-amber-100 text-amber-800 font-bold">🆘 おたすけ募集</span>
          )}
          <span className="badge" style={{ background: "var(--brand-soft)", color: "var(--brand-dark)" }}>
            {activity.genre}
          </span>
          {activity.beginnerFriendly && <span className="badge bg-amber-50 text-amber-700">初心者歓迎</span>}
        </div>
        {activity.isHelpRequest && (
          <div className="rounded-xl bg-amber-50 border border-amber-300 p-3 text-xs text-amber-800 mb-3">
            団体が急に人手を必要としている「おたすけ募集」です。単発・短時間の参加でも大歓迎です。
          </div>
        )}
        <h1 className="text-lg font-bold leading-snug mb-1">{activity.title}</h1>
        <p className="text-xs text-gray-500 mb-4">{activity.organization.name} ・ {activity.city}</p>

        <div className="rounded-2xl bg-gray-50 border border-gray-200 p-3.5 mb-4 text-sm flex flex-col gap-2">
          <div className="flex justify-between"><span className="text-gray-500">日時</span><span className="font-medium">{formatDateTime(activity.dateTime)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">場所</span><span className="font-medium">{activity.city}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">定員</span><span className="font-medium">{activity.capacity}名</span></div>
          {activity.durationMinutes && (
            <div className="flex justify-between"><span className="text-gray-500">所要時間</span><span className="font-medium">約{activity.durationMinutes}分</span></div>
          )}
          <div className="flex justify-between"><span className="text-gray-500">駐車場</span><span className="font-medium">{activity.parkingAvailable ? "あり" : "なし・要確認"}</span></div>
          {activity.transportCost && (
            <div className="flex justify-between gap-4"><span className="text-gray-500 shrink-0">交通費</span><span className="font-medium text-right">{activity.transportCost}</span></div>
          )}
          {activity.transportNote && (
            <div className="flex justify-between gap-4"><span className="text-gray-500 shrink-0">アクセス</span><span className="font-medium text-right">{activity.transportNote}</span></div>
          )}
          {activity.contactPerson && (
            <div className="flex justify-between gap-4"><span className="text-gray-500 shrink-0">担当者</span><span className="font-medium text-right">{activity.contactPerson}</span></div>
          )}
          {activity.itemsToBring && (
            <div className="flex justify-between gap-4"><span className="text-gray-500 shrink-0">持ち物</span><span className="font-medium text-right">{activity.itemsToBring}</span></div>
          )}
        </div>

        {(activity.photoPolicy || activity.prohibitedNotes) && (
          <div className="rounded-2xl bg-gray-50 border border-gray-200 p-3.5 mb-4 text-sm flex flex-col gap-2">
            {activity.photoPolicy && (
              <div>
                <p className="text-gray-500 text-xs mb-0.5">撮影方針</p>
                <p className="font-medium">{activity.photoPolicy}</p>
              </div>
            )}
            {activity.prohibitedNotes && (
              <div>
                <p className="text-gray-500 text-xs mb-0.5">禁止事項</p>
                <p className="font-medium">{activity.prohibitedNotes}</p>
              </div>
            )}
          </div>
        )}

        <div className="rounded-2xl border p-3.5 mb-4 text-sm flex flex-col gap-2" style={{ borderColor: riskColor + "40", background: riskColor + "0d" }}>
          <p className="font-bold text-xs" style={{ color: riskColor }}>⚠️ 安全・保険情報</p>
          <div className="flex justify-between"><span className="text-gray-500">危険性</span><span className="font-medium">{RISK_LABELS[activity.riskLevel]}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">活動保険</span><span className="font-medium">{activity.insuranceCovered ? "加入あり" : "個別確認が必要"}</span></div>
          <div className="flex justify-between gap-4"><span className="text-gray-500 shrink-0">団体の保険状況</span><span className="font-medium text-right">{activity.organization.insuranceInfo}</span></div>
          {activity.emergencyContact && (
            <div className="flex justify-between gap-4"><span className="text-gray-500 shrink-0">緊急連絡先</span><span className="font-medium text-right">{activity.emergencyContact}</span></div>
          )}
          {activity.incidentProcedure && (
            <div className="pt-1 border-t border-gray-900/5">
              <p className="text-gray-500 mb-0.5">事故発生時の手順</p>
              <p className="font-medium whitespace-pre-wrap">{activity.incidentProcedure}</p>
            </div>
          )}
        </div>

        <div className="mb-4">
          <h2 className="text-sm font-bold mb-1">活動内容</h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{activity.description}</p>
        </div>

        <div className="mb-6">
          <h2 className="text-sm font-bold mb-1">主催団体</h2>
          <div className="rounded-2xl bg-white border border-gray-200 p-3.5 text-sm">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <p className="font-bold">{activity.organization.name}</p>
              {activity.organization.trust && <TrustBadge trust={activity.organization.trust} />}
            </div>
            <p className="text-xs text-gray-500 mb-2">{activity.organization.category} ・ 運営確認済み団体</p>
            <p className="text-xs text-gray-600 mb-2">{activity.organization.description}</p>
            {activity.organization.trust && activity.organization.trust.specialBadges.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {activity.organization.trust.specialBadges.map((b) => (
                  <span key={b} className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                    🏅 {b}
                  </span>
                ))}
              </div>
            )}
            <p className="text-[10px] text-gray-400 mt-2">
              信頼ランクは参加人数ではなく、初参加者への説明・活動後のフォロー・保険情報の更新・安全上の懸念の少なさから算出しています。
            </p>
          </div>
        </div>

        {user?.role === "STUDENT" && (
          <div className="rounded-2xl border-2 p-4 mb-4" style={{ borderColor: "var(--brand)" }}>
            {applied ? (
              <p className="text-sm font-semibold text-center" style={{ color: "var(--brand-dark)" }}>
                ✅ 申込が完了しました。マイページから状況を確認できます。
              </p>
            ) : (
              <>
                <h2 className="text-sm font-bold mb-2">この活動に申し込む</h2>
                <div className="flex gap-1.5 mb-2">
                  {types.map((t) => (
                    <button
                      key={t}
                      onClick={() => setParticipationType(t)}
                      className="flex-1 text-xs py-2 rounded-lg border"
                      style={
                        participationType === t
                          ? { background: "var(--brand)", color: "#fff", borderColor: "var(--brand)" }
                          : { borderColor: "#d1d5db", color: "#374151" }
                      }
                    >
                      {PARTICIPATION_LABELS[t]}
                    </button>
                  ))}
                </div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="団体へのメッセージ(任意)"
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2"
                />
                {applyError && <p className="text-xs text-red-600 mb-2">{applyError}</p>}
                <button
                  onClick={handleApply}
                  disabled={applying}
                  className="w-full py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                  style={{ background: "var(--brand)" }}
                >
                  {applying ? "送信中..." : "この内容で申し込む"}
                </button>
              </>
            )}
          </div>
        )}

        {!user && (
          <button
            onClick={() => navigate("/welcome")}
            className="w-full py-3 rounded-xl text-white text-sm font-semibold mb-3"
            style={{ background: "var(--brand)" }}
          >
            ログインして申し込む
          </button>
        )}

        <button
          onClick={() =>
            navigate(
              `/report?targetType=ACTIVITY&targetId=${activity.id}&targetLabel=${encodeURIComponent(activity.title)}`,
            )
          }
          className="w-full py-2 text-xs text-gray-400 underline"
        >
          この活動について通報・相談する
        </button>
      </div>
    </div>
  );
}
