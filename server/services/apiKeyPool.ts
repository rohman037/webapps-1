import {
  AiApiKey,
  getAiApiKeys,
  updateAiApiKey,
  recordApiKeyUsage,
  recordApiKeyError,
} from '@/server/database/aiApiKeys';
import { logger } from '@/server/core/utils/logger';

interface KeyRuntimeState {
  cooldownUntil: number;
  consecutiveRateLimits: number;
}

const runtimeKeyStates = new Map<string, KeyRuntimeState>();

/**
 * Resolves the raw API key string (handling process.env fallbacks if needed)
 */
export function resolveRawKey(key: AiApiKey): string {
  if (!key.encrypted_key) return process.env.GEMINI_API_KEY || '';

  // If the key is a reference or starts with AIzaSy
  if (key.encrypted_key.startsWith('AIzaSy')) {
    return key.encrypted_key;
  }

  // Check if it's stored directly or matches an env var
  if (key.encrypted_key === 'process.env.GEMINI_API_KEY') {
    return process.env.GEMINI_API_KEY || '';
  }

  if (process.env[key.encrypted_key]) {
    return process.env[key.encrypted_key] || '';
  }

  return key.encrypted_key || process.env.GEMINI_API_KEY || '';
}

/**
 * Get active API Keys sorted by priority, filtering out disabled or currently cooling down keys
 */
export async function getAvailableApiKeys(excludeKeyIds: string[] = []): Promise<AiApiKey[]> {
  const allKeys = await getAiApiKeys();
  const now = Date.now();

  const available = allKeys.filter((key) => {
    if (excludeKeyIds.includes(key.id)) return false;
    if (key.status === 'disabled') return false;

    const runtime = runtimeKeyStates.get(key.id);
    if (runtime && runtime.cooldownUntil > now) {
      return false; // Key is cooling down
    }

    return true;
  });

  return available.sort((a, b) => (a.priority || 99) - (b.priority || 99));
}

/**
 * Handle 429: Put key into temporary cooldown and increment rate limit count
 */
export async function handleKeyRateLimited(keyId: string, cooldownMs = 60000) {
  const current = runtimeKeyStates.get(keyId) || { cooldownUntil: 0, consecutiveRateLimits: 0 };
  current.cooldownUntil = Date.now() + cooldownMs;
  current.consecutiveRateLimits += 1;
  runtimeKeyStates.set(keyId, current);

  logger.warn(`[apiKeyPool] Key ${keyId} placed in cooldown for ${cooldownMs / 1000}s due to 429 Rate Limit`);
  await recordApiKeyError(keyId, '429 Rate Limit Exceeded', 429);
}

/**
 * Handle 401: Permanently disable API key in database and runtime
 */
export async function handleKeyDisabled(keyId: string, reason = '401 Unauthorized') {
  const current = runtimeKeyStates.get(keyId) || { cooldownUntil: 0, consecutiveRateLimits: 0 };
  current.cooldownUntil = Date.now() + 86400000;
  runtimeKeyStates.set(keyId, current);

  logger.error(`[apiKeyPool] Key ${keyId} disabled permanently: ${reason}`);
  await recordApiKeyError(keyId, reason, 401);
  await updateAiApiKey(keyId, { status: 'disabled', last_error: reason });
}

/**
 * Handle success: reset runtime error streaks
 */
export async function handleKeySuccess(keyId: string) {
  const current = runtimeKeyStates.get(keyId);
  if (current) {
    current.consecutiveRateLimits = 0;
  }
  await recordApiKeyUsage(keyId);
}
