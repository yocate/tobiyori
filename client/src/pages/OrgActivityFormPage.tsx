import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { GENRES, GUNMA_CITIES, PARTICIPATION_LABELS, type Activity, type ParticipationType, type RiskLevel } from "../types";

const CITY_COORDS: Record<string, [number, number]> = {
  "前橋市": [36.3906, 139.0604],
  "高崎市": [36.3229, 139.0033],
  "桐生市": [36.4058, 139.3316],
  "伊勢崎市": [36.3149, 139.1966],
  "太田市": [36.2914, 139.3756],
  "沼田市": [36.6459, 139.0459],
  "館林市": [36.2434, 139.5364],
  "渋川市": [36.4897, 139.0007],
  "藤岡市": [36.2547, 139.0755],
  "富岡市": [36.2578, 138.8917],
  "安中市": [36.3325, 138.8898],
  "みどり市": [36.4319, 139.3013],
};

const emptyForm = {
  title: "",
  description: "",
  genre: GENRES[0] as string,
  city: GUNMA_CITIES[0] as string,
  dateTime: "",
  participationTypes: [] as ParticipationType[],
  beginnerFriendly: false,
  riskLevel: "LOW" as RiskLevel,
  insuranceCovered: false,
  capacity: 10,
  transportNote: "",
  emergencyContact: "",
  incidentProcedure: "",
  durationMinutes: "",
  parkingAvailable: false,
  transportCost: "",
  contactPerson: "",
  itemsToBring: "",
  photoPolicy: "",
  prohibitedNotes: "",
  isHelpRequest: false,
};

export function OrgActivityFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const [params] = useSearchParams();
  const isHelpMode = !isEdit && params.get("help") === "1";
  const navigate = useNavigate();
  const [form, setForm] = useState(() => (isHelpMode ? { ...emptyForm, isHelpRequest: true, participationTypes: ["ONE_TIME"] as ParticipationType[] } : emptyForm));
  const [loading, setLoading] = useState(isEdit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.get<Activity>(`/activities/${id}`).then((a) => {
      setForm({
        title: a.title,
        description: a.description,
        genre: a.genre,
        city: a.city,
        dateTime: a.dateTime.slice(0, 16),
        participationTypes: a.participationTypes.split(",") as ParticipationType[],
        beginnerFriendly: a.beginnerFriendly,
        riskLevel: a.riskLevel,
        insuranceCovered: a.insuranceCovered,
        capacity: a.capacity,
        transportNote: a.transportNote ?? "",
        emergencyContact: a.emergencyContact ?? "",
        incidentProcedure: a.incidentProcedure ?? "",
        durationMinutes: a.durationMinutes ? String(a.durationMinutes) : "",
        parkingAvailable: a.parkingAvailable,
        transportCost: a.transportCost ?? "",
        contactPerson: a.contactPerson ?? "",
        itemsToBring: a.itemsToBring ?? "",
        photoPolicy: a.photoPolicy ?? "",
        prohibitedNotes: a.prohibitedNotes ?? "",
        isHelpRequest: a.isHelpRequest,
      });
      setLoading(false);
    });
  }, [id]);

  function toggleType(t: ParticipationType) {
    setForm((f) => ({
      ...f,
      participationTypes: f.participationTypes.includes(t)
        ? f.participationTypes.filter((x) => x !== t)
        : [...f.participationTypes, t],
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.participationTypes.length === 0) {
      setError("参加形式を1つ以上選択してください");
      return;
    }
    setBusy(true);
    setError(null);
    const [lat, lng] = CITY_COORDS[form.city] ?? [36.39, 139.06];
    const payload = {
      ...form,
      lat,
      lng,
      dateTime: new Date(form.dateTime).toISOString(),
      capacity: Number(form.capacity),
      durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : undefined,
    };
    try {
      if (isEdit) {
        await api.put(`/activities/${id}`, payload);
      } else {
        await api.post("/activities", payload);
      }
      navigate("/org");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-xs text-gray-400 text-center py-10">読み込み中...</p>;

  return (
    <div className="px-5 py-6">
      <h1 className="text-lg font-bold mb-1">{isEdit ? "活動を編集" : isHelpMode ? "🆘 おたすけ募集を出す" : "新しい活動を掲載"}</h1>
      {isHelpMode && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-4">
          急な人手不足を発信するための簡易募集です。最低限の項目だけでもすぐに掲載できます。
        </p>
      )}

      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="text-xs font-semibold text-gray-600">
          活動タイトル
          <input required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" placeholder={isHelpMode ? "例: 【急募】明日の設営スタッフ求む" : undefined} />
        </label>
        <label className="text-xs font-semibold text-gray-600">
          活動内容
          <textarea required rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" />
        </label>
        <label className="text-xs font-semibold text-gray-600">
          ジャンル
          <select value={form.genre} onChange={(e) => setForm((f) => ({ ...f, genre: e.target.value }))} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm">
            {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-gray-600">
          市町村
          <select value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm">
            {GUNMA_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-gray-600">
          日時
          <input required type="datetime-local" value={form.dateTime} onChange={(e) => setForm((f) => ({ ...f, dateTime: e.target.value }))} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" />
        </label>

        <div className="text-xs font-semibold text-gray-600">
          参加形式(複数選択可)
          <div className="mt-1.5 flex gap-1.5">
            {Object.entries(PARTICIPATION_LABELS).map(([k, v]) => (
              <button type="button" key={k} onClick={() => toggleType(k as ParticipationType)} className="flex-1 text-xs py-2 rounded-lg border"
                style={form.participationTypes.includes(k as ParticipationType) ? { background: "var(--brand)", color: "#fff", borderColor: "var(--brand)" } : { borderColor: "#d1d5db", color: "#374151" }}>
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-gray-600">
            定員
            <input required type="number" min={1} value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: Number(e.target.value) }))} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" />
          </label>
          <label className="text-xs font-semibold text-gray-600">
            所要時間(分・任意)
            <input type="number" min={1} value={form.durationMinutes} onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" placeholder="例: 120" />
          </label>
        </div>

        <label className="text-xs font-semibold text-gray-600">
          アクセス・移動手段メモ(任意)
          <input value={form.transportNote} onChange={(e) => setForm((f) => ({ ...f, transportNote: e.target.value }))} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" placeholder="例: 〇〇駅から徒歩10分" />
        </label>
        <label className="text-xs font-semibold text-gray-600">
          交通費(任意)
          <input value={form.transportCost} onChange={(e) => setForm((f) => ({ ...f, transportCost: e.target.value }))} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" placeholder="例: 実費支給あり(上限500円)" />
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={form.parkingAvailable} onChange={(e) => setForm((f) => ({ ...f, parkingAvailable: e.target.checked }))} />
          駐車場あり
        </label>
        <label className="text-xs font-semibold text-gray-600">
          担当者(任意)
          <input value={form.contactPerson} onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" placeholder="例: 事務局長 高橋" />
        </label>
        <label className="text-xs font-semibold text-gray-600">
          持ち物(任意)
          <input value={form.itemsToBring} onChange={(e) => setForm((f) => ({ ...f, itemsToBring: e.target.value }))} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" placeholder="例: 動きやすい服装、飲み物" />
        </label>
        <label className="text-xs font-semibold text-gray-600">
          緊急連絡先(任意・当日の連絡先)
          <input value={form.emergencyContact} onChange={(e) => setForm((f) => ({ ...f, emergencyContact: e.target.value }))} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" placeholder="例: 当日運営携帯 090-xxxx-xxxx" />
        </label>
        <label className="text-xs font-semibold text-gray-600">
          事故発生時の手順(任意)
          <textarea rows={2} value={form.incidentProcedure} onChange={(e) => setForm((f) => ({ ...f, incidentProcedure: e.target.value }))} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" placeholder="例: まず責任者へ連絡→必要に応じて救急要請→保険窓口へ連絡" />
        </label>
        <label className="text-xs font-semibold text-gray-600">
          撮影方針(任意)
          <textarea rows={2} value={form.photoPolicy} onChange={(e) => setForm((f) => ({ ...f, photoPolicy: e.target.value }))} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" placeholder="例: 記録用に撮影し、SNSで使用する場合があります" />
        </label>
        <label className="text-xs font-semibold text-gray-600">
          禁止事項(任意)
          <textarea rows={2} value={form.prohibitedNotes} onChange={(e) => setForm((f) => ({ ...f, prohibitedNotes: e.target.value }))} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" placeholder="例: 個人的な連絡先交換、勧誘行為は禁止です" />
        </label>
        <label className="text-xs font-semibold text-gray-600">
          危険性の目安
          <select value={form.riskLevel} onChange={(e) => setForm((f) => ({ ...f, riskLevel: e.target.value as RiskLevel }))} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm">
            <option value="LOW">低リスク</option>
            <option value="MEDIUM">中リスク(屋外活動など)</option>
            <option value="HIGH">高リスク</option>
          </select>
        </label>

        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={form.beginnerFriendly} onChange={(e) => setForm((f) => ({ ...f, beginnerFriendly: e.target.checked }))} />
          初心者歓迎
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={form.insuranceCovered} onChange={(e) => setForm((f) => ({ ...f, insuranceCovered: e.target.checked }))} />
          活動保険に加入している
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold p-2.5 rounded-lg border" style={form.isHelpRequest ? { borderColor: "#f59e0b", background: "#fffbeb", color: "#92400e" } : { borderColor: "#d1d5db", color: "#374151" }}>
          <input type="checkbox" checked={form.isHelpRequest} onChange={(e) => setForm((f) => ({ ...f, isHelpRequest: e.target.checked }))} />
          🆘 おたすけ募集として目立たせる(急な人手不足のとき)
        </label>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <button type="submit" disabled={busy} className="mt-2 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-50" style={{ background: "var(--brand)" }}>
          {busy ? "保存中..." : isEdit ? "更新する" : "掲載する"}
        </button>
      </form>
    </div>
  );
}
