import { syncHistoryAsync } from '../lib/history';
import { useState, useEffect, useCallback } from 'react';
import {
  getUserSession,
  setUserSession,
  logoutUser,
  verifyAccessCodeAsync,
  sendLoginAuditLog,
  UserSession,
} from '../lib/auth';

export interface UseAuthReturn {
  session: UserSession | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isUser: boolean;
  code: string;
  role: 'admin' | 'user' | null;
  name: string;
  email: string;
  isLoading: boolean;
  isValidating: boolean;
  error: string | null;
  login: (accessCode: string) => Promise<{ success: boolean; session?: UserSession; error?: string }>;
  logout: () => Promise<void>;
  refreshSession: () => void;
  validateBackendSession: () => Promise<boolean>;
  setSession: (session: UserSession | null) => void;
  clearError: () => void;
}

/**
 * Custom React Hook for authentication and session management.
 * Follows the secure backend-first architecture, keeping state in sync
 * across components, windows, and tabs with robust error handling.
 */
export function useAuth(): UseAuthReturn {
  const [session, setSessionState] = useState<UserSession | null>(() => {
    const current = getUserSession();
    if (current && current.code === 'GUEST-ACCESS') {
      return null;
    }
    return current;
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refreshSession = useCallback(() => {
    const current = getUserSession();
    if (current && current.code !== 'GUEST-ACCESS') {
      setSessionState(current);
    } else {
      setSessionState(null);
    }
  }, []);

  // Sync state on mount and subscribe to auth/storage events
  useEffect(() => {
    refreshSession();
    setIsLoading(false);

    const handleAuthEvent = () => {
      refreshSession();
    };

    window.addEventListener('satset_auth_updated', handleAuthEvent);
    window.addEventListener('satset_session_updated', handleAuthEvent);
    window.addEventListener('satset_clients_updated', handleAuthEvent);
    window.addEventListener('storage', handleAuthEvent);

    return () => {
      window.removeEventListener('satset_auth_updated', handleAuthEvent);
      window.removeEventListener('satset_session_updated', handleAuthEvent);
      window.removeEventListener('satset_clients_updated', handleAuthEvent);
      window.removeEventListener('storage', handleAuthEvent);
    };
  }, [refreshSession]);

  // Real-time presence heartbeat every 30 seconds when authenticated
  useEffect(() => {
    if (!session?.code || session.code === 'GUEST-ACCESS') return;

    const sendHeartbeat = async () => {
      try {
        await fetch('/api/presence/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accessCode: session.code,
            name: session.name || 'User',
            role: session.role || 'user',
          }),
        });
      } catch (e) {}
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 30000);
    return () => clearInterval(interval);
  }, [session?.code, session?.name, session?.role]);

  /**
   * Validate session with backend proxy endpoint
   */
  const validateBackendSession = useCallback(async (): Promise<boolean> => {
    const current = getUserSession();
    if (!current || !current.code || current.code === 'GUEST-ACCESS') {
      return false;
    }

    setIsValidating(true);
    try {
      const res = await verifyAccessCodeAsync(current.code);
      if (res.success && res.role) {
        const updatedSession: UserSession = {
          code: res.code || current.code,
          role: res.role,
          email: res.email || current.email,
          name: res.name || current.name,
          loginTime: current.loginTime || Date.now(),
        };
        setUserSession(updatedSession);
        setSessionState(updatedSession);
        setError(null);
        return true;
      } else {
        // Session invalid on backend
        logoutUser();
        setSessionState(null);
        setError(res.error || 'Sesi telah kedaluwarsa atau tidak valid.');
        return false;
      }
    } catch (err: any) {
      console.warn('[useAuth] Validation error:', err);
      return true; // Keep local on network glitch
    } finally {
      setIsValidating(false);
    }
  }, []);

  /**
   * Secure login via backend verification
   */
  const login = useCallback(
    async (
      accessCode: string
    ): Promise<{ success: boolean; session?: UserSession; error?: string }> => {
      const cleaned = accessCode.trim();
      if (!cleaned) {
        const msg = 'Silakan masukkan Kode Akses.';
        setError(msg);
        return { success: false, error: msg };
      }

      setIsValidating(true);
      setError(null);

      try {
        const res = await verifyAccessCodeAsync(cleaned);
        if (res.success && res.role) {
          const newSession: UserSession = {
            code: res.code || cleaned.toUpperCase(),
            role: res.role,
            email: res.email,
            name: res.name || (res.role === 'admin' ? 'Administrator' : 'Klien Satset'),
            loginTime: Date.now(),
          };

          setUserSession(newSession);
          setSessionState(newSession);
          syncHistoryAsync(newSession.code);
          setError(null);

          sendLoginAuditLog({
            action: 'LOGIN BERHASIL',
            details: `User ${newSession.name || 'User'} berhasil login (${newSession.role.toUpperCase()}) • Kode: ${newSession.code}`,
            category: newSession.role === 'admin' ? 'system' : 'client',
            actor: newSession.name ? `${newSession.name} (${newSession.code})` : newSession.code,
          });

          return { success: true, session: newSession };
        } else {
          const errMsg = res.error || 'Kode Akses tidak valid atau telah kedaluwarsa.';
          setError(errMsg);

          sendLoginAuditLog({
            action: 'LOGIN GAGAL',
            details: `Percobaan login gagal dengan kode: ${cleaned} (${errMsg})`,
            category: 'system',
            actor: `Tamu (${cleaned})`,
          });

          return { success: false, error: errMsg };
        }
      } catch (err: any) {
        const errMsg = err?.message || 'Gagal memverifikasi kode akses ke server.';
        setError(errMsg);

        sendLoginAuditLog({
          action: 'LOGIN GAGAL',
          details: `Error verifikasi login kode: ${cleaned} (${errMsg})`,
          category: 'system',
          actor: `Tamu (${cleaned})`,
        });

        return { success: false, error: errMsg };
      } finally {
        setIsValidating(false);
      }
    },
    []
  );

  /**
   * Secure logout notifying backend and clearing local state
   */
  const logout = useCallback(async (): Promise<void> => {
    setIsValidating(true);
    try {
      logoutUser();
    } finally {
      setSessionState(null);
      setError(null);
      setIsValidating(false);
    }
  }, []);

  /**
   * Explicitly set session
   */
  const setSession = useCallback((newSession: UserSession | null) => {
    setUserSession(newSession);
    setSessionState(newSession);
    if (!newSession) {
      setError(null);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const isAuthenticated = Boolean(session && session.code && session.code !== 'GUEST-ACCESS');
  const isAdmin = Boolean(session?.role === 'admin');
  const isUser = Boolean(session?.role === 'user');

  return {
    session,
    isAuthenticated,
    isAdmin,
    isUser,
    code: session?.code || '',
    role: session?.role || null,
    name: session?.name || '',
    email: session?.email || '',
    isLoading,
    isValidating,
    error,
    login,
    logout,
    refreshSession,
    validateBackendSession,
    setSession,
    clearError,
  };
}

export default useAuth;
