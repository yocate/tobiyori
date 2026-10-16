import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { UniversitySelect } from "../components/UniversitySelect";
import {
  APPLICATION_STATUS_LABELS,
  GENRES,
  GUNMA_CITIES,
  PARTICIPATION_LABELS,
  TRANSPORT_METHODS,
  WEEKDAYS,
  type Application,
  type StudentProfileData,
  type StudentStats,
} from "../types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ja-JP", { year: "numeric", month: "short", day: "numeric" });
}

function statusColor(status: Application["status"]) {
  if (status === "APPROVED") return { bg: "#e6f5ee", fg: "var(--brand-dark)" };
  if (status === "DECLINED" || status === "CANCELLED") return { bg: "#f3f4f6", fg: "#6b7280" };
  return { bg: "#fffbeb", fg: "#b45309" };
}

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-0.5 mb-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="text-lg leading-none"
          style={{ color: n <= value ? "#f59e0b" : "#e5e7eb" }}
          aria-label={`${n}つ星`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function ReviewBox({ application, onSaved }: { application: Application; onSaved: (a: Application) => void }) {
  const [review, setReview] = useState(application.record?.review ?? "");
  const [rating, setRating] = useState(application.record?.rating ?? 0);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const record = await api.put(`/applications/${application.id}/review`, {
        review: review || undefined,
        rating: rating || undefined,
      });
      onSaved({ ...application, record: record as Application["record"] });
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 pt-2 border-t border-gray-100">
      <p className="text-xs font-semibold text-gray-600 mb-1">活動の評価・感想(公開されます)</p>
      <StarPicker value={rating} onChange={setRating} />
      <textarea
        value={review}
        onChange={(e) => setReview(e.target.value)}
        rows={2}
        className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-xs mb-1.5"
        placeholder="参加してみてどうでしたか?"
      />
      <button
        onClick={submit}
        disabled={busy || (!review && !rating)}
        className="text-xs px-3 py-1.5 rounded-lg text-white disabled:opacity-40"
        style={{ background: "var(--brand)" }}
      >
        {busy ? "保存中..." : saved ? "更新する" : "感想を投稿"}
      </button>
    </div>
  );
}

function ProfileSettings() {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [university, setUniversity] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [transportMethod, setTransportMethod] = useState("");
  const [preferredCity, setPreferredCity] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    api.get<{ studentProfile: StudentProfileData | null }>("/auth/me").then((me) => {
      const p = me.studentProfile;
      setUniversity(p?.university ?? "");
      setInterests(p?.interests ? p.interests.split(",").filter(Boolean) : []);
      setAvailableDays(p?.availableDays ? p.availableDays.split(",").filter(Boolean) : []);
      setTransportMethod(p?.transportMethod ?? "");
      setPreferredCity(p?.preferredCity ?? "");
      setLoaded(true);
    });
  }, [open, loaded]);

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function save() {
    setBusy(true);
    try {
      await api.put("/auth/student-profile", {
        university,
        interests: interests.join(","),
        availableDays: availableDays.join(","),
        transportMethod,
        preferredCity,
      });
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white border border-gray-200 p-3.5 mb-4">
      <button className="w-full flex items-center justify-between text-left" onClick={() => setOpen((v) => !v)}>
        <span className="text-sm font-bold">⚙️ プロフィール設定(AIおすすめの精度が上がります)</span>
        <span className="text-xs text-gray-400">{open ? "閉じる" : "開く"}</span>
      </button>
      {open && !loaded && <p className="text-xs text-gray-400 py-4 text-center">読み込み中...</p>}
      {open && loaded && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex flex-col gap-3">
          <div className="text-xs font-semibold text-gray-600">
            大学・学校名
            <div className="mt-1">
              <UniversitySelect value={university} onChange={setUniversity} />
            </div>
          </div>
          <div className="text-xs font-semibold text-gray-600">
            興味のある分野
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {GENRES.map((g) => (
                <button
                  type="button"
                  key={g}
                  onClick={() => toggle(interests, setInterests, g)}
                  className="text-[11px] px-2.5 py-1.5 rounded-full border"
                  style={interests.includes(g) ? { background: "var(--brand-soft)", borderColor: "var(--brand)", color: "var(--brand-dark)" } : { borderColor: "#d1d5db", color: "#6b7280" }}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div className="text-xs font-semibold text-gray-600">
            参加可能曜日
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d) => (
                <button
                  type="button"
                  key={d}
                  onClick={() => toggle(availableDays, setAvailableDays, d)}
                  className="text-[11px] w-8 h-8 rounded-full border"
                  style={availableDays.includes(d) ? { background: "var(--accent-blue-soft)", borderColor: "var(--accent-blue)", color: "var(--accent-blue)" } : { borderColor: "#d1d5db", color: "#6b7280" }}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <label className="text-xs font-semibold text-gray-600">
            主な移動手段
            <select value={transportMethod} onChange={(e) => setTransportMethod(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm">
              <option value="">選択してください</option>
              {TRANSPORT_METHODS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-gray-600">
            希望エリア
            <select value={preferredCity} onChange={(e) => setPreferredCity(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm">
              <option value="">選択してください</option>
              {GUNMA_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <button onClick={save} disabled={busy} className="py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50" style={{ background: "var(--brand)" }}>
            {busy ? "保存中..." : saved ? "更新する" : "保存する"}
          </button>
        </div>
      )}
    </div>
  );
}

function StatsHeader({ stats }: { stats: StudentStats | null }) {
  if (!stats) return null;
  return (
    <div className="rounded-2xl bg-white border border-gray-200 p-3.5 mb-4">
      <div className="flex items-center justify-between mb-1">
        <div>
          <p className="text-[11px] text-gray-500">上毛三山レベル</p>
          <p className="text-sm font-bold">{stats.levelIcon} {stats.levelBadge}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-gray-500">ポイント</p>
          <p className="text-lg font-bold" style={{ color: "var(--brand-dark)" }}>{stats.points}pt</p>
        </div>
      </div>
      {stats.nextLevel && (
        <p className="text-[11px] text-gray-400 mb-2">次の「{stats.nextLevel.label}」まであと{stats.nextLevel.pointsToGo}pt</p>
      )}
      {(stats.cityBadges.length > 0 || stats.genreBadges.length > 0) && (
        <div className="flex flex-wrap gap-1 pt-2 border-t border-gray-100">
          {stats.cityBadges.map((c) => (
            <span key={c} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">📍 {c}バッジ</span>
          ))}
          {stats.genreBadges.map((g) => (
            <span key={g} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "var(--brand-soft)", color: "var(--brand-dark)" }}>
              🏅 {g}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function MyPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [applications, setApplications] = useState<Application[]>([]);
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.get<Application[]>("/applications/mine"), api.get<StudentStats>("/applications/mine/stats")])
      .then(([apps, s]) => {
        setApplications(apps);
        setStats(s);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  async function cancel(id: string) {
    const updated = await api.post<Application>(`/applications/${id}/cancel`);
    setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, status: updated.status } : a)));
  }

  return (
    <div className="px-4 py-4">
      <h1 className="text-lg font-bold mb-1">マイページ</h1>
      <p className="text-xs text-gray-500 mb-4">{user?.name} さんの申込状況・参加記録</p>

      <StatsHeader stats={stats} />
      <ProfileSettings />

      {loading && <p className="text-xs text-gray-400 text-center py-8">読み込み中...</p>}
      {error && <p className="text-xs text-red-600 text-center py-8">{error}</p>}
      {!loading && applications.length === 0 && (
        <div className="text-center py-10">
          <p className="text-xs text-gray-400 mb-3">まだ申込はありません。</p>
          <Link to="/search" className="text-xs underline" style={{ color: "var(--brand-dark)" }}>
            活動を探してみる
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {applications.map((a) => {
          const colors = statusColor(a.status);
          return (
            <div key={a.id} className="rounded-2xl bg-white border border-gray-200 p-3.5">
              <div className="flex items-start justify-between gap-2 mb-1">
                <Link to={`/activities/${a.activityId}`} className="font-bold text-sm leading-snug">
                  {a.activity?.title}
                </Link>
                <span className="badge shrink-0" style={{ background: colors.bg, color: colors.fg }}>
                  {APPLICATION_STATUS_LABELS[a.status]}
                </span>
              </div>
              <p className="text-xs text-gray-500 mb-1">
                {a.activity?.organization.name} ・ {a.activity && formatDate(a.activity.dateTime)}
              </p>
              <p className="text-xs text-gray-500 mb-2">参加形式: {PARTICIPATION_LABELS[a.participationType]}</p>

              {a.record?.attended && (
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="badge bg-blue-50 text-blue-700">✅ 参加済み</span>
                  {a.record.certificateIssued && (
                    <span className="badge" style={{ background: "var(--brand-soft)", color: "var(--brand-dark)" }}>
                      🏅 活動証明 発行済み
                    </span>
                  )}
                </div>
              )}

              {a.status === "APPLIED" && (
                <button
                  onClick={() => cancel(a.id)}
                  className="text-xs text-gray-400 underline mt-1"
                >
                  申込をキャンセル
                </button>
              )}

              {a.record?.attended && (
                <>
                  <ReviewBox
                    application={a}
                    onSaved={(updated) => setApplications((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))}
                  />
                  <button
                    onClick={() =>
                      navigate(
                        `/report?targetType=ACTIVITY&targetId=${a.activityId}&targetLabel=${encodeURIComponent(a.activity?.title ?? "")}`,
                      )
                    }
                    className="text-[11px] text-gray-400 underline mt-2"
                  >
                    🔒 安全に関する報告をする(非公開・星評価とは別に運営のみが確認します)
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
