import { Navigate } from "react-router-dom";
import { roleAtLeast, useAuth } from "../auth/AuthContext";

// No dedicated landing page yet — send each role to the view they'll use most.
export function HomePage() {
  const { user } = useAuth();
  if (!user) return null;
  if (roleAtLeast(user.role, "CAPTAIN")) return <Navigate to="/drives" replace />;
  return <Navigate to="/my-drives" replace />;
}
