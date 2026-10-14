import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, setAccessToken } from "../api/client";
import type { ApiEnvelope, Role, User } from "../types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  loginWithGoogle(idToken: string): Promise<void>;
  logout(): Promise<void>;
  hasRole(...roles: Role[]): boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface SessionResponse { accessToken: string; expiresInSeconds: number; user: User }

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback((session: SessionResponse) => {
    // Query keys are shared by pages; never carry one account's data into another.
    queryClient.clear();
    setAccessToken(session.accessToken);
    setUser(session.user);
  }, [queryClient]);

  useEffect(() => {
    let active = true;
    api.post<ApiEnvelope<SessionResponse>>("/auth/refresh").then(({ data }) => { if (active) applySession(data.data); }).catch(() => { setAccessToken(null); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [applySession]);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post<ApiEnvelope<SessionResponse>>("/auth/login", { email, password });
    applySession(data.data);
  }, [applySession]);

  const loginWithGoogle = useCallback(async (idToken: string) => {
    const { data } = await api.post<ApiEnvelope<SessionResponse>>("/auth/google", { idToken });
    applySession(data.data);
  }, [applySession]);

  const logout = useCallback(async () => {
    try { await api.post("/auth/logout"); } finally { setAccessToken(null); queryClient.clear(); setUser(null); }
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(() => ({ user, loading, login, loginWithGoogle, logout, hasRole: (...roles) => Boolean(user && roles.includes(user.role)) }), [loading, login, loginWithGoogle, logout, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
