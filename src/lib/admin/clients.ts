import { db } from '../firebase';
import { collection, getDocs, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { adminFetch } from './adminApi';
import { addSpecificAccessCode, removeAccessCode } from '../auth';

export interface ClientItem {
  id: string;
  accessCode: string;
  name: string;
  email?: string;
  role: 'admin' | 'user';
  packageId: string;
  packageName?: string;
  price?: number;
  startDate: string;
  expiryDate: string;
  status: 'active' | 'expired' | 'suspended' | 'expiring_soon';
  allowedFeatures: string[];
  maxDailyTokens: number;
  usageCount: number;
  createdAt?: string;
  type?: string;
  whatsapp?: string;
  customFeatures?: string[];
  toolUsage?: any;
  lastLoginAt?: number;
}

export const LOCAL_STORAGE_CLIENTS_KEY = 'satset_clients_v2';

export const DEFAULT_CLIENTS: ClientItem[] = [
  {
    id: 'cli_001',
    accessCode: 'SATSET-882194',
    name: 'Rizky Ramadhan',
    whatsapp: '081234567890',
    email: 'rizky@gmail.com',
    packageId: 'bulanan',
    packageName: 'Akses Bulanan (VIP)',
    price: 149000,
    startDate: '2026-08-01T10:00:00.000Z',
    expiryDate: '2026-08-31T10:00:00.000Z',
    status: 'active',
    type: 'standard',
    role: 'user',
    allowedFeatures: [],
    maxDailyTokens: 50,
    usageCount: 0,
    lastLoginAt: Date.parse('2026-08-06T08:00:00.000Z'),
    toolUsage: { tiktokDownloader: 12, contentIdeas: 8, videoToPrompt: 15, photoPrompt: 6, frameExtractor: 4 },
    createdAt: '2026-08-01T10:00:00.000Z'
  },
  {
    id: 'cli_002',
    accessCode: 'SATSET-331209',
    name: 'Budi Santoso',
    whatsapp: '085711223344',
    email: 'budi.santoso@yahoo.com',
    packageId: 'mingguan',
    packageName: 'Akses Mingguan',
    price: 49000,
    startDate: '2026-08-02T12:00:00.000Z',
    expiryDate: '2026-08-09T12:00:00.000Z',
    status: 'expiring_soon',
    type: 'standard',
    role: 'user',
    allowedFeatures: [],
    maxDailyTokens: 50,
    usageCount: 0,
    lastLoginAt: Date.parse('2026-08-05T14:30:00.000Z'),
    toolUsage: { tiktokDownloader: 5, contentIdeas: 3, videoToPrompt: 4, photoPrompt: 2, frameExtractor: 1 },
    createdAt: '2026-08-02T12:00:00.000Z'
  }
];

export function cleanDataForFirestore<T extends Record<string, any>>(obj: T): T {
  const clean: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && value !== null) {
      clean[key] = value;
    }
  }
  return clean;
}

export function getClients(): ClientItem[] {
  if (typeof localStorage === 'undefined') return DEFAULT_CLIENTS;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_CLIENTS_KEY);
    if (!raw) {
      localStorage.setItem(LOCAL_STORAGE_CLIENTS_KEY, JSON.stringify(DEFAULT_CLIENTS));
      return DEFAULT_CLIENTS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return DEFAULT_CLIENTS;
  } catch (error) {
    return DEFAULT_CLIENTS;
  }
}

export const syncClientsAsync = async (): Promise<{ success: boolean; clients?: ClientItem[] }> => {
  try {
    let clients: ClientItem[] = [];

    // 1. Try Firestore
    if (db) {
      try {
        const snapshot = await getDocs(collection(db, 'clients'));
        if (!snapshot.empty) {
          clients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ClientItem));
        }
      } catch (fsErr) {
        console.warn('[Clients] Firestore sync read warning:', fsErr);
      }
    }

    // 2. Try Backend API if Firestore was empty
    if (clients.length === 0) {
      try {
        const res = await adminFetch<ClientItem[]>('/api/admin/clients');
        if (res.ok && Array.isArray(res.data) && res.data.length > 0) {
          clients = res.data;
        }
      } catch (apiErr) {
        console.warn('[Clients] Backend fetch warning:', apiErr);
      }
    }

    // 3. Fallback to localStorage or default
    if (clients.length === 0) {
      const cached = getClients();
      clients = cached.length > 0 ? cached : DEFAULT_CLIENTS;
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_CLIENTS_KEY, JSON.stringify(clients));
      window.dispatchEvent(new Event('satset_clients_updated'));
    }
    return { success: true, clients };
  } catch (e) {
    console.warn('Failed to sync clients from Firestore', e);
    return { success: false };
  }
};

export async function saveClientAsync(client: ClientItem): Promise<{ success: boolean; client: ClientItem; error?: string }> {
  try {
    const cleanClient = cleanDataForFirestore(client);

    // 1. Save to Firestore
    if (db) {
      try {
        await setDoc(doc(db, 'clients', cleanClient.id), cleanClient, { merge: true });
      } catch (fsErr) {
        console.warn('[Clients] Firestore setDoc warning:', fsErr);
      }
    }

    // 2. Sync to Backend Server API
    const current = getClients();
    const index = current.findIndex(c => c.id === cleanClient.id);
    let updated = [...current];
    if (index >= 0) updated[index] = cleanClient; else updated = [cleanClient, ...updated];

    try {
      await adminFetch('/api/admin/clients', {
        method: 'POST',
        body: JSON.stringify({ clients: updated }),
      });
    } catch (apiErr) {
      console.warn('[Clients] Backend API sync warning:', apiErr);
    }

    // 3. Register Access Code
    if (cleanClient.accessCode) {
      addSpecificAccessCode(cleanClient.accessCode, `Client ${cleanClient.name || 'VIP'} (${cleanClient.packageName || 'Satset'})`);
    }

    // 4. Update Local Storage
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_CLIENTS_KEY, JSON.stringify(updated));
      window.dispatchEvent(new Event('satset_clients_updated'));
    }

    return { success: true, client: cleanClient };
  } catch (e: any) {
    console.error('[Clients] Error in saveClientAsync:', e);
    return { success: false, client, error: e?.message || 'Gagal menyimpan klien' };
  }
}

export async function deleteClientAsync(id: string): Promise<{ success: boolean }> {
  try {
    if (db) {
      await deleteDoc(doc(db, 'clients', id)).catch(() => {});
    }

    const current = getClients();
    const target = current.find(c => c.id === id);
    const updated = current.filter(c => c.id !== id);

    if (target?.accessCode) {
      removeAccessCode(target.accessCode);
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_CLIENTS_KEY, JSON.stringify(updated));
      window.dispatchEvent(new Event('satset_clients_updated'));
    }

    try {
      await adminFetch('/api/admin/clients', {
        method: 'POST',
        body: JSON.stringify({ clients: updated }),
      });
    } catch (e) {}

    return { success: true };
  } catch (e) {
    return { success: false };
  }
}

export function calculateClientStatus(expiryDateStr: string, currentStatus?: string): 'active' | 'expiring_soon' | 'expired' | 'suspended' {
  if (currentStatus === 'suspended') return 'suspended';
  const expiry = new Date(expiryDateStr);
  const now = new Date();
  const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 3600 * 24));
  if (diffDays <= 0) return 'expired';
  if (diffDays <= 7) return 'expiring_soon';
  return 'active';
}

export function saveClient(client: ClientItem): ClientItem[] {
  const cleanClient = cleanDataForFirestore(client);
  const current = getClients();
  const index = current.findIndex(c => c.id === cleanClient.id);
  let updated = [...current];
  if (index >= 0) updated[index] = cleanClient; else updated = [cleanClient, ...updated];
  
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(LOCAL_STORAGE_CLIENTS_KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event('satset_clients_updated'));
  }

  saveClientAsync(cleanClient).catch(err => console.warn('[saveClient Async Warning]', err));
  return updated;
}

export function deleteClient(id: string): ClientItem[] {
  const current = getClients();
  const updated = current.filter(c => c.id !== id);
  
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(LOCAL_STORAGE_CLIENTS_KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event('satset_clients_updated'));
  }

  deleteClientAsync(id).catch(err => console.warn('[deleteClient Async Warning]', err));
  return updated;
}

export function updateClientStatus(id: string, newStatus: 'active' | 'expiring_soon' | 'expired' | 'suspended'): ClientItem[] {
  const current = getClients();
  const index = current.findIndex(c => c.id === id);
  if (index >= 0) {
    const updated = [...current];
    updated[index] = { ...updated[index], status: newStatus };
    saveClient(updated[index]);
    return updated;
  }
  return current;
}

export function extendClientExpiry(id: string, daysToAdd: number): ClientItem[] {
  const current = getClients();
  const index = current.findIndex(c => c.id === id);
  if (index >= 0) {
    const updated = [...current];
    const client = { ...updated[index] };
    const expiry = new Date(client.expiryDate || new Date().toISOString());
    expiry.setDate(expiry.getDate() + daysToAdd);
    client.expiryDate = expiry.toISOString();
    client.status = calculateClientStatus(client.expiryDate, client.status);
    saveClient(client);
    return updated;
  }
  return current;
}

export function updateClientPackage(
  id: string,
  packageId: string,
  packageName: string,
  durationDays: number,
  price: number,
  maxDailyTokens: number = 50,
  allowedFeatures: string[] = []
): ClientItem[] {
  const current = getClients();
  const index = current.findIndex(c => c.id === id);
  if (index >= 0) {
    const updated = [...current];
    const client = { ...updated[index] };
    client.packageId = packageId;
    client.packageName = packageName;
    client.price = price;
    client.maxDailyTokens = maxDailyTokens;
    client.allowedFeatures = allowedFeatures;
    client.startDate = new Date().toISOString();
    
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + durationDays);
    client.expiryDate = expiry.toISOString();
    client.status = 'active';
    
    saveClient(client);
    return updated;
  }
  return current;
}

let unsubscribeClients: (() => void) | null = null;

export function subscribeToClients() {
  if (unsubscribeClients) return;
  if (!db) return;
  try {
    const clientsRef = collection(db, 'clients');
    unsubscribeClients = onSnapshot(clientsRef, (snapshot) => {
      if (!snapshot.empty) {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ClientItem));
        if (typeof localStorage !== 'undefined' && data.length > 0) {
          localStorage.setItem(LOCAL_STORAGE_CLIENTS_KEY, JSON.stringify(data));
          window.dispatchEvent(new Event('satset_clients_updated'));
        }
      }
    }, (error) => {
      console.warn('[Clients] Firestore subscription notice:', error);
    });
  } catch (e) {
    console.warn('[Clients] Error setting up onSnapshot:', e);
  }
}

if (typeof window !== 'undefined') {
  setTimeout(() => subscribeToClients(), 1500);
}
