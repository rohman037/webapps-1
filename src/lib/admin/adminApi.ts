import { getUserSession } from '../auth';

/**
 * Standard headers generator for Admin API calls.
 * Ensures x-access-code and authorization headers are always attached.
 */
export function getAdminHeaders(customHeaders: Record<string, string> = {}): Record<string, string> {
  const session = getUserSession();
  const activeCode = session?.code || (typeof localStorage !== 'undefined' ? localStorage.getItem('satset_access_code') : null) || '';
  const adminEmail = session?.email || (typeof localStorage !== 'undefined' ? localStorage.getItem('satset_admin_email') : null) || '';
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(activeCode ? { 'x-access-code': activeCode, 'x-admin-code': activeCode, 'Authorization': `Bearer ${activeCode}` } : {}),
    ...(adminEmail ? { 'x-admin-email': adminEmail } : {}),
    ...customHeaders,
  };

  return headers;
}

/**
 * Robust fetch wrapper for Admin backend endpoints.
 * Automatically injects admin credentials and handles JSON responses.
 */
export async function adminFetch<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  try {
    const combinedHeaders = getAdminHeaders((options.headers as Record<string, string>) || {});
    const res = await fetch(url, {
      ...options,
      headers: combinedHeaders,
    });

    let data: any = null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch {
        data = null;
      }
    } else {
      try {
        data = await res.text();
      } catch {
        data = null;
      }
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        data,
        error: data?.error || data?.message || `Request failed with status ${res.status}`,
      };
    }

    return {
      ok: true,
      status: res.status,
      data,
    };
  } catch (err: any) {
    console.error(`[AdminApi] Network error for ${url}:`, err);
    return {
      ok: false,
      status: 0,
      error: err?.message || 'Gagal terhubung ke server backend.',
    };
  }
}
