import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  Search, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Key, 
  ShieldCheck, 
  Zap, 
  LogOut, 
  Radio, 
  UserCheck, 
  Laptop, 
  Users, 
  Activity, 
  Globe, 
  Monitor, 
  Wifi
} from 'lucide-react';
import DataTable from '../../components/admin/DataTable';
import StatCard from '../../components/admin/StatCard';
import { getAuditLogs, AuditLogItem } from '../../lib/admin/auditLog';
import { maskAccessCode } from '../../utils/maskAccessCode';
import { subscribeLiveGenerationEvents } from '../../events/generationEvent';
import { adminFetch } from '../../lib/admin/adminApi';

export interface ActivePresenceSession {
  accessCode: string;
  name: string;
  role: string;
  ip: string;
  userAgent: string;
  loginAt: string;
  lastSeenAt: number;
}

interface NormalizedLogItem {
  id: string;
  actor: string;
  action: string;
  details: string;
  timestamp: string;
  category: string;
  isSuccess: boolean;
  isFailed: boolean;
  isLogout: boolean;
  isSuspended: boolean;
  isExpired: boolean;
}

export default function LoginActivityPanel() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [activeSessions, setActiveSessions] = useState<ActivePresenceSession[]>([]);
  const [currentTab, setCurrentTab] = useState<'online' | 'logs'>('online');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'success' | 'failed' | 'logout'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [lastLivePing, setLastLivePing] = useState<number>(Date.now());

  useEffect(() => {
    loadLogs();
    loadPresence();
    window.addEventListener('satset_audit_logs_updated', loadLogs);
    window.addEventListener('storage', loadLogs);

    const unsubscribe = subscribeLiveGenerationEvents((data) => {
      if (data.type === 'presence_updated' && Array.isArray(data.activeSessions)) {
        setActiveSessions(data.activeSessions);
        setLastLivePing(Date.now());
      }

      if (data.type === 'audit_log_event' || data.type === 'audit_logs_updated' || data.type === 'clients_updated') {
        setLastLivePing(Date.now());
        if (data.type === 'audit_log_event' && data.log) {
          setLogs((prev) => {
            const exists = prev.some((p) => p.id === data.log.id);
            if (exists) return prev;
            const updated = [data.log, ...prev].slice(0, 200);
            try {
              localStorage.setItem('satset_audit_logs', JSON.stringify(updated));
            } catch (e) {}
            return updated;
          });
        }
        // Pastikan juga selalu sinkronisasi penuh dari server
        loadLogs();
        loadPresence();
      }
    });

    // Polling cadangan setiap 8 detik agar log & online user selalu up-to-date
    const interval = setInterval(() => {
      loadLogs();
      loadPresence();
    }, 8000);

    return () => {
      clearInterval(interval);
      window.removeEventListener('satset_audit_logs_updated', loadLogs);
      window.removeEventListener('storage', loadLogs);
      unsubscribe();
    };
  }, []);

  const loadPresence = async () => {
    try {
      const res = await fetch('/api/admin/presence');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.activeSessions)) {
          setActiveSessions(data.activeSessions);
        }
      }
    } catch (e) {}
  };

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/audit-logs');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setLogs(data);
          try {
            localStorage.setItem('satset_audit_logs', JSON.stringify(data));
          } catch (e) {}
          setIsLoading(false);
          return;
        }
      }
    } catch (e) {}

    // Fallback jika fetch server gagal
    setLogs(getAuditLogs());
    setIsLoading(false);
  };

  const handleRefreshAll = () => {
    loadLogs();
    loadPresence();
  };

  const safeLogs = Array.isArray(logs) ? logs : [];

  // Normalize log item to handle both legacy format & clean new format
  const normalizeLog = (log: AuditLogItem): NormalizedLogItem => {
    let rawActor = log.adminName || 'Pengguna';
    let rawAction = log.action || '';
    let rawDetails = log.details || '';

    if (
      (rawActor.toLowerCase().includes('login') || rawActor.toLowerCase().includes('percobaan')) &&
      (rawAction.toLowerCase().includes('admin') || rawAction.toLowerCase().includes('user') || rawAction.toLowerCase().includes('kode akses'))
    ) {
      const title = rawActor;
      const desc = rawAction;

      if (title.toLowerCase().includes('master admin') || desc.toLowerCase().includes('admin login')) {
        const emailMatch = desc.match(/\(([^)]+)\)/);
        rawActor = emailMatch ? `Master Admin (${emailMatch[1]})` : 'Master Admin';
        rawAction = 'Login Berhasil';
        rawDetails = desc;
      } else if (desc.toLowerCase().includes('user') || title.toLowerCase().includes('user')) {
        const userMatch = desc.match(/User\s+(.+?)\s+\((.+?)\)/i);
        rawActor = userMatch ? `${userMatch[1]} (${userMatch[2]})` : 'Klien Satset';
        rawAction = title.toLowerCase().includes('ditolak') ? 'Login Ditolak' : 'Login Berhasil';
        rawDetails = desc;
      } else {
        rawActor = 'Pengguna Satset';
        rawAction = title;
        rawDetails = desc;
      }
    }

    const actionLower = rawAction.toLowerCase();
    const detailsLower = rawDetails.toLowerCase();
    const actorLower = rawActor.toLowerCase();

    const isSuccess = actionLower.includes('berhasil') || detailsLower.includes('berhasil') || actorLower.includes('berhasil');
    const isSuspended = actionLower.includes('ditangguhkan') || detailsLower.includes('ditangguhkan');
    const isExpired = actionLower.includes('kadaluarsa') || detailsLower.includes('kadaluarsa') || detailsLower.includes('kedaluwarsa');
    const isFailed = !isSuccess && (
      actionLower.includes('ditolak') ||
      actionLower.includes('gagal') ||
      actionLower.includes('salah') ||
      actionLower.includes('banned') ||
      isSuspended ||
      isExpired
    );
    const isLogout = actionLower.includes('logout') || detailsLower.includes('logout');

    return {
      id: log.id,
      actor: rawActor,
      action: rawAction,
      details: rawDetails,
      timestamp: log.timestamp,
      category: log.category,
      isSuccess,
      isFailed,
      isLogout,
      isSuspended,
      isExpired,
    };
  };

  const normalizedLogs = safeLogs.map(normalizeLog);

  const loginLogs = normalizedLogs.filter((log) => {
    const act = log.action.toLowerCase();
    const det = log.details.toLowerCase();
    const adm = log.actor.toLowerCase();
    const cat = (log.category || '').toLowerCase();
    return (
      act.includes('login') ||
      act.includes('logout') ||
      det.includes('login') ||
      det.includes('otentikasi') ||
      det.includes('kode akses') ||
      adm.includes('admin') ||
      adm.includes('klien') ||
      adm.includes('user') ||
      cat === 'system' ||
      cat === 'client'
    );
  });

  const successCount = loginLogs.filter((l) => l.isSuccess && !l.isLogout).length;
  const failedCount = loginLogs.filter((l) => l.isFailed).length;
  const logoutCount = loginLogs.filter((l) => l.isLogout).length;

  const filteredLogs = loginLogs.filter((log) => {
    if (filterType === 'success' && (!log.isSuccess || log.isLogout)) return false;
    if (filterType === 'failed' && !log.isFailed) return false;
    if (filterType === 'logout' && !log.isLogout) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchAction = log.action.toLowerCase().includes(q);
      const matchDetails = log.details.toLowerCase().includes(q);
      const matchActor = log.actor.toLowerCase().includes(q);
      return matchAction || matchDetails || matchActor;
    }
    return true;
  });

  const filteredActiveSessions = activeSessions.filter((session) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      session.name.toLowerCase().includes(q) ||
      session.accessCode.toLowerCase().includes(q) ||
      session.ip.toLowerCase().includes(q) ||
      session.role.toLowerCase().includes(q)
    );
  });

  // Mask sensitive code patterns inside details text for security
  const sanitizeDetails = (text: string) => {
    return text.replace(/(SATSET-[A-Z0-9]{4,8})/gi, (match) => maskAccessCode(match));
  };

  const formatLastSeen = (lastSeenAt: number) => {
    const diffSec = Math.max(0, Math.floor((Date.now() - lastSeenAt) / 1000));
    if (diffSec < 10) return 'Baru saja';
    if (diffSec < 60) return `${diffSec} detik lalu`;
    const diffMin = Math.floor(diffSec / 60);
    return `${diffMin} menit lalu`;
  };

  return (
    <div className="space-y-6 font-sans text-slate-800">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2 flex-wrap">
            <Activity className="w-6 h-6 text-[#3525cd]" />
            <span>Monitoring User Online & Log Login Real-Time</span>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 ml-1 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>LIVE SSE TRACKER AKTIF</span>
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Tracking siapa saja yang sedang online aktif saat ini & rekaman riwayat otentikasi login secara real-time.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleRefreshAll}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#3525cd] ${isLoading ? 'animate-spin' : ''}`} />
            <span>Muat Ulang Data</span>
          </button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="User Sedang Online"
          value={activeSessions.length.toString()}
          subtext="Sesi aktif terhubung (Live)"
          icon={<Users className="w-5 h-5 text-emerald-600" />}
          iconBgColor="bg-emerald-50"
        />
        <StatCard
          title="Login Berhasil"
          value={successCount.toString()}
          subtext="Akses terotentikasi sah"
          icon={<CheckCircle2 className="w-5 h-5 text-indigo-600" />}
          iconBgColor="bg-indigo-50"
        />
        <StatCard
          title="Login Ditolak / Gagal"
          value={failedCount.toString()}
          subtext="Integritas sistem terjaga"
          icon={<XCircle className="w-5 h-5 text-rose-600" />}
          iconBgColor="bg-rose-50"
        />
        <StatCard
          title="Sesi Logout / Keluar"
          value={logoutCount.toString()}
          subtext="Riwayat selesai sesi"
          icon={<LogOut className="w-5 h-5 text-slate-600" />}
          iconBgColor="bg-slate-100"
        />
      </div>

      {/* Primary Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setCurrentTab('online')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            currentTab === 'online'
              ? 'bg-[#3525cd] text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span>User Online Saat Ini ({activeSessions.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setCurrentTab('logs')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            currentTab === 'logs'
              ? 'bg-[#3525cd] text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Riwayat Log Login ({loginLogs.length})</span>
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              currentTab === 'online'
                ? "Cari user online berdasarkan nama, kode akses, IP, atau role..."
                : "Cari riwayat log berdasarkan nama, email, IP, kode akses, atau status..."
            }
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3525cd]/20 focus:border-[#3525cd] transition-all"
          />
        </div>

        {currentTab === 'logs' && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filterType === 'all'
                  ? 'bg-[#3525cd] text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Semua ({loginLogs.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('success')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filterType === 'success'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Sukses ({successCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('failed')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filterType === 'failed'
                  ? 'bg-rose-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Ditolak ({failedCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('logout')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filterType === 'logout'
                  ? 'bg-slate-800 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Logout ({logoutCount})
            </button>
          </div>
        )}
      </div>

      {/* TAB 1: USER ONLINE REAL-TIME */}
      {currentTab === 'online' && (
        <div className="space-y-3">
          <DataTable
            columns={[
              {
                header: 'Status & Pengguna',
                render: (session: ActivePresenceSession) => {
                  const isAdmin = session.role === 'admin';
                  return (
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <span className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                        </span>
                      </div>
                      <div>
                        <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                          {isAdmin ? (
                            <span className="p-1 rounded-md bg-amber-50 text-amber-600 border border-amber-200/60">
                              <ShieldCheck className="w-3.5 h-3.5" />
                            </span>
                          ) : (
                            <span className="p-1 rounded-md bg-indigo-50 text-indigo-600 border border-indigo-200/60">
                              <Key className="w-3.5 h-3.5" />
                            </span>
                          )}
                          <span>{session.name}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {maskAccessCode(session.accessCode)}
                        </div>
                      </div>
                    </div>
                  );
                },
              },
              {
                header: 'Role Akses',
                render: (session: ActivePresenceSession) => (
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                    session.role === 'admin'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                  }`}>
                    {session.role === 'admin' ? 'Master Admin' : 'Klien / User'}
                  </span>
                ),
              },
              {
                header: 'Alamat IP & Jaringan',
                render: (session: ActivePresenceSession) => (
                  <div className="font-mono text-xs text-slate-700 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{session.ip || '127.0.0.1'}</span>
                  </div>
                ),
              },
              {
                header: 'Waktu Login',
                render: (session: ActivePresenceSession) => (
                  <span className="text-xs font-mono text-slate-600 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                      {new Date(session.loginAt).toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </span>
                ),
              },
              {
                header: 'Aktivitas Terakhir',
                render: (session: ActivePresenceSession) => (
                  <div className="flex items-center gap-1.5">
                    <Wifi className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                    <span className="text-xs font-medium text-emerald-700">
                      {formatLastSeen(session.lastSeenAt)}
                    </span>
                  </div>
                ),
              },
            ]}
            data={filteredActiveSessions}
            emptyMessage="Tidak ada pengguna yang sedang online saat ini."
          />
        </div>
      )}

      {/* TAB 2: RIWAYAT LOG LOGIN */}
      {currentTab === 'logs' && (
        <DataTable
          columns={[
            {
              header: 'Waktu Event',
              render: (row: NormalizedLogItem) => (
                <span className="text-xs font-mono text-slate-600 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    {new Date(row.timestamp).toLocaleString('id-ID', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </span>
              ),
            },
            {
              header: 'Pengguna / Aktor',
              render: (row: NormalizedLogItem) => {
                const isAdmin = row.actor.toLowerCase().includes('admin');
                return (
                  <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                    {isAdmin ? (
                      <span className="p-1 rounded-md bg-amber-50 text-amber-600 border border-amber-200/60">
                        <ShieldCheck className="w-3.5 h-3.5" />
                      </span>
                    ) : (
                      <span className="p-1 rounded-md bg-indigo-50 text-indigo-600 border border-indigo-200/60">
                        <Key className="w-3.5 h-3.5" />
                      </span>
                    )}
                    <span className="truncate max-w-[200px]">{row.actor}</span>
                  </span>
                );
              },
            },
            {
              header: 'Aksi Otentikasi',
              render: (row: NormalizedLogItem) => {
                if (row.isLogout) {
                  return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-300">
                      <LogOut className="w-3 h-3 text-slate-600" />
                      <span>Logout Sesi</span>
                    </span>
                  );
                }
                if (row.isSuccess) {
                  return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      <span>Login Berhasil</span>
                    </span>
                  );
                }
                if (row.isSuspended) {
                  return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200">
                      <ShieldAlert className="w-3 h-3 text-amber-600" />
                      <span>Ditangguhkan</span>
                    </span>
                  );
                }
                if (row.isExpired) {
                  return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
                      <Clock className="w-3 h-3 text-rose-600" />
                      <span>Kedaluwarsa</span>
                    </span>
                  );
                }
                return (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
                    <XCircle className="w-3 h-3 text-rose-600" />
                    <span>{row.action || 'Login Ditolak'}</span>
                  </span>
                );
              },
            },
            {
              header: 'Rincian & Informasi IP / Perangkat',
              render: (row: NormalizedLogItem) => (
                <span className="text-xs text-slate-700 font-mono break-all block">
                  {sanitizeDetails(row.details)}
                </span>
              ),
            },
          ]}
          data={filteredLogs}
          emptyMessage="Belum ada riwayat aktivitas login yang tercatat."
        />
      )}
    </div>
  );
}

