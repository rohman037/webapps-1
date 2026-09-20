import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, getDocs, deleteDoc, collection as firestoreCollection } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import firebaseConfig from '../../config/firebase-applet-config.json';
import { FIRESTORE_COLLECTIONS } from './schema';

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || undefined);

// Non-blocking debounced disk cache backup for high resilience & instant fallback
const CACHE_FILE = path.join(process.cwd(), 'storage', 'local_db_store.json');
let localStore: Record<string, Record<string, any>> = {};
let isDiskStoreDirty = false;
let diskStoreTimer: NodeJS.Timeout | null = null;

try {
  if (fs.existsSync(CACHE_FILE)) {
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    localStore = JSON.parse(raw);
  }
} catch (e) {
  localStore = {};
}

const persistLocalStore = (forceImmediate = false) => {
  isDiskStoreDirty = true;
  if (forceImmediate) {
    if (diskStoreTimer) {
      clearTimeout(diskStoreTimer);
      diskStoreTimer = null;
    }
    try {
      fs.writeFileSync(CACHE_FILE, JSON.stringify(localStore, null, 2), 'utf8');
      isDiskStoreDirty = false;
    } catch (e) {}
    return;
  }

  if (!diskStoreTimer) {
    diskStoreTimer = setTimeout(() => {
      diskStoreTimer = null;
      if (isDiskStoreDirty) {
        fs.promises.writeFile(CACHE_FILE, JSON.stringify(localStore, null, 2), 'utf8')
          .then(() => { isDiskStoreDirty = false; })
          .catch(() => {});
      }
    }, 1500); // 1.5s non-blocking debounce
  }
};

const safeGet = async (colName: string): Promise<any[]> => {
  try {
    const colRef = firestoreCollection(db, colName);
    const snap = await getDocs(colRef);
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    // Update local cache
    if (!localStore[colName]) localStore[colName] = {};
    for (const item of items) {
      if (item && item.id) {
        localStore[colName][item.id] = item;
      }
    }
    persistLocalStore();
    return items;
  } catch (e: any) {
    console.warn(`[dbService] Fetching from Firestore failed for '${colName}', using local store fallback:`, e?.message || e);
    const colData = localStore[colName] || {};
    return Object.values(colData);
  }
};

const safeGetOne = async (colName: string, docId: string): Promise<any | null> => {
  try {
    const docRef = doc(db, colName, docId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = { id: snap.id, ...snap.data() };
      if (!localStore[colName]) localStore[colName] = {};
      localStore[colName][docId] = data;
      persistLocalStore();
      return data;
    }
  } catch (e: any) {
    console.warn(`[dbService] Fetching one '${colName}/${docId}' from Firestore failed, using local store fallback:`, e?.message || e);
  }
  return localStore[colName]?.[docId] || null;
};

const safeSave = async (colName: string, item: any): Promise<any> => {
  try {
    if (!item) return item;
    if (!item.id) item.id = 'doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    
    // Save to local cache first
    if (!localStore[colName]) localStore[colName] = {};
    localStore[colName][item.id] = { ...localStore[colName][item.id], ...item };
    persistLocalStore();

    // Persist to Firestore
    const docRef = doc(db, colName, String(item.id));
    await setDoc(docRef, item, { merge: true });
    return item;
  } catch (e: any) {
    console.warn(`[dbService] Saving '${colName}' to Firestore failed, persisted to local store:`, e?.message || e);
    return item;
  }
};

const safeDelete = async (colName: string, id: string): Promise<void> => {
  try {
    if (localStore[colName] && localStore[colName][id]) {
      delete localStore[colName][id];
      persistLocalStore();
    }
    const docRef = doc(db, colName, String(id));
    await deleteDoc(docRef);
  } catch (e: any) {
    console.warn(`[dbService] Deleting '${colName}/${id}' from Firestore failed:`, e?.message || e);
  }
};

export const testFirestoreHealth = async () => {
  try {
    const healthDoc = doc(db, '_healthCheck', 'ping');
    await setDoc(healthDoc, { timestamp: Date.now() });
    return { ok: true, status: 'CONNECTED' };
  } catch (e: any) {
    return { ok: true, status: 'STANDBY_LOCAL', detail: e?.message };
  }
};

export const initDbSeed = async () => {
  try {
    const pkgCol = firestoreCollection(db, FIRESTORE_COLLECTIONS.PACKAGES || 'packages');
    const pkgSnap = await getDocs(pkgCol);
    if (pkgSnap.empty) {
      console.log('[DB Seed] Seeding initial subscription packages to Firestore...');
      const packagesData = [
        {
          id: 'mingguan',
          name: 'Akses Mingguan',
          tagline: 'Uji coba semua fitur AI Creator selama 7 hari penuh.',
          price: 49000,
          durationDays: 7,
          features: [
            'Akses 5 Tool AI Satset',
            'Generator Prompt Video 8K',
            'Generator Prompt Foto Ultra HD',
            'Video Frame Extractor',
            'TikTok Downloader No Watermark',
            'Bypass Kuota & Anti Limit Level 1'
          ],
          isPopular: false,
          isActive: true,
          badgeLabel: 'Hemat',
          targetCategory: 'public',
          updatedAt: new Date().toISOString()
        },
        {
          id: 'bulanan',
          name: 'Akses Bulanan (VIP)',
          tagline: 'Pilihan favorit kreator konten & agensi digital.',
          price: 149000,
          durationDays: 30,
          features: [
            'Semua Fitur Paket Mingguan',
            'Prioritas Server Kecepatan Tinggi',
            'Bypass Kuota VIP & Anti Limit Max',
            'Format Export JSON & TXT',
            'Masa Aktif 30 Hari Penuh',
            'Dukungan Admin Fast Response'
          ],
          isPopular: true,
          isActive: true,
          badgeLabel: 'Paling Populer',
          targetCategory: 'public',
          updatedAt: new Date().toISOString()
        },
        {
          id: 'lifetime',
          name: 'Ultra VIP Lifetime',
          tagline: 'Akses seumur hidup tanpa perpanjangan biaya bulanan.',
          price: 999000,
          durationDays: 36500,
          features: [
            'Akses Selamanya Tanpa Batas',
            'Semua Fitur VIP + Update Masa Depan',
            'Server Dedicated AI Engine',
            'Grup Komunitas Exclusive VIP',
            'Lisensi Komersial Konten Kreator'
          ],
          isPopular: false,
          isActive: true,
          badgeLabel: 'Sultan VIP',
          targetCategory: 'public',
          updatedAt: new Date().toISOString()
        },
        {
          id: 'upgrade_vip',
          name: 'Perpanjang / Upgrade Member VIP',
          tagline: 'Penawaran khusus member terdaftar untuk perpanjangan atau upgrade akun.',
          price: 99000,
          durationDays: 30,
          features: [
            'Harga Khusus Perpanjangan Member',
            'Semua Fitur VIP + Priority Server',
            'Bypass Kuota & Anti Limit Max',
            'Akses Bebas Pemblokiran',
            'Dukungan Langsung via Admin VIP'
          ],
          isPopular: false,
          isActive: true,
          badgeLabel: 'Khusus Member',
          targetCategory: 'member',
          updatedAt: new Date().toISOString()
        }
      ];
      for (const p of packagesData) {
        await setDoc(doc(db, FIRESTORE_COLLECTIONS.PACKAGES || 'packages', p.id), p);
      }
      console.log('[DB Seed] Packages successfully seeded to Firestore.');
    }

    const clientCol = firestoreCollection(db, FIRESTORE_COLLECTIONS.CLIENTS || 'clients');
    const clientSnap = await getDocs(clientCol);
    if (clientSnap.empty) {
      console.log('[DB Seed] Seeding initial clients to Firestore...');
      const defaultClients = [
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
      for (const c of defaultClients) {
        await setDoc(doc(db, FIRESTORE_COLLECTIONS.CLIENTS || 'clients', c.id), c);
      }
      console.log('[DB Seed] Clients successfully seeded to Firestore.');
    }
  } catch (err) {
    console.warn('[DB Seed] Warning during seeding:', err);
  }
};

export const dbGetClients = async () => safeGet(FIRESTORE_COLLECTIONS.CLIENTS || 'clients');
export const dbGetPackages = async () => safeGet(FIRESTORE_COLLECTIONS.PACKAGES || 'packages');
export const dbGetTransactions = async () => safeGet(FIRESTORE_COLLECTIONS.TRANSACTIONS || 'transactions');
export const dbGetAuditLogs = async () => safeGet(FIRESTORE_COLLECTIONS.AUDIT_LOGS || 'auditLogs');
export const dbGetTrackingEvents = async () => safeGet(FIRESTORE_COLLECTIONS.TRACKING_EVENTS || 'trackingEvents');
export const dbGetLearningQueue = async () => safeGet(FIRESTORE_COLLECTIONS.LEARNING_QUEUE || 'learningQueue');
export const dbGetAccessCodes = async () => safeGet(FIRESTORE_COLLECTIONS.ACCESS_CODES || 'accessCodes');
export const dbGetAiAgents = async () => safeGet(FIRESTORE_COLLECTIONS.AI_AGENTS || 'aiAgents');
export const dbGetCategoryTaxonomy = async () => safeGet(FIRESTORE_COLLECTIONS.CATEGORY_TAXONOMY || 'categoryTaxonomy');

export const dbSaveCategoryTaxonomyItem = async (item: any) => {
  if (Array.isArray(item)) {
    for (const i of item) await safeSave(FIRESTORE_COLLECTIONS.CATEGORY_TAXONOMY || 'categoryTaxonomy', i);
  } else {
    await safeSave(FIRESTORE_COLLECTIONS.CATEGORY_TAXONOMY || 'categoryTaxonomy', item);
  }
};

export const dbGetCategoryProposals = async () => safeGet(FIRESTORE_COLLECTIONS.CATEGORY_TAXONOMY_PROPOSALS || 'categoryTaxonomyProposals');
export const dbSaveCategoryProposal = async (item: any) => {
  if (Array.isArray(item)) {
    for (const i of item) await safeSave(FIRESTORE_COLLECTIONS.CATEGORY_TAXONOMY_PROPOSALS || 'categoryTaxonomyProposals', i);
  } else {
    await safeSave(FIRESTORE_COLLECTIONS.CATEGORY_TAXONOMY_PROPOSALS || 'categoryTaxonomyProposals', item);
  }
};

export const dbGetPendingSchemaChanges = async () => safeGet(FIRESTORE_COLLECTIONS.PENDING_SCHEMA_CHANGES || 'pendingSchemaChanges');
export const dbSavePendingSchemaChange = async (item: any) => {
  if (Array.isArray(item)) {
    for (const i of item) await safeSave(FIRESTORE_COLLECTIONS.PENDING_SCHEMA_CHANGES || 'pendingSchemaChanges', i);
  } else {
    await safeSave(FIRESTORE_COLLECTIONS.PENDING_SCHEMA_CHANGES || 'pendingSchemaChanges', item);
  }
};

export const dbGetHistory = async () => safeGet(FIRESTORE_COLLECTIONS.HISTORY || 'history');
export const dbSaveHistoryItem = async (item: any) => {
  if (Array.isArray(item)) {
    for (const i of item) await safeSave(FIRESTORE_COLLECTIONS.HISTORY || 'history', i);
  } else {
    await safeSave(FIRESTORE_COLLECTIONS.HISTORY || 'history', item);
  }
};
export const dbDeleteHistoryItem = async (id: string) => safeDelete(FIRESTORE_COLLECTIONS.HISTORY || 'history', id);

export const dbGetBannedDevices = async () => safeGet(FIRESTORE_COLLECTIONS.BANNED_DEVICES || 'bannedDevices');
export const dbSaveBannedDevice = async (item: any) => {
  if (Array.isArray(item)) {
    for (const i of item) await safeSave(FIRESTORE_COLLECTIONS.BANNED_DEVICES || 'bannedDevices', i);
  } else {
    await safeSave(FIRESTORE_COLLECTIONS.BANNED_DEVICES || 'bannedDevices', item);
  }
};
export const dbDeleteBannedDevice = async (id: string) => safeDelete(FIRESTORE_COLLECTIONS.BANNED_DEVICES || 'bannedDevices', id);

export const dbSaveClient = async (item: any) => {
  if (Array.isArray(item)) {
    for (const i of item) await safeSave(FIRESTORE_COLLECTIONS.CLIENTS || 'clients', i);
  } else {
    await safeSave(FIRESTORE_COLLECTIONS.CLIENTS || 'clients', item);
  }
};
export const dbDeleteClient = async (id: string) => safeDelete(FIRESTORE_COLLECTIONS.CLIENTS || 'clients', id);

export const dbSavePackage = async (item: any) => {
  if (Array.isArray(item)) {
    for (const i of item) await safeSave(FIRESTORE_COLLECTIONS.PACKAGES || 'packages', i);
  } else {
    await safeSave(FIRESTORE_COLLECTIONS.PACKAGES || 'packages', item);
  }
};
export const dbDeletePackage = async (id: string) => safeDelete(FIRESTORE_COLLECTIONS.PACKAGES || 'packages', id);

export const dbSaveTransaction = async (item: any) => {
  if (Array.isArray(item)) {
    for (const i of item) await safeSave(FIRESTORE_COLLECTIONS.TRANSACTIONS || 'transactions', i);
  } else {
    await safeSave(FIRESTORE_COLLECTIONS.TRANSACTIONS || 'transactions', item);
  }
};
export const dbDeleteTransaction = async (id: string) => safeDelete(FIRESTORE_COLLECTIONS.TRANSACTIONS || 'transactions', id);

export const dbSaveAiAgent = async (item: any) => {
  if (Array.isArray(item)) {
    for (const i of item) await safeSave(FIRESTORE_COLLECTIONS.AI_AGENTS || 'aiAgents', i);
  } else {
    await safeSave(FIRESTORE_COLLECTIONS.AI_AGENTS || 'aiAgents', item);
  }
};
export const dbDeleteAiAgent = async (id: string) => safeDelete(FIRESTORE_COLLECTIONS.AI_AGENTS || 'aiAgents', id);

export const dbGetApiKeys = async (): Promise<any[]> => {
  try {
    const colName = FIRESTORE_COLLECTIONS.API_KEYS || 'apiKeys';
    const colRef = firestoreCollection(db, colName);
    const snap = await getDocs(colRef);
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (items.length > 0) {
      if (!localStore[colName]) localStore[colName] = {};
      for (const item of items) {
        if (item && item.id) {
          localStore[colName][item.id] = item;
        }
      }
      persistLocalStore(true);
      return items;
    }

    // If Firestore is empty, return localStore if populated
    const localKeys = Object.values(localStore[colName] || {});
    if (localKeys.length > 0) {
      return localKeys;
    }

    return items;
  } catch (e: any) {
    console.warn(`[dbService] Fetching apiKeys failed, using local store:`, e?.message || e);
    const colName = FIRESTORE_COLLECTIONS.API_KEYS || 'apiKeys';
    return Object.values(localStore[colName] || {});
  }
};

export const dbSaveApiKeys = async (item: any) => {
  const colName = FIRESTORE_COLLECTIONS.API_KEYS || 'apiKeys';
  if (!localStore[colName]) localStore[colName] = {};

  if (Array.isArray(item)) {
    // Reset localStore for apiKeys to match the exact list being saved
    const newStore: Record<string, any> = {};
    for (const i of item) {
      if (i && (i.key || i.id)) {
        const id = String(i.id || `key_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);
        const cleanItem = { ...i, id };
        newStore[id] = cleanItem;
        
        // Persist each to Firestore asynchronously
        try {
          const docRef = doc(db, colName, id);
          await setDoc(docRef, cleanItem, { merge: true });
        } catch (err: any) {
          console.warn(`[dbService] Firestore setDoc error for key ${id}:`, err?.message || err);
        }
      }
    }
    localStore[colName] = newStore;
    persistLocalStore(true);
  } else if (item && (item.key || item.id)) {
    const id = String(item.id || `key_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);
    const cleanItem = { ...item, id };
    localStore[colName][id] = cleanItem;
    persistLocalStore(true);
    try {
      const docRef = doc(db, colName, id);
      await setDoc(docRef, cleanItem, { merge: true });
    } catch (err: any) {
      console.warn(`[dbService] Firestore setDoc error for single key ${id}:`, err?.message || err);
    }
  }
};

export const dbDeleteApiKey = async (id: string) => {
  const colName = FIRESTORE_COLLECTIONS.API_KEYS || 'apiKeys';
  if (localStore[colName] && localStore[colName][id]) {
    delete localStore[colName][id];
    persistLocalStore(true);
  }
  try {
    const docRef = doc(db, colName, String(id));
    await deleteDoc(docRef);
  } catch (e: any) {
    console.warn(`[dbService] Deleting apiKey '${id}' from Firestore notice:`, e?.message || e);
  }
};

export const dbAddApiKeyLog = async (item: any) => safeSave(FIRESTORE_COLLECTIONS.API_KEY_LOGS || 'apiKeyUsageLogs', item);
export const dbAddAuditLog = async (item: any) => safeSave(FIRESTORE_COLLECTIONS.AUDIT_LOGS || 'auditLogs', item);

export const dbSaveAccessCode = async (item: any) => {
  if (Array.isArray(item)) {
    for (const i of item) await safeSave(FIRESTORE_COLLECTIONS.ACCESS_CODES || 'accessCodes', i);
  } else {
    await safeSave(FIRESTORE_COLLECTIONS.ACCESS_CODES || 'accessCodes', item);
  }
};
export const dbDeleteAccessCode = async (id: string) => safeDelete(FIRESTORE_COLLECTIONS.ACCESS_CODES || 'accessCodes', id);

export const dbGetApiKeyLogs = async () => safeGet(FIRESTORE_COLLECTIONS.API_KEY_LOGS || 'apiKeyUsageLogs');
export const dbSaveApiKeyLogs = async (item: any) => {
  if (Array.isArray(item)) {
    for (const i of item) await safeSave(FIRESTORE_COLLECTIONS.API_KEY_LOGS || 'apiKeyUsageLogs', i);
  } else {
    await safeSave(FIRESTORE_COLLECTIONS.API_KEY_LOGS || 'apiKeyUsageLogs', item);
  }
};

export const dbAddTrackingEvent = async (item: any) => safeSave(FIRESTORE_COLLECTIONS.TRACKING_EVENTS || 'trackingEvents', item);

export const dbSaveLearningQueueItem = async (item: any) => {
  if (Array.isArray(item)) {
    for (const i of item) await safeSave(FIRESTORE_COLLECTIONS.LEARNING_QUEUE || 'learningQueue', i);
  } else {
    await safeSave(FIRESTORE_COLLECTIONS.LEARNING_QUEUE || 'learningQueue', item);
  }
};

export const dbGetSystemMemory = async (): Promise<any> => (await safeGetOne(FIRESTORE_COLLECTIONS.CONFIGS || 'configs', 'systemMemory')) || {};
export const dbSaveSystemMemory = async (data: any) => safeSave(FIRESTORE_COLLECTIONS.CONFIGS || 'configs', { id: 'systemMemory', ...data });

export const dbGetQrisConfig = async (): Promise<any> => (await safeGetOne(FIRESTORE_COLLECTIONS.CONFIGS || 'configs', 'qris')) || {};
export const dbSaveQrisConfig = async (data: any) => safeSave(FIRESTORE_COLLECTIONS.CONFIGS || 'configs', { id: 'qris', ...data });

export const dbGetContactSettings = async (): Promise<any> => (await safeGetOne(FIRESTORE_COLLECTIONS.CONFIGS || 'configs', 'contact')) || {};
export const dbSaveContactSettings = async (data: any) => safeSave(FIRESTORE_COLLECTIONS.CONFIGS || 'configs', { id: 'contact', ...data });

export const dbGetGrowthState = async (): Promise<any> => (await safeGetOne(FIRESTORE_COLLECTIONS.CONFIGS || 'configs', 'growthState')) || {};
export const dbSaveGrowthState = async (data: any) => safeSave(FIRESTORE_COLLECTIONS.CONFIGS || 'configs', { id: 'growthState', ...data });

export const dbGetActiveGenerations = async (): Promise<any> => (await safeGetOne(FIRESTORE_COLLECTIONS.CONFIGS || 'configs', 'activeGenerations')) || {};
export const dbSaveActiveGenerations = async (data: any) => safeSave(FIRESTORE_COLLECTIONS.CONFIGS || 'configs', { id: 'activeGenerations', ...data });

export const dbGetModelPriorities = async (): Promise<any> => (await safeGetOne(FIRESTORE_COLLECTIONS.CONFIGS || 'configs', 'modelPriorities')) || null;
export const dbSaveModelPriorities = async (data: any) => safeSave(FIRESTORE_COLLECTIONS.CONFIGS || 'configs', { id: 'modelPriorities', ...data });

