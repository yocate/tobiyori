import { useState } from "react";
import { GUNMA_UNIVERSITIES } from "../types";

export function UniversitySelect({
  value,
  onChange,
  allowEmpty = true,
}: {
  value: string;
  onChange: (v: string) => void;
  allowEmpty?: boolean;
}) {
  const isKnown = (GUNMA_UNIVERSITIES as readonly string[]).includes(value);
  const [customMode, setCustomMode] = useState(value !== "" && !isKnown);

  return (
    <div className="flex flex-col gap-1.5">
      <select
        value={customMode ? "その他" : value}
        onChange={(e) => {
          if (e.target.value === "その他") {
            setCustomMode(true);
            onChange("");
          } else {
            setCustomMode(false);
            onChange(e.target.value);
          }
        }}
        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
      >
        {allowEmpty && <option value="">選択してください</option>}
        {GUNMA_UNIVERSITIES.map((u) => (
          <option key={u} value={u}>{u}</option>
        ))}
      </select>
      {customMode && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="大学名を入力"
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
        />
      )}
    </div>
  );
}
