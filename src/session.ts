export const REMEMBER_MS = 24 * 60 * 60 * 1000;
export interface Authorization { token: string; expiresAt: number }
export interface RememberedSession { clientId: string; rememberUntil: number; authorization?: Authorization }
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const key = (clientId: string) => `sayarathy.session.${clientId}`;
function browserStore(): Store | undefined { try { return localStorage; } catch { return undefined; } }

export function readSession(clientId: string, now = Date.now(), store = browserStore()): RememberedSession | null {
  if (!store || !clientId) return null;
  try {
    const raw = store.getItem(key(clientId)); if (!raw) return null;
    const value = JSON.parse(raw) as RememberedSession;
    if (value.clientId !== clientId || !Number.isFinite(value.rememberUntil) || value.rememberUntil <= now || value.rememberUntil > now + REMEMBER_MS + 60000) { store.removeItem(key(clientId)); return null; }
    const authorization = value.authorization;
    if (authorization && (typeof authorization.token !== 'string' || !authorization.token || authorization.token.length > 8192 || !Number.isFinite(authorization.expiresAt) || authorization.expiresAt <= now + 30000)) {
      delete value.authorization; store.setItem(key(clientId), JSON.stringify(value));
    }
    return value;
  } catch { try { store.removeItem(key(clientId)); } catch { /* Storage may be disabled. */ } return null; }
}
export function writeSession(clientId: string, authorization: Authorization, now = Date.now(), store = browserStore()): RememberedSession {
  const session: RememberedSession = { clientId, rememberUntil: now + REMEMBER_MS, authorization: { token: authorization.token, expiresAt: Math.min(authorization.expiresAt, now + REMEMBER_MS) } };
  try { store?.setItem(key(clientId), JSON.stringify(session)); } catch { /* Authorization still works in memory. */ }
  return session;
}
export function sessionAuthorization(session: RememberedSession | null, now = Date.now()): Authorization | null {
  if (!session || session.rememberUntil <= now || !session.authorization || session.authorization.expiresAt <= now + 30000) return null;
  return { token: session.authorization.token, expiresAt: Math.min(session.authorization.expiresAt, session.rememberUntil) };
}
export function forgetToken(clientId: string, now = Date.now(), store = browserStore()): RememberedSession | null {
  const session = readSession(clientId, now, store); if (!session) return null;
  delete session.authorization; try { store?.setItem(key(clientId), JSON.stringify(session)); } catch { /* In-memory continuation remains available. */ } return session;
}
export function clearSession(clientId: string, store = browserStore()) { try { store?.removeItem(key(clientId)); } catch { /* Storage may be disabled. */ } }
