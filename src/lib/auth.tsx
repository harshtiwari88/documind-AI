import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { TOKEN_KEY, getJson, postJson } from "./api";

export interface AuthUser {
  email: string;
  name?: string;
  admin?: boolean;
  role?: "admin" | "user";
  status?: "active" | "suspended";
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string;
  guest?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string, twoFactorCode?: string) => Promise<any>;
  register: (email: string, password: string, name?: string, adminKey?: string, enable2FA?: boolean) => Promise<any>;
  signOut: () => void;
  continueAsGuest: () => void;
}

const Ctx = createContext<AuthContextType | null>(null);
export const useAuth = () => useContext(Ctx)!;

const GUEST: AuthUser = { email: "guest", name: "Guest User", guest: true, admin: false, role: "user" };

export function AuthProvider({ children }: { children: ReactNode }) {
  const hasToken = !!localStorage.getItem(TOKEN_KEY);
  // Default to GUEST if no token, so public features work immediately
  const [user, setUser] = useState<AuthUser | null>(hasToken ? null : GUEST);
  const [loading, setLoading] = useState(hasToken);

  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      setLoading(false);
      return;
    }
    getJson("/auth/me")
      .then((u) => {
        setUser({
          email: u.email,
          name: u.name || u.email.split("@")[0],
          admin: !!u.admin,
          role: u.role || (u.admin ? "admin" : "user"),
          status: u.status || "active",
          twoFactorEnabled: !!u.twoFactorEnabled,
          guest: false,
        });
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setUser(GUEST);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string, twoFactorCode = ""): Promise<any> {
    const payload: Record<string, string> = { email, password };
    if (twoFactorCode) payload.twoFactorCode = twoFactorCode;

    const r = await postJson("/auth/login", payload);
    if (r.twoFactorRequired) {
      return r;
    }

    localStorage.setItem(TOKEN_KEY, r.token);
    const u: AuthUser = {
      email: r.email,
      name: r.name || r.email.split("@")[0],
      admin: !!r.admin,
      role: r.role || (r.admin ? "admin" : "user"),
      twoFactorEnabled: !!r.twoFactorEnabled,
      guest: false,
    };
    setUser(u);
    return u;
  }

  async function register(
    email: string,
    password: string,
    name = "",
    adminKey = "",
    enable2FA = false
  ): Promise<any> {
    const payload: Record<string, any> = { email, password };
    if (name) payload.name = name;
    if (adminKey) payload.admin_key = adminKey;
    if (enable2FA) payload.enable2FA = enable2FA;

    const r = await postJson("/auth/register", payload);
    localStorage.setItem(TOKEN_KEY, r.token);
    const u: AuthUser = {
      email: r.email,
      name: r.name || name || r.email.split("@")[0],
      admin: !!r.admin,
      role: r.role || (r.admin ? "admin" : "user"),
      twoFactorEnabled: !!r.twoFactorEnabled,
      twoFactorSecret: r.twoFactorSecret,
      guest: false,
    };
    setUser(u);
    return { ...u, message: r.message };
  }

  function signOut() {
    localStorage.removeItem(TOKEN_KEY);
    setUser(GUEST);
  }

  function continueAsGuest() {
    localStorage.removeItem(TOKEN_KEY);
    setUser(GUEST);
  }

  return (
    <Ctx.Provider
      value={{
        user,
        loading,
        login,
        register,
        signOut,
        continueAsGuest,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
