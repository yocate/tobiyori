import { TRUST_RANK_STYLE, type TrustInfo } from "../types";

export function TrustBadge({ trust, size = "sm" }: { trust: TrustInfo; size?: "sm" | "lg" }) {
  const style = TRUST_RANK_STYLE[trust.rank];
  return (
    <span
      className={size === "sm" ? "badge" : "inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-full"}
      style={{ background: style.bg, color: style.fg }}
      title={`信頼スコア ${trust.score}点(参加人数ではなく、初参加者への説明・フォロー・保険情報の更新・安全上の懸念の少なさなどから算出)`}
    >
      {style.emoji} {trust.rank}
    </span>
  );
}
