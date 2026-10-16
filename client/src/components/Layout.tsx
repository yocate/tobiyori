import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { BottomNav } from "./BottomNav";

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
        <button
          className="text-[15px] font-bold tracking-tight font-heading"
          style={{ color: "var(--brand-dark)" }}
          onClick={() => navigate(user ? (user.role === "STUDENT" ? "/search" : user.role === "ORG_ADMIN" ? "/org" : "/admin") : "/welcome")}
        >
          🌱 D-CROSS ぐんま
        </button>
        {user ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 max-w-[110px] truncate">{user.name}</span>
            <button
              className="text-xs px-2 py-1 rounded-full border border-gray-300 text-gray-600"
              onClick={() => {
                logout();
                navigate("/welcome");
              }}
            >
              ログアウト
            </button>
          </div>
        ) : (
          <button
            className="text-xs px-3 py-1.5 rounded-full text-white"
            style={{ background: "var(--brand)" }}
            onClick={() => navigate("/welcome")}
          >
            ログイン
          </button>
        )}
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
