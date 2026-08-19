import { Navigate, Outlet } from "react-router-dom";
import { useAuth, roleAtLeast } from "../auth/AuthContext";
import { UserRole } from "../lib/types";

export function ProtectedRoute({ minRole }: { minRole?: UserRole }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="page-loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (minRole && !roleAtLeast(user.role, minRole)) return <Navigate to="/" replace />;

  return <Outlet />;
}
