import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./auth-context";

/** Technical screens (API tokens, n8n guide) belong to administrators; everybody else goes back to the list. */
export function RequireAdmin() {
  const { user } = useAuth();
  if (!user?.isAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}
