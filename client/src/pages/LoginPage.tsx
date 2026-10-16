import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api/client";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user = await login(email, password);
      if (user.role === "STUDENT") navigate("/search");
      else if (user.role === "ORG_ADMIN") navigate("/org");
      else navigate("/admin");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ログインに失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-5 py-8">
      <h1 className="text-lg font-bold mb-1">ログイン</h1>
      <p className="text-xs text-gray-500 mb-6">学生・団体・運営どのアカウントでもログインできます。</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="text-xs font-semibold text-gray-600">
          メールアドレス
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
            placeholder="you@example.com"
          />
        </label>
        <label className="text-xs font-semibold text-gray-600">
          パスワード
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
            placeholder="••••••••"
          />
        </label>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-2 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
          style={{ background: "var(--brand)" }}
        >
          {busy ? "ログイン中..." : "ログイン"}
        </button>
      </form>

      <div className="mt-6 text-center text-xs text-gray-500 flex flex-col gap-1">
        <span>
          学生ではじめて利用する方は <Link to="/register/student" className="underline" style={{ color: "var(--brand-dark)" }}>学生登録</Link>
        </span>
        <span>
          団体ではじめて利用する方は <Link to="/register/organization" className="underline" style={{ color: "var(--brand-dark)" }}>団体登録</Link>
        </span>
      </div>

      <div className="mt-8 rounded-xl bg-gray-50 border border-gray-200 p-3 text-[11px] text-gray-500 leading-relaxed">
        <p className="font-semibold text-gray-600 mb-1">デモ用アカウント</p>
        学生: student1@d-cross.jp / password123<br />
        団体: org-matsuri@d-cross.jp / password123<br />
        運営: operator@d-cross.jp / password123
      </div>
    </div>
  );
}
