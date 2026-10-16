import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api/client";
import { GUNMA_CITIES } from "../types";

// Rule-based stand-in for "AI下書き": no external model call, just a template
// filled in from what the organizer already typed, so it's instant and free.
function draftDescription(orgName: string, category: string, city: string): string {
  if (!orgName || !category) return "";
  const place = city ? `${city}を中心に、` : "";
  return `私たち${orgName}は、${place}「${category}」の活動を通じて地域とのつながりづくりに取り組んでいます。学生の皆さんの新しい視点やアイデアを歓迎しており、見学だけの参加も大歓迎です。まずはお気軽にご参加ください。`;
}

export function RegisterOrganizationPage() {
  const { registerOrganization } = useAuth();
  const navigate = useNavigate();
  const [repName, setRepName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [description, setDescription] = useState("");
  const [insuranceInfo, setInsuranceInfo] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await registerOrganization({ email, password, repName, orgName, category, description, insuranceInfo });
      navigate("/org");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "登録に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-5 py-8">
      <h1 className="text-lg font-bold mb-1">団体登録の申請</h1>
      <p className="text-xs text-gray-500 mb-6">
        登録後、運営が代表者・団体情報を事前確認します。承認されるまで活動の掲載はできません。
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="text-xs font-semibold text-gray-600">
          団体名
          <input required value={orgName} onChange={(e) => setOrgName(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" placeholder="例: 前橋まつり実行委員会" />
        </label>
        <label className="text-xs font-semibold text-gray-600">
          代表者名
          <input required value={repName} onChange={(e) => setRepName(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" />
        </label>
        <label className="text-xs font-semibold text-gray-600">
          活動カテゴリ
          <input required value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" placeholder="例: 子どもの学習支援(学生サークルの場合は「学生サークル」)" />
        </label>
        <label className="text-xs font-semibold text-gray-600">
          主な活動地域(任意・AI下書きに使用)
          <select value={city} onChange={(e) => setCity(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm">
            <option value="">選択してください</option>
            {GUNMA_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <div className="text-xs font-semibold text-gray-600">
          <div className="flex items-center justify-between mb-1">
            <span>団体の紹介</span>
            <button
              type="button"
              onClick={() => setDescription(draftDescription(orgName, category, city))}
              disabled={!orgName || !category}
              className="text-[11px] px-2.5 py-1 rounded-full border border-gray-300 text-gray-600 disabled:opacity-40 font-normal"
            >
              🤖 AIで下書き
            </button>
          </div>
          <textarea required value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-normal" />
        </div>
        <label className="text-xs font-semibold text-gray-600">
          保険加入状況
          <input required value={insuranceInfo} onChange={(e) => setInsuranceInfo(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" placeholder="例: イベント傷害保険加入済み" />
        </label>
        <label className="text-xs font-semibold text-gray-600">
          担当者メールアドレス
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" />
        </label>
        <label className="text-xs font-semibold text-gray-600">
          パスワード(6文字以上)
          <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" />
        </label>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <button type="submit" disabled={busy} className="mt-2 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-50" style={{ background: "var(--ink)" }}>
          {busy ? "送信中..." : "申請を送信する"}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-gray-500">
        すでにアカウントをお持ちの方は <Link to="/login" className="underline" style={{ color: "var(--brand-dark)" }}>ログイン</Link>
      </p>
    </div>
  );
}
