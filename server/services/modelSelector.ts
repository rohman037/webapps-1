import { getAiModelsForTask } from '@/server/database/aiModels';
import { logger } from '@/server/core/utils/logger';

// Default model hierarchy per specifications
export const TASK_MODEL_HIERARCHY: Record<string, string[]> = {
  video_analysis: [
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
  ],
  prompt_generation: [
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
  ],
  general: [
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
  ],
};

/**
 * Returns prioritized model list for a given apiKey and taskType
 */
export async function getModelsForApiKeyAndTask(
  apiKeyId: string,
  taskType: 'video_analysis' | 'prompt_generation' | 'general' = 'video_analysis'
): Promise<string[]> {
  try {
    const configuredModels = await getAiModelsForTask(apiKeyId, taskType);
    if (configuredModels && configuredModels.length > 0) {
      return configuredModels
        .filter((m) => m.status === 'active')
        .sort((a, b) => (a.priority || 99) - (b.priority || 99))
        .map((m) => m.model_name);
    }
  } catch (err) {
    logger.warn(`[modelSelector] Could not load DB models for ${apiKeyId}:`, err);
  }

  // Fallback to standard task hierarchy
  return TASK_MODEL_HIERARCHY[taskType] || TASK_MODEL_HIERARCHY.video_analysis;
}
