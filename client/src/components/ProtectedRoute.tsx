import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { Role } from "../types";

export function ProtectedRoute({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="p-6 text-center text-gray-400 text-sm">読み込み中...</div>;
  }
  if (!user) {
    return <Navigate to="/welcome" replace />;
  }
  if (!roles.includes(user.role)) {
    return <Navigate to="/welcome" replace />;
  }
  return <>{children}</>;
}
