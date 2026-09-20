import { broadcastLiveEvent } from '@/server/core/state/serverState';

export interface ActivePresenceSession {
  accessCode: string;
  name: string;
  role: string;
  ip: string;
  userAgent: string;
  loginAt: string;
  lastSeenAt: number;
}

export const activePresenceSessions = new Map<string, ActivePresenceSession>();

export function getActiveSessionsList(): ActivePresenceSession[] {
  const cutoff = Date.now() - 2 * 60 * 1000; // 2 minutes timeout
  const activeList: ActivePresenceSession[] = [];
  for (const [key, session] of activePresenceSessions.entries()) {
    if (session.lastSeenAt >= cutoff) {
      activeList.push(session);
    } else {
      activePresenceSessions.delete(key);
    }
  }
  return activeList;
}

export function recordUserPresence(session: { accessCode: string; name?: string; role?: string; ip?: string; userAgent?: string }) {
  const code = (session.accessCode || '').trim().toUpperCase();
  if (!code) return;
  const existing = activePresenceSessions.get(code);
  const now = Date.now();
  const item: ActivePresenceSession = {
    accessCode: code,
    name: session.name || existing?.name || 'Klien Satset',
    role: session.role || existing?.role || 'user',
    ip: session.ip || existing?.ip || 'unknown',
    userAgent: session.userAgent || existing?.userAgent || 'Web Browser',
    loginAt: existing?.loginAt || new Date().toISOString(),
    lastSeenAt: now,
  };
  activePresenceSessions.set(code, item);
  try {
    broadcastLiveEvent({
      type: 'presence_updated',
      activeSessions: getActiveSessionsList(),
    });
  } catch (e) {}
}

export function removeUserPresence(accessCode: string) {
  const code = (accessCode || '').trim().toUpperCase();
  if (!code) return;
  if (activePresenceSessions.has(code)) {
    activePresenceSessions.delete(code);
    try {
      broadcastLiveEvent({
        type: 'presence_updated',
        activeSessions: getActiveSessionsList(),
      });
    } catch (e) {}
  }
}

// Background cleanup loop for expired sessions
let cleanupTimer: any = null;
export function startPresenceCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const prevCount = activePresenceSessions.size;
    const list = getActiveSessionsList();
    if (activePresenceSessions.size !== prevCount) {
      try {
        broadcastLiveEvent({
          type: 'presence_updated',
          activeSessions: list,
        });
      } catch (e) {}
    }
  }, 45000);
}
