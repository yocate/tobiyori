import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { Community } from "../types";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function CommunityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [community, setCommunity] = useState<Community | null>(null);
  const [loading, setLoading] = useState(true);
  const [postBody, setPostBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    if (!id) return;
    api.get<Community>(`/communities/${id}`).then(setCommunity).finally(() => setLoading(false));
  }

  useEffect(reload, [id]);

  if (loading) return <p className="text-xs text-gray-400 text-center py-10">読み込み中...</p>;
  if (!community) return <p className="text-xs text-gray-400 text-center py-10">コミュニティが見つかりませんでした。</p>;

  const isMember = user ? community.memberships?.some((m) => m.user.id === user.id) : false;

  async function toggleMembership() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/communities/${community!.id}/${isMember ? "leave" : "join"}`);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "処理に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function submitPost(e: React.FormEvent) {
    e.preventDefault();
    if (!postBody.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/communities/${community!.id}/posts`, { body: postBody });
      setPostBody("");
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "投稿に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-4 pt-4 pb-8">
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        <span className="badge" style={{ background: "var(--brand-soft)", color: "var(--brand-dark)" }}>{community.interestTag}</span>
        {community.university && <span className="badge bg-blue-50 text-blue-700">{community.university}</span>}
        {community.city && <span className="badge bg-gray-100 text-gray-600">{community.city}</span>}
      </div>
      <h1 className="text-lg font-bold leading-snug mb-1">{community.name}</h1>
      <p className="text-xs text-gray-500 mb-4">作成者: {community.createdBy.name} ・ 👥 {community.memberships?.length ?? 0}人が参加</p>

      <p className="text-sm text-gray-700 whitespace-pre-wrap mb-4">{community.description}</p>

      {user?.role === "STUDENT" && (
        <button
          onClick={toggleMembership}
          disabled={busy}
          className="w-full py-2.5 rounded-xl text-sm font-semibold mb-2 disabled:opacity-50"
          style={isMember ? { border: "1px solid #d1d5db", color: "#374151" } : { background: "var(--brand)", color: "#fff" }}
        >
          {isMember ? "退会する" : "参加する"}
        </button>
      )}
      {!user && (
        <button onClick={() => navigate("/welcome")} className="w-full py-2.5 rounded-xl text-sm font-semibold mb-2 text-white" style={{ background: "var(--brand)" }}>
          ログインして参加する
        </button>
      )}
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      <button
        onClick={() =>
          navigate(`/report?targetType=COMMUNITY&targetId=${community.id}&targetLabel=${encodeURIComponent(community.name)}`)
        }
        className="w-full py-1.5 text-xs text-gray-400 underline mb-5"
      >
        このコミュニティについて通報・相談する
      </button>

      <h2 className="text-sm font-bold mb-2">メンバー</h2>
      <div className="flex flex-wrap gap-1.5 mb-5">
        {community.memberships?.map((m) => (
          <span key={m.id} className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-700">
            {m.role === "OWNER" ? "👑 " : ""}{m.user.name}
          </span>
        ))}
      </div>

      <h2 className="text-sm font-bold mb-2">投稿</h2>
      <div className="flex flex-col gap-2 mb-3">
        {(community.posts ?? []).length === 0 && <p className="text-xs text-gray-400">まだ投稿はありません。</p>}
        {community.posts?.map((p) => (
          <div key={p.id} className="rounded-xl bg-gray-50 border border-gray-100 p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold">{p.author.name}</span>
              <span className="text-[10px] text-gray-400">{formatDateTime(p.createdAt)}</span>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{p.body}</p>
          </div>
        ))}
      </div>

      {isMember && (
        <form onSubmit={submitPost} className="flex flex-col gap-2">
          <textarea
            value={postBody}
            onChange={(e) => setPostBody(e.target.value)}
            rows={2}
            placeholder="メンバーに向けて投稿する"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <button type="submit" disabled={busy || !postBody.trim()} className="self-start text-xs px-4 py-2 rounded-lg text-white disabled:opacity-40" style={{ background: "var(--brand)" }}>
            投稿する
          </button>
        </form>
      )}
      {!isMember && user?.role === "STUDENT" && (
        <p className="text-xs text-gray-400">参加すると投稿できるようになります。</p>
      )}
    </div>
  );
}
