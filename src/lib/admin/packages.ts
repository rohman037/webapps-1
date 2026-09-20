import { getUserSession } from '../auth';
import { collection, doc, setDoc, getDocs, onSnapshot, writeBatch } from 'firebase/firestore';
import { db, auth } from '../firebase';


export interface PackageItem {
  id: string;
  name: string;
  tagline?: string;
  price: number;
  durationDays: number;
  features: string[];
  isPopular?: boolean;
  isActive: boolean;
  badgeLabel?: string;
  targetCategory?: 'public' | 'member';
  updatedAt?: string;
}

const LOCAL_STORAGE_PACKAGES_KEY = 'satset_packages_data';

export const DEFAULT_PACKAGES: PackageItem[] = [
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
    targetCategory: 'public'
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
    targetCategory: 'public'
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
    targetCategory: 'public'
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
    targetCategory: 'member'
  }
];

export function getPackages(): PackageItem[] {
  if (typeof localStorage === 'undefined') {
    return DEFAULT_PACKAGES;
  }
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_PACKAGES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const hasMemberPkg = parsed.some((p: PackageItem) => p.targetCategory === 'member');
        if (!hasMemberPkg) {
          const defaultMember = DEFAULT_PACKAGES.filter((p) => p.targetCategory === 'member');
          const merged = [...parsed, ...defaultMember];
          try {
            localStorage.setItem(LOCAL_STORAGE_PACKAGES_KEY, JSON.stringify(merged));
          } catch (e) {}
          return merged;
        }
        return parsed;
      }
    }
  } catch (e) {
    // console.warn('[Packages Lib] Error reading localStorage packages:', e);
  }

  try {
    localStorage.setItem(LOCAL_STORAGE_PACKAGES_KEY, JSON.stringify(DEFAULT_PACKAGES));
  } catch (e) {}

  return DEFAULT_PACKAGES;
}

export async function savePackagesAsync(packages: PackageItem[], retries = 3): Promise<{ success: boolean; error?: string }> {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_PACKAGES_KEY, JSON.stringify(packages));
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('satset_packages_updated'));
    }
  } catch (e) {
    console.warn('[Packages Lib] Error saving to localStorage:', e);
  }

  try {
    const batch = writeBatch(db);
    packages.forEach(pkg => {
      const docRef = doc(db, 'packages', pkg.id);
      batch.set(docRef, pkg);
    });
    // Also we might want to delete removed packages, but simple batch set is enough for now 
    // to sync the current packages (or the frontend just overrides whatever is there).
    await batch.commit();
    return { success: true };
  } catch (err: any) {
    console.warn('[savePackagesAsync] Error saving to Firestore:', err);
    return { success: false, error: err.message || 'Gagal menyimpan ke Firestore' };
  }
}

export function savePackages(packages: PackageItem[]): void {
  savePackagesAsync(packages);
}

export function savePackage(pkg: PackageItem): PackageItem[] {
  const current = getPackages();
  const index = current.findIndex((p) => p.id === pkg.id);
  let updated: PackageItem[];

  if (index >= 0) {
    updated = [...current];
    updated[index] = { ...pkg, updatedAt: new Date().toISOString() };
  } else {
    updated = [...current, { ...pkg, updatedAt: new Date().toISOString() }];
  }

  savePackages(updated);
  return updated;
}

export function deletePackage(id: string): PackageItem[] {
  const current = getPackages();
  const filtered = current.filter((p) => p.id !== id);
  savePackages(filtered);
  return filtered;
}

export function togglePackageActive(id: string): PackageItem[] {
  const current = getPackages();
  const updated = current.map((p) => {
    if (p.id === id) {
      return { ...p, isActive: !p.isActive, updatedAt: new Date().toISOString() };
    }
    return p;
  });
  savePackages(updated);
  return updated;
}


let unsubscribePackages: (() => void) | null = null;

export function subscribeToPackages() {
  if (unsubscribePackages) return;
  if (!db) return;
  
  try {
    const packagesRef = collection(db, 'packages');
    unsubscribePackages = onSnapshot(packagesRef, (snapshot) => {
      const pkgs: PackageItem[] = [];
      snapshot.forEach(doc => {
        pkgs.push(doc.data() as PackageItem);
      });
      
      if (pkgs.length > 0) {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(LOCAL_STORAGE_PACKAGES_KEY, JSON.stringify(pkgs));
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('satset_packages_updated'));
        }
      } else {
        // If empty, initialize with default?
      }
    }, (error) => {
      console.warn('[Packages] Firestore subscription error:', error);
    });
  } catch(e) {
    console.warn('[Packages] Error setting up onSnapshot:', e);
  }
}

// Ensure it's called
if (typeof window !== 'undefined') {
  setTimeout(() => subscribeToPackages(), 2000);
}
