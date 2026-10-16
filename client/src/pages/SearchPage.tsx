import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { ActivityCard } from "../components/ActivityCard";
import { AIRecommendations } from "../components/AIRecommendations";
import { GENRES, GUNMA_CITIES, PARTICIPATION_LABELS, type Activity, type ParticipationType } from "../types";

const markerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

export function SearchPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [genre, setGenre] = useState("");
  const [city, setCity] = useState("");
  const [participationType, setParticipationType] = useState<ParticipationType | "">("");
  const [beginnerOnly, setBeginnerOnly] = useState(false);
  const [helpOnly, setHelpOnly] = useState(false);
  const [q, setQ] = useState("");
  const [showMap, setShowMap] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (genre) params.set("genre", genre);
    if (city) params.set("city", city);
    if (participationType) params.set("participationType", participationType);
    if (beginnerOnly) params.set("beginnerFriendly", "true");
    if (helpOnly) params.set("helpOnly", "true");
    if (q) params.set("q", q);

    setLoading(true);
    api
      .get<Activity[]>(`/activities?${params.toString()}`)
      .then(setActivities)
      .finally(() => setLoading(false));
  }, [genre, city, participationType, beginnerOnly, helpOnly, q]);

  const center = useMemo<[number, number]>(() => [36.42, 139.1], []);

  return (
    <div className="pb-4">
      <div className="px-4 pt-4 pb-2 sticky top-[53px] bg-white z-10 border-b border-gray-100">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="キーワードで検索(例: 学習支援)"
          className="w-full border border-gray-300 rounded-full px-4 py-2 text-sm mb-2"
        />
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          <select value={genre} onChange={(e) => setGenre(e.target.value)} className="text-xs border border-gray-300 rounded-full px-2.5 py-1.5 bg-white shrink-0">
            <option value="">ジャンル: すべて</option>
            {GENRES.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
          <select value={city} onChange={(e) => setCity(e.target.value)} className="text-xs border border-gray-300 rounded-full px-2.5 py-1.5 bg-white shrink-0">
            <option value="">地域: すべて</option>
            {GUNMA_CITIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select value={participationType} onChange={(e) => setParticipationType(e.target.value as ParticipationType | "")} className="text-xs border border-gray-300 rounded-full px-2.5 py-1.5 bg-white shrink-0">
            <option value="">参加形式: すべて</option>
            {Object.entries(PARTICIPATION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button
            onClick={() => setBeginnerOnly((v) => !v)}
            className="text-xs px-2.5 py-1.5 rounded-full border shrink-0"
            style={beginnerOnly ? { background: "#fffbeb", borderColor: "#f59e0b", color: "#b45309" } : { borderColor: "#d1d5db", color: "#6b7280" }}
          >
            初心者歓迎のみ
          </button>
          <button
            onClick={() => setHelpOnly((v) => !v)}
            className="text-xs px-2.5 py-1.5 rounded-full border shrink-0 font-bold"
            style={helpOnly ? { background: "#fffbeb", borderColor: "#f59e0b", color: "#92400e" } : { borderColor: "#d1d5db", color: "#6b7280" }}
          >
            🆘 おたすけ募集のみ
          </button>
        </div>
      </div>

      {user?.role === "STUDENT" && <AIRecommendations />}

      <div className="px-4 pt-3">
        <button onClick={() => setShowMap((v) => !v)} className="text-xs text-gray-500 mb-2 underline">
          {showMap ? "地図を隠す" : "地図を表示"}
        </button>
        {showMap && (
          <div className="mb-3">
            <MapContainer center={center} zoom={9} scrollWheelZoom={false}>
              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {activities.map((a) => (
                <Marker key={a.id} position={[a.lat, a.lng]} icon={markerIcon} eventHandlers={{ click: () => navigate(`/activities/${a.id}`) }}>
                  <Popup>
                    <div className="text-xs">
                      <p className="font-bold">{a.title}</p>
                      <p>{a.city}</p>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        )}
      </div>

      <div className="px-4 flex flex-col gap-3">
        {loading && <p className="text-xs text-gray-400 text-center py-6">読み込み中...</p>}
        {!loading && activities.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-6">条件に合う活動が見つかりませんでした。</p>
        )}
        {activities.map((a) => (
          <ActivityCard key={a.id} activity={a} />
        ))}
      </div>
    </div>
  );
}
