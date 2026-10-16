import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api/client";
import { GENRES } from "../types";
import { UniversitySelect } from "../components/UniversitySelect";

export function RegisterStudentPage() {
  const { registerStudent } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [university, setUniversity] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleInterest(genre: string) {
    setInterests((prev) => (prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await registerStudent({ email, password, name, university, interests: interests.join(",") });
      navigate("/search");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "登録に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-5 py-8">
      <h1 className="text-lg font-bold mb-1">学生登録</h1>
      <p className="text-xs text-gray-500 mb-6">個人の住所や連絡先が公開されることはありません。</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="text-xs font-semibold text-gray-600">
          お名前
          <input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" />
        </label>
        <label className="text-xs font-semibold text-gray-600">
          メールアドレス
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" />
        </label>
        <label className="text-xs font-semibold text-gray-600">
          パスワード(6文字以上)
          <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" />
        </label>
        <div className="text-xs font-semibold text-gray-600">
          大学・学校名(任意)
          <div className="mt-1">
            <UniversitySelect value={university} onChange={setUniversity} />
          </div>
        </div>

        <div className="text-xs font-semibold text-gray-600">
          興味のある分野(任意・複数選択可)
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {GENRES.map((g) => (
              <button
                type="button"
                key={g}
                onClick={() => toggleInterest(g)}
                className="text-[11px] px-2.5 py-1.5 rounded-full border"
                style={
                  interests.includes(g)
                    ? { background: "var(--brand-soft)", borderColor: "var(--brand)", color: "var(--brand-dark)" }
                    : { borderColor: "#d1d5db", color: "#6b7280" }
                }
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <button type="submit" disabled={busy} className="mt-2 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-50" style={{ background: "var(--brand)" }}>
          {busy ? "登録中..." : "登録する"}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-gray-500">
        すでにアカウントをお持ちの方は <Link to="/login" className="underline" style={{ color: "var(--brand-dark)" }}>ログイン</Link>
      </p>
    </div>
  );
}
