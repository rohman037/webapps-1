export { callGeminiWithFallback } from '@/server/core/llm/geminiGateway';
export { normalizeGeminiModel } from '@/server/core/llm/routing/modelRouter';
export { sanitizeCaptionsAndHashtags } from '@/server/core/utils/sanitizer';
export { promptResponseCache, PROMPT_CACHE_TTL_MS, recordExecutionAndUpgrade } from '@/server/core/state/serverState';
export { logger } from '@/src/utils/logger';

export interface BaseWorkflowResult<T = string> {
  success: boolean;
  result?: T;
  text?: string;
  modelUsed?: string;
  warnings?: string[];
}
