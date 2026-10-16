import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setToken, getToken } from "../api/client";
import type { AuthUser } from "../types";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  registerStudent: (payload: {
    email: string;
    password: string;
    name: string;
    university?: string;
    interests?: string;
  }) => Promise<AuthUser>;
  registerOrganization: (payload: {
    email: string;
    password: string;
    repName: string;
    orgName: string;
    category: string;
    description: string;
    insuranceInfo: string;
  }) => Promise<AuthUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get<AuthUser>("/auth/me")
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const res = await api.post<{ token: string; user: AuthUser }>("/auth/login", { email, password });
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }

  async function registerStudent(payload: {
    email: string;
    password: string;
    name: string;
    university?: string;
    interests?: string;
  }) {
    const res = await api.post<{ token: string; user: AuthUser }>("/auth/register/student", payload);
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }

  async function registerOrganization(payload: {
    email: string;
    password: string;
    repName: string;
    orgName: string;
    category: string;
    description: string;
    insuranceInfo: string;
  }) {
    const res = await api.post<{ token: string; user: AuthUser }>("/auth/register/organization", payload);
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, registerStudent, registerOrganization, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
