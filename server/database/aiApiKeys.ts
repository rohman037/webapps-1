import { safeGet, safeGetOne, safeSave, safeDelete } from '@/src/db/dbService';
import { logger } from '@/server/core/utils/logger';

export interface AiApiKey {
  id: string;
  provider: 'gemini' | 'openai' | string;
  encrypted_key: string;
  status: 'active' | 'disabled' | 'rate_limited' | 'error';
  priority: number; // 1 = highest
  rpm_limit: number;
  tpm_limit: number;
  daily_limit: number;
  usage_count: number;
  error_count: number;
  last_used: string;
  last_error?: string;
  created_at: string;
  alias?: string;
}

const COLLECTION_NAME = 'ai_api_keys';

/**
 * Seed default Admin API Key Pool if none exist
 */
export async function seedDefaultAiApiKeysIfEmpty(): Promise<AiApiKey[]> {
  try {
    const existing = await safeGet(COLLECTION_NAME);
    if (existing && existing.length > 0) {
      return existing as AiApiKey[];
    }

    const defaultKeys: AiApiKey[] = [
      {
        id: 'ai_key_pool_1',
        provider: 'gemini',
        encrypted_key: process.env.GEMINI_API_KEY || 'AIzaSyDefaultKey1_GeminiPoolKey',
        status: 'active',
        priority: 1,
        rpm_limit: 60,
        tpm_limit: 1000000,
        daily_limit: 1500,
        usage_count: 0,
        error_count: 0,
        last_used: new Date().toISOString(),
        created_at: new Date().toISOString(),
        alias: 'API KEY 1 (Primary Flash Pool)',
      },
      {
        id: 'ai_key_pool_2',
        provider: 'gemini',
        encrypted_key: process.env.GEMINI_API_KEY_SECONDARY || process.env.GEMINI_API_KEY || 'AIzaSyDefaultKey2_GeminiPoolKey',
        status: 'active',
        priority: 2,
        rpm_limit: 60,
        tpm_limit: 1000000,
        daily_limit: 1500,
        usage_count: 0,
        error_count: 0,
        last_used: new Date().toISOString(),
        created_at: new Date().toISOString(),
        alias: 'API KEY 2 (Secondary Fallback Pool)',
      },
      {
        id: 'ai_key_pool_3',
        provider: 'gemini',
        encrypted_key: process.env.GEMINI_API_KEY_TERTIARY || process.env.GEMINI_API_KEY || 'AIzaSyDefaultKey3_GeminiPoolKey',
        status: 'active',
        priority: 3,
        rpm_limit: 60,
        tpm_limit: 1000000,
        daily_limit: 1500,
        usage_count: 0,
        error_count: 0,
        last_used: new Date().toISOString(),
        created_at: new Date().toISOString(),
        alias: 'API KEY 3 (Emergency Lite Pool)',
      },
    ];

    for (const key of defaultKeys) {
      await safeSave(COLLECTION_NAME, key);
    }
    logger.info('[aiApiKeys] Default AI Key Pool seeded successfully.');
    return defaultKeys;
  } catch (error) {
    logger.error('[aiApiKeys] Failed to seed default API keys:', error);
    return [];
  }
}

export async function getAiApiKeys(): Promise<AiApiKey[]> {
  try {
    let keys = (await safeGet(COLLECTION_NAME)) as AiApiKey[];
    if (!keys || keys.length === 0) {
      keys = await seedDefaultAiApiKeysIfEmpty();
    }
    return keys.sort((a, b) => (a.priority || 99) - (b.priority || 99));
  } catch (err) {
    logger.error('[aiApiKeys] Error fetching AI API keys:', err);
    return [];
  }
}

export async function getAiApiKeyById(id: string): Promise<AiApiKey | null> {
  try {
    return (await safeGetOne(COLLECTION_NAME, id)) as AiApiKey | null;
  } catch (err) {
    logger.error(`[aiApiKeys] Error fetching AI API key ${id}:`, err);
    return null;
  }
}

export async function createAiApiKey(data: Partial<AiApiKey>): Promise<AiApiKey> {
  const newKey: AiApiKey = {
    id: data.id || `key_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    provider: data.provider || 'gemini',
    encrypted_key: data.encrypted_key || '',
    status: data.status || 'active',
    priority: data.priority !== undefined ? data.priority : 10,
    rpm_limit: data.rpm_limit || 60,
    tpm_limit: data.tpm_limit || 1000000,
    daily_limit: data.daily_limit || 1500,
    usage_count: data.usage_count || 0,
    error_count: data.error_count || 0,
    last_used: new Date().toISOString(),
    created_at: new Date().toISOString(),
    alias: data.alias || `API KEY Custom`,
  };

  await safeSave(COLLECTION_NAME, newKey);
  return newKey;
}

export async function updateAiApiKey(id: string, updates: Partial<AiApiKey>): Promise<AiApiKey | null> {
  const existing = await getAiApiKeyById(id);
  if (!existing) return null;

  const updated = {
    ...existing,
    ...updates,
  };
  await safeSave(COLLECTION_NAME, updated);
  return updated;
}

export async function deleteAiApiKey(id: string): Promise<boolean> {
  try {
    await safeDelete(COLLECTION_NAME, id);
    return true;
  } catch (err) {
    logger.error(`[aiApiKeys] Error deleting AI API key ${id}:`, err);
    return false;
  }
}

export async function recordApiKeyUsage(id: string): Promise<void> {
  const existing = await getAiApiKeyById(id);
  if (existing) {
    await updateAiApiKey(id, {
      usage_count: (existing.usage_count || 0) + 1,
      last_used: new Date().toISOString(),
    });
  }
}

export async function recordApiKeyError(
  id: string,
  errorMsg: string,
  httpStatus?: number
): Promise<void> {
  const existing = await getAiApiKeyById(id);
  if (!existing) return;

  const updates: Partial<AiApiKey> = {
    error_count: (existing.error_count || 0) + 1,
    last_error: errorMsg,
  };

  // Rule 5: 401 Unauthorized -> Disable API Key
  if (httpStatus === 401 || errorMsg.includes('API_KEY_INVALID') || errorMsg.includes('401')) {
    updates.status = 'disabled';
    logger.warn(`[aiApiKeys] API Key ${id} disabled due to 401 Unauthorized`);
  } else if (httpStatus === 429 || errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
    updates.status = 'rate_limited';
    logger.warn(`[aiApiKeys] API Key ${id} marked rate_limited`);
  }

  await updateAiApiKey(id, updates);
}
