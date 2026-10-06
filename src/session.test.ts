import { describe, expect, it } from 'vitest';
import { clearSession, forgetToken, readSession, REMEMBER_MS, sessionAuthorization, writeSession } from './session';
function storage() { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } }; }
describe('One-day remembered Google session', () => {
  const now = 1800000000000;
  it('restores valid authorization after reopening without extending the Google expiry', () => {
    const store = storage(); writeSession('client', { token: 'test-token', expiresAt: now + 3600000 }, now, store);
    const session = readSession('client', now + 600000, store);
    expect(sessionAuthorization(session, now + 600000)).toEqual({ token: 'test-token', expiresAt: now + 3600000 });
    expect(session?.rememberUntil).toBe(now + REMEMBER_MS);
  });
  it('keeps sign-in remembered but removes an expired Drive token', () => {
    const store = storage(); writeSession('client', { token: 'test-token', expiresAt: now + 3600000 }, now, store);
    const session = readSession('client', now + 7200000, store);
    expect(session?.authorization).toBeUndefined(); expect(sessionAuthorization(session, now + 7200000)).toBeNull();
    expect(session?.rememberUntil).toBe(now + REMEMBER_MS);
  });
  it('expires the remembered session after one day, even if a token claims a longer lifetime', () => {
    const store = storage(); writeSession('client', { token: 'test-token', expiresAt: now + REMEMBER_MS * 2 }, now, store);
    expect(readSession('client', now + REMEMBER_MS + 1, store)).toBeNull();
  });
  it('does not extend the remembered window on reads', () => {
    const store = storage(); writeSession('client', { token: 'test-token', expiresAt: now + 3600000 }, now, store);
    expect(readSession('client', now + 1800000, store)?.rememberUntil).toBe(now + REMEMBER_MS);
  });
  it('clears invalid credentials after rejection, and clears the full session on sign-out', () => {
    const store = storage(); writeSession('client', { token: 'test-token', expiresAt: now + 3600000 }, now, store);
    expect(forgetToken('client', now, store)?.authorization).toBeUndefined(); clearSession('client', store);
    expect(readSession('client', now, store)).toBeNull();
  });
  it('does not restore another OAuth client’s authorization', () => {
    const store = storage(); writeSession('client-one', { token: 'test-token', expiresAt: now + 3600000 }, now, store);
    expect(readSession('client-two', now, store)).toBeNull();
  });
});
