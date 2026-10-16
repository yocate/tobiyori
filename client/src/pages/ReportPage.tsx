import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { ReportTargetType } from "../types";

const TARGET_LABELS: Record<ReportTargetType, string> = {
  ACTIVITY: "活動について",
  ORGANIZATION: "団体について",
  USER: "利用者について",
  COMMUNITY: "学生コミュニティについて",
};

export function ReportPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [targetType, setTargetType] = useState<ReportTargetType>(
    (params.get("targetType") as ReportTargetType) || "ACTIVITY",
  );
  const [targetLabel, setTargetLabel] = useState(params.get("targetLabel") ?? "");
  const [reason, setReason] = useState("");
  const [anonymous, setAnonymous] = useState(!user);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/reports", {
        targetType,
        targetId: params.get("targetId") ?? undefined,
        targetLabel: targetLabel || TARGET_LABELS[targetType],
        reason,
        anonymous,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "送信に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="px-5 py-12 text-center">
        <div className="text-3xl mb-3">🛟</div>
        <h1 className="text-base font-bold mb-2">受け付けました</h1>
        <p className="text-xs text-gray-500">
          ご報告ありがとうございます。運営が内容を確認し、必要に応じて対応します。
        </p>
      </div>
    );
  }

  return (
    <div className="px-5 py-6">
      <h1 className="text-lg font-bold mb-1">通報・相談</h1>
      <p className="text-xs text-gray-500 mb-6">
        営業・宗教・政治・恋愛目的の勧誘や、危険な活動、不適切な対応などがあればお知らせください。匿名での送信も可能です。
      </p>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="text-xs font-semibold text-gray-600">
          対象
          <select
            value={targetType}
            onChange={(e) => setTargetType(e.target.value as ReportTargetType)}
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
          >
            {Object.entries(TARGET_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-gray-600">
          活動名・団体名など(わかる範囲で)
          <input
            value={targetLabel}
            onChange={(e) => setTargetLabel(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-gray-600">
          内容
          <textarea
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={5}
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
            placeholder="具体的な状況を教えてください"
          />
        </label>

        {user && (
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
            匿名で送信する(アカウント情報を運営に共有しません)
          </label>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-2 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
          style={{ background: "var(--danger)" }}
        >
          {busy ? "送信中..." : "送信する"}
        </button>
      </form>
    </div>
  );
}
