import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function Item({ to, label, icon }: { to: string; label: string; icon: string }) {
  return (
    <NavLink to={to} className={({ isActive }) => (isActive ? "active" : "")} end>
      <span aria-hidden style={{ fontSize: 18 }}>
        {icon}
      </span>
      {label}
    </NavLink>
  );
}

export function BottomNav() {
  const { user } = useAuth();

  if (!user) {
    return (
      <nav className="bottom-nav">
        <Item to="/search" label="活動を探す" icon="🔍" />
        <Item to="/communities" label="コミュニティ" icon="💬" />
        <Item to="/report" label="通報・相談" icon="🛟" />
        <Item to="/welcome" label="ログイン" icon="👤" />
      </nav>
    );
  }

  if (user.role === "STUDENT") {
    return (
      <nav className="bottom-nav">
        <Item to="/search" label="探す" icon="🔍" />
        <Item to="/communities" label="コミュニティ" icon="💬" />
        <Item to="/mypage" label="マイページ" icon="🗂️" />
        <Item to="/report" label="通報・相談" icon="🛟" />
      </nav>
    );
  }

  if (user.role === "ORG_ADMIN") {
    return (
      <nav className="bottom-nav">
        <Item to="/org" label="ダッシュボード" icon="🏠" />
        <Item to="/search" label="活動を見る" icon="🔍" />
        <Item to="/report" label="通報・相談" icon="🛟" />
      </nav>
    );
  }

  return (
    <nav className="bottom-nav">
      <Item to="/admin" label="運営管理" icon="✅" />
    </nav>
  );
}
