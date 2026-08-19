import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, ApiError } from "../lib/api";
import { CurrentUser } from "../lib/types";

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<CurrentUser>("/auth/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const loggedIn = await api.post<CurrentUser>("/auth/login", { email, password });
    setUser(loggedIn);
  }

  async function logout() {
    await api.post("/auth/logout");
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function roleAtLeast(role: string, min: string): boolean {
  const rank: Record<string, number> = { VIEWER: 0, PANELIST: 1, CAPTAIN: 2, ADMIN: 3, SUPER_ADMIN: 4 };
  return (rank[role] ?? -1) >= (rank[min] ?? 99);
}

export { ApiError };
