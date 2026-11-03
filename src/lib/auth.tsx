import { createContext, useContext, useEffect, useState } from "react";
import { TOKEN_KEY, getJson, postJson } from "./api";
const Ctx = createContext<any>(null);
export const useAuth = () => useContext(Ctx);

const GUEST = { email: "guest", guest: true };

export function AuthProvider({ children }: any) {
  const hasToken = !!localStorage.getItem(TOKEN_KEY);
  // If no token present, immediately use guest so the app works without a backend
  const [user, setUser] = useState<any>(hasToken ? null : GUEST);
  const [loading, setLoading] = useState(hasToken);

  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return;
    getJson("/auth/me")
      .then(u => setUser(u))
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setUser(GUEST); // Fall back to guest when token is invalid / backend unreachable
      })
      .finally(() => setLoading(false));
  }, []);

  async function enter(path: string, email: string, password: string, adminKey = "") {
    const r = await postJson(path, adminKey ? { email, password, admin_key: adminKey } : { email, password });
    localStorage.setItem(TOKEN_KEY, r.token);
    setUser({ email: r.email, admin: !!r.admin });
  }

  return (
    <Ctx.Provider value={{
      user,
      loading,
      login: (e: string, p: string) => enter("/auth/login", e, p),
      register: (e: string, p: string, k?: string) => enter("/auth/register", e, p, k),
      signOut: () => { localStorage.removeItem(TOKEN_KEY); setUser(GUEST); },
    }}>
      {children}
    </Ctx.Provider>
  );
}
