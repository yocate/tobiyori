import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { UniversitySelect } from "../components/UniversitySelect";

export function CommunityCreatePage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [interestTag, setInterestTag] = useState("");
  const [university, setUniversity] = useState("");
  const [city, setCity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const community = await api.post<{ id: string }>("/communities", {
        name,
        description,
        interestTag,
        university: university || undefined,
        city: city || undefined,
      });
      navigate(`/communities/${community.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "作成に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-5 py-6">
      <h1 className="text-lg font-bold mb-1">コミュニティを作る</h1>
      <p className="text-xs text-gray-500 mb-6">
        個人の連絡先を交換する場ではありません。やりとりはサービス内の投稿で行ってください。
      </p>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="text-xs font-semibold text-gray-600">
          コミュニティ名
          <input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" placeholder="例: 群馬大学 国際交流サークル" />
        </label>
        <label className="text-xs font-semibold text-gray-600">
          紹介文
          <textarea required rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" />
        </label>
        <label className="text-xs font-semibold text-gray-600">
          興味・ジャンル
          <input required value={interestTag} onChange={(e) => setInterestTag(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" placeholder="例: 国際交流、軽音楽、写真" />
        </label>
        <div className="text-xs font-semibold text-gray-600">
          大学名(任意)
          <div className="mt-1">
            <UniversitySelect value={university} onChange={setUniversity} />
          </div>
        </div>
        <label className="text-xs font-semibold text-gray-600">
          活動地域(任意)
          <input value={city} onChange={(e) => setCity(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" placeholder="例: 前橋市" />
        </label>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <button type="submit" disabled={busy} className="mt-2 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-50" style={{ background: "var(--brand)" }}>
          {busy ? "作成中..." : "作成する"}
        </button>
      </form>
    </div>
  );
}
