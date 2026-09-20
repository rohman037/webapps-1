import { getClients } from './admin/clients';


import { loginWithGoogle, logoutGoogle } from './firebase';

export async function loginWithGoogleAdmin() {
  const result = await loginWithGoogle();
  if (result.success && result.user) {
    if (result.user.email === 'davidrohman037@gmail.com') {
      const session = {
        code: 'ADMIN_DAVID',
        role: 'admin' as const,
        email: result.user.email,
        name: result.user.displayName || 'David Rohman',
        loginTime: Date.now()
      };
      setUserSession(session);
      return { success: true, session };
    }
  }
  return { success: false, error: 'Bukan admin atau login gagal' };
}

export interface UserSession {
  code: string;
  role: 'admin' | 'user';
  name?: string;
  email?: string;
  loginTime: number;
}

export interface AccessCodeItem {
  code: string;
  note: string;
  createdAt: number;
}

const STORAGE_SESSION_KEY = 'satset_user_session';
const STORAGE_CODES_KEY = 'satset_valid_access_codes';

// Default user access codes
const DEFAULT_ACCESS_CODES: AccessCodeItem[] = [
  { code: 'SATSET-ULTRA-VIP', note: 'Paket Ultra VIP Lifetime', createdAt: Date.now() },
  { code: 'PROMPT-SATSET-888', note: 'Akses Tester VIP', createdAt: Date.now() },
];

export const MASTER_ADMIN_KEY = process.env.ADMIN_ACCESS_CODE || '';
export const MASTER_ADMIN_EMAIL = 'davidrohman037@gmail.com';
export const MASTER_ADMIN_EMAILS = ['davidrohman037@gmail.com', 'ahmaddavid0906@gmail.com', 'globallensn@gmail.com'];

export function getAccessCodes(): AccessCodeItem[] {
  if (typeof localStorage === 'undefined') {
    return DEFAULT_ACCESS_CODES;
  }
  try {
    const raw = localStorage.getItem(STORAGE_CODES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    // console.error('Gagal membaca kode akses dari localStorage', err);
  }
  // Save default codes if first time
  saveAccessCodes(DEFAULT_ACCESS_CODES);
  return DEFAULT_ACCESS_CODES;
}

export function saveAccessCodes(codes: AccessCodeItem[]) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_CODES_KEY, JSON.stringify(codes));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('satset_access_codes_updated'));
    }
  } catch (err) {
    // console.error('Gagal menyimpan kode akses ke localStorage', err);
  }
}

export function addSpecificAccessCode(code: string, note: string = 'Pembelian Paket Satset'): AccessCodeItem {
  const current = getAccessCodes();
  const existing = current.find(c => c.code.toUpperCase() === code.toUpperCase());
  if (existing) return existing;
  
  const newItem: AccessCodeItem = {
    code: code.toUpperCase(),
    note,
    createdAt: Date.now(),
  };
  const updated = [newItem, ...current];
  saveAccessCodes(updated);

  // Sync to backend
  fetch('/api/access-codes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: newItem.code, note: newItem.note }),
  }).catch(() => {});

  return newItem;
}

export function generateNewAccessCode(note: string = 'Akses Baru'): AccessCodeItem {
  const randomNum = Math.floor(100000 + Math.random() * 900000);
  const newCode = `SATSET-VIP-${randomNum}`;
  return addSpecificAccessCode(newCode, note);
}

export function removeAccessCode(codeToRemove: string) {
  const current = getAccessCodes();
  const updated = current.filter((item) => item.code.toUpperCase() !== codeToRemove.toUpperCase());
  saveAccessCodes(updated);

  // Sync to backend
  fetch('/api/access-codes/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: codeToRemove }),
  }).catch(() => {});
}

export function verifyAccessCode(input: string): { success: boolean; role?: 'admin' | 'user'; email?: string; code?: string; name?: string; error?: string } {
  const cleaned = input.trim().toUpperCase();
  if (!cleaned) {
    return { success: false, error: 'Masukkan Kode Akses Anda.' };
  }

  // Master Admin Key or Email
  const isAdminKeyMatch = Boolean(MASTER_ADMIN_KEY && cleaned === MASTER_ADMIN_KEY.toUpperCase());
  const isAdminEmailMatch = MASTER_ADMIN_EMAILS.some(e => cleaned === e.toUpperCase());

  if (isAdminKeyMatch || isAdminEmailMatch) {
    const adminEmail = cleaned.includes('@') ? cleaned.toLowerCase() : MASTER_ADMIN_EMAIL;
    return {
      success: true,
      role: 'admin',
      name: 'Administrator',
      email: adminEmail,
      code: MASTER_ADMIN_KEY || adminEmail,
    };
  }

  // Lookup in client list database
  const clients = getClients();
  const foundClient = clients.find((c) => c.accessCode && c.accessCode.toUpperCase() === cleaned);

  if (foundClient) {
    const clientStatus = foundClient.status;
    if (clientStatus === 'suspended') {
      return {
        success: false,
        error: 'Akses Anda saat ini ditangguhkan. Silakan hubungi administrator.',
      };
    }
    if (clientStatus === 'expired') {
      return {
        success: false,
        error: 'Masa aktif kode akses telah kedaluwarsa. Silakan perpanjang paket Anda.',
      };
    }
    return {
      success: true,
      role: 'user',
      code: foundClient.accessCode,
      name: foundClient.name || 'Klien Satset',
      email: foundClient.email,
    };
  }

  // Check against valid user codes
  const validCodes = getAccessCodes();
  const matched = validCodes.find((item) => item.code && item.code.toUpperCase() === cleaned);

  if (matched) {
    return {
      success: true,
      role: 'user',
      code: matched.code,
      name: matched.note || 'Klien Satset',
    };
  }

  return {
    success: false,
    error: 'Kode Akses tidak terdaftar atau telah kedaluwarsa. Silakan konsultasi via WhatsApp.',
  };
}

export async function verifyAccessCodeAsync(input: string) {
  if (input === 'ADMIN_DAVID') return { success: true, role: 'admin', email: 'davidrohman037@gmail.com', name: 'David Rohman', code: 'ADMIN_DAVID' };
  try {
    const fingerprint = typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}_${navigator.language}` : '';
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Web Browser';

    const response = await fetch('/api/verify-access-code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-fingerprint': fingerprint,
      },
      body: JSON.stringify({
        accessCode: input,
        fingerprint,
        userAgent,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data && typeof data.success === 'boolean') {
        // Hydrate caches on background
        fetch('/api/access-codes').then(r => r.ok && r.json()).then(codes => {
          if (Array.isArray(codes) && typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_CODES_KEY, JSON.stringify(codes));
        }).catch(() => {});
        fetch('/api/admin/clients').then(r => r.ok && r.json()).then(clients => {
          if (Array.isArray(clients) && typeof localStorage !== 'undefined') localStorage.setItem('satset_clients_data', JSON.stringify(clients));
        }).catch(() => {});

        return data;
      }
    }
  } catch (e) {
    console.warn('[verifyAccessCodeAsync] Server verification error, falling back to local sync check:', e);
  }

  return verifyAccessCode(input);
}

export function getUserSession(): UserSession | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  try {
    const raw = localStorage.getItem(STORAGE_SESSION_KEY);
    if (raw) {
      const session: UserSession = JSON.parse(raw);
      if (session && session.code) {
        // Dynamic client name lookup
        const clients = getClients();
        const foundClient = clients.find((c) => c.accessCode.toUpperCase() === session.code.toUpperCase());
        if (foundClient && foundClient.name) {
          session.name = foundClient.name;
        } else if (session.role === 'admin') {
          session.name = session.name || 'Administrator';
        } else if (!session.name) {
          session.name = 'Klien Satset';
        }
        return session;
      }
    }
  } catch (err) {
    // console.error('Gagal membaca sesi dari localStorage', err);
  }
  return null;
}

export function setUserSession(session: UserSession | null) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (!session) {
      localStorage.removeItem(STORAGE_SESSION_KEY);
    } else {
      localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('satset_auth_updated'));
      window.dispatchEvent(new Event('satset_session_updated'));
    }
  } catch (err) {
    // console.error('Gagal menyimpan sesi ke localStorage', err);
  }
}

export async function sendLoginAuditLog(payload: {
  action: string;
  details: string;
  category?: string;
  actor?: string;
}) {
  try {
    await fetch('/api/admin/audit-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: payload.action,
        details: payload.details,
        category: payload.category || 'system',
        adminName: payload.actor || 'System',
        actor: payload.actor || 'System',
      }),
    });
  } catch (e) {
    console.error('Gagal kirim audit log:', e);
  }
}

export function logoutUser() {
  const current = getUserSession();
  if (current) {
    sendLoginAuditLog({
      action: 'LOGOUT SESI',
      details: `Pengguna resmi mengakhiri sesi login (${current.name || 'User'} • ${current.code || 'Sesi'})`,
      category: current.role === 'admin' ? 'system' : 'client',
      actor: current.name ? `${current.name} (${current.code || 'Sesi'})` : (current.code || 'Pengguna'),
    });

    if (typeof fetch !== 'undefined') {
      try {
        fetch('/api/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accessCode: current.code,
            name: current.name,
            role: current.role,
          }),
        }).catch(() => {});
      } catch (e) {}
    }
  }
  setUserSession(null);
}
