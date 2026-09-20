import React, { useState, useEffect } from 'react';
import LoginView from './components/views/LoginView';
import PaketAksesView from './components/views/PaketAksesView';
import AdminDashboardView from './components/views/AdminDashboardView';
import UserLayout from './components/layouts/UserLayout';
import { initRealtimeSync } from './lib/realtimeSync';
import { initCrossTabSync } from './lib/crossTabSync';
import { syncHistoryAsync } from './lib/history';
import { useAuth } from './hooks/useAuth';

export default function App() {
  const { session, logout, refreshSession, setSession } = useAuth();
  
  useEffect(() => {
    // [REALTIME-FIX] Initialize central real-time sync (SSE Manager) & Cross-Tab Sync
    const cleanupRealtime = initRealtimeSync();
    const cleanupCrossTab = initCrossTabSync();
    syncHistoryAsync();

    return () => {
      cleanupRealtime();
      cleanupCrossTab();
    };
  }, []);

  const [publicView, setPublicView] = useState<'login' | 'pricing'>('login');
  const [adminViewMode, setAdminViewMode] = useState<'admin_dashboard' | 'workspace'>('admin_dashboard');

  const handleLogout = () => {
    logout();
    setPublicView('login');
  };

  // Proteksi: Jika belum ada session resmi atau terdeteksi guest access, render tampilan publik
  if (!session || session.code === 'GUEST-ACCESS') {
    if (publicView === 'pricing') {
      return (
        <div className="min-h-screen bg-[#fcf8ff] p-4 sm:p-8">
          <PaketAksesView
            onBackToLogin={() => setPublicView('login')}
            onSuccessLogin={() => {
              refreshSession();
              setPublicView('login');
            }}
          />
        </div>
      );
    }

    return (
      <LoginView
        onLoginSuccess={(s) => {
          if (s.code !== 'GUEST-ACCESS') {
            setSession(s);
            setPublicView('login');
          }
        }}
        onOpenPaketAkses={() => {
          setPublicView('pricing');
        }}
      />
    );
  }

  // Tampilan Admin Dashboard
  if (session.role === 'admin' && adminViewMode === 'admin_dashboard') {
    return (
      <AdminDashboardView
        onGoToWorkspace={() => setAdminViewMode('workspace')}
        onLogout={handleLogout}
        onOpenApiKeySettings={() => setAdminViewMode('workspace')}
      />
    );
  }

  // Workspace User Layout (Hanya untuk pengguna terautentikasi resmi)
  return (
    <UserLayout
      session={session}
      onLogout={handleLogout}
      onGoToAdmin={session.role === 'admin' ? () => setAdminViewMode('admin_dashboard') : undefined}
    />
  );
}
