import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Network } from "@capacitor/network";
import { authLogin } from "../services/api";
import { getSession, initLocalDb, qAll, getToken, saveSession, saveToken } from "../services/db";
import { runSyncOnce, startSyncLoop, stopSyncLoop } from "../services/sync";

export type SessionInfo = { phone: string; cashierId: number; name: string };

type AuthCtx = {
  ready: boolean;
  session: SessionInfo | null;
  /** Есть JWT с сервера — без него продажи не синхронизируются и чек не уйдёт в Telegram. */
  serverAuth: boolean;
  online: boolean;
  pendingSync: number;
  refreshPending: () => Promise<void>;
  login: (phone: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

/** Локальная сессия без сервера (страница входа отключена). */
const LOCAL_PHONE = "local";
const LOCAL_CASHIER_ID = 1;
const LOCAL_NAME = "Кассир";

async function ensureLocalSession(): Promise<SessionInfo> {
  const s = await getSession();
  if (s) {
    return { phone: s.phone, cashierId: s.cashier_id, name: s.name };
  }
  await saveSession(LOCAL_PHONE, LOCAL_CASHIER_ID, LOCAL_NAME);
  return { phone: LOCAL_PHONE, cashierId: LOCAL_CASHIER_ID, name: LOCAL_NAME };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [serverAuth, setServerAuth] = useState(false);
  const [online, setOnline] = useState(true);
  const [pendingSync, setPendingSync] = useState(0);

  const refreshPending = useCallback(async () => {
    const rows = await qAll<{ n: number }>(
      "SELECT COUNT(*) as n FROM sync_queue WHERE status = 'pending'"
    );
    setPendingSync(rows[0]?.n ?? 0);
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        await initLocalDb();
      } catch (e) {
        console.error("[Ice Kassa] initLocalDb:", e);
      }
      const st = await Network.getStatus();
      if (mounted) setOnline(st.connected);
      const sessionInfo = await ensureLocalSession();
      if (mounted) setSession(sessionInfo);
      const tok = await getToken();
      if (mounted) setServerAuth(Boolean(tok));
      if (st.connected) {
        try {
          await runSyncOnce();
        } catch {
          /* сеть / API недоступны */
        }
      }
      startSyncLoop();
      await refreshPending();
      if (mounted) setReady(true);
    })();
    const id = setInterval(() => {
      void refreshPending();
    }, 3000);
    const netSub = Network.addListener("networkStatusChange", (s) => setOnline(s.connected));
    return () => {
      mounted = false;
      clearInterval(id);
      void netSub.then((h) => h.remove());
      stopSyncLoop();
    };
  }, [refreshPending]);

  const login = useCallback(async (phone: string, pin: string) => {
    const { token, cashier } = await authLogin(phone, pin);
    await saveToken(token);
    await saveSession(cashier.phone, cashier.id, cashier.name);
    setSession({ phone: cashier.phone, cashierId: cashier.id, name: cashier.name });
    setServerAuth(true);
    try {
      await runSyncOnce();
    } catch {
      /* сеть */
    }
    await refreshPending();
  }, [refreshPending]);

  const logout = useCallback(async () => {
    await saveToken(null);
    await saveSession(LOCAL_PHONE, LOCAL_CASHIER_ID, LOCAL_NAME);
    setServerAuth(false);
    setSession({ phone: LOCAL_PHONE, cashierId: LOCAL_CASHIER_ID, name: LOCAL_NAME });
  }, []);

  const value = useMemo(
    () => ({
      ready,
      session,
      serverAuth,
      online,
      pendingSync,
      refreshPending,
      login,
      logout,
    }),
    [ready, session, serverAuth, online, pendingSync, refreshPending, login, logout]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth");
  return v;
}
