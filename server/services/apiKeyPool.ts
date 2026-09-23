import {
  AiApiKey,
  getAiApiKeys,
  updateAiApiKey,
  recordApiKeyUsage,
  recordApiKeyError,
  calculateKeyRoutingScore,
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
  const rawCandidate = key.api_key || key.encrypted_key || '';

  if (!rawCandidate || rawCandidate.includes('GeminiPoolKey') || rawCandidate.includes('DefaultKey')) {
    return process.env.GEMINI_API_KEY || '';
  }

  if (rawCandidate.startsWith('AIzaSy')) {
    return rawCandidate;
  }

  if (rawCandidate === 'process.env.GEMINI_API_KEY') {
    return process.env.GEMINI_API_KEY || '';
  }

  if (process.env[rawCandidate]) {
    return process.env[rawCandidate] || '';
  }

  return rawCandidate || process.env.GEMINI_API_KEY || '';
}

/**
 * Get active API Keys sorted by intelligent scoring formula:
 * KEY_SCORE = Health Score + Remaining Quota + Latency Performance + Recent Usage + Priority Weight
 */
export async function getAvailableApiKeys(excludeKeyIds: string[] = []): Promise<AiApiKey[]> {
  const allKeys = await getAiApiKeys();
  const now = Date.now();

  const available = allKeys.filter((key) => {
    if (excludeKeyIds.includes(key.id)) return false;
    if (key.status === 'disabled' || key.status === 'revoked') return false;

    const runtime = runtimeKeyStates.get(key.id);
    if (runtime && runtime.cooldownUntil > now) {
      return false; // Key is cooling down
    }

    if (key.cooldown_until && key.cooldown_until > now) {
      return false;
    }

    return true;
  });

  return available.sort((a, b) => calculateKeyRoutingScore(b) - calculateKeyRoutingScore(a));
}

/**
 * Handle 429: Put key into temporary cooldown and increment rate limit count
 */
export async function handleKeyRateLimited(keyId: string, cooldownMs = 150000) {
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
  await updateAiApiKey(keyId, { status: 'disabled', last_error: reason, health_score: 0 });
}

/**
 * Handle success: reset runtime error streaks
 */
export async function handleKeySuccess(keyId: string, latencyMs = 200) {
  const current = runtimeKeyStates.get(keyId);
  if (current) {
    current.consecutiveRateLimits = 0;
  }
  await recordApiKeyUsage(keyId, latencyMs);
}
