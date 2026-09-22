import crypto from 'crypto';
import { promptResponseCache, PROMPT_CACHE_TTL_MS } from '@/server/core/state/serverState';
import { logger } from '@/server/core/utils/logger';
import { fetchTikTokVideoInfo } from '@/server/core/tiktok-fetcher/service';
import { runVideoAnalyzerAllInOne } from './agents/video-analyzer';
import { validateOutput, parseMarkdownToStructuredOutput } from './validators/output-validator';
import { buildVideoToPromptUserPrompt } from './prompts/video-to-prompt.user';
import type { VideoToPromptInput, VideoToPromptOutput } from './types';

export * from './types';

export async function runVideoToPromptPipeline(
  input: VideoToPromptInput
): Promise<VideoToPromptOutput> {
  const startTime = Date.now();
  let apiCallsUsed = 0;
  const warnings: string[] = [];

  let effectiveInput: VideoToPromptInput = {
    ...input,
    segmentDuration: input.segmentDuration || 10,
    targetAi: input.targetAi || 'general',
    aspectRatio: input.aspectRatio || '9:16',
    analysisDepth: input.analysisDepth || 'standard',
  };

  // If TikTok URL is provided, attempt to resolve video metadata or title
  if (effectiveInput.videoUrl && !effectiveInput.sourceTitle) {
    try {
      const tiktokInfo = await fetchTikTokVideoInfo(effectiveInput.videoUrl);
      if (tiktokInfo && tiktokInfo.title) {
        effectiveInput.sourceTitle = tiktokInfo.title;
        if (!effectiveInput.videoDuration && tiktokInfo.duration) {
          effectiveInput.videoDuration = tiktokInfo.duration;
        }
        logger.info(`[video-to-prompt] Resolved TikTok title: "${tiktokInfo.title.slice(0, 50)}..."`);
      }
    } catch (e: any) {
      warnings.push(`Could not fetch TikTok info automatically: ${e.message}`);
    }
  }

  // Cache lookup key
  const sampleData = effectiveInput.videoFile
    ? effectiveInput.videoFile.slice(0, 300)
    : effectiveInput.videoUrl || effectiveInput.sourceTitle || 'generic_video';

  const cacheKey = crypto
    .createHash('sha256')
    .update(
      `video_to_prompt_${sampleData}_${effectiveInput.segmentDuration}_${effectiveInput.targetAi}_${effectiveInput.aspectRatio}_${effectiveInput.analysisDepth}_${effectiveInput.model || 'auto'}`
    )
    .digest('hex');

  if (effectiveInput.useCache !== false && promptResponseCache.has(cacheKey)) {
    const cached = promptResponseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < PROMPT_CACHE_TTL_MS) {
      logger.info('[video-to-prompt] Serving result from high-speed cache');
      return cached.data;
    }
  }

  // CALL 1: All-in-One Generation
  let analysisResult = await runVideoAnalyzerAllInOne(effectiveInput);
  apiCallsUsed++;

  let markdown = analysisResult.markdown;
  let validation = validateOutput(markdown);

  // RETRY: Max 1x if output validation failed
  if (!validation.passed) {
    logger.warn(`[video-to-prompt] Initial output failed validation (score: ${validation.score}). Retrying 1x with strengthened constraints...`);
    const enhancedPrompt =
      buildVideoToPromptUserPrompt({
        videoDuration: effectiveInput.videoDuration,
        segmentDuration: effectiveInput.segmentDuration,
        targetAi: effectiveInput.targetAi,
        aspectRatio: effectiveInput.aspectRatio,
        analysisDepth: effectiveInput.analysisDepth,
        sourceTitle: effectiveInput.sourceTitle,
        customInstructions: effectiveInput.customInstructions,
      }) +
      `\n\n[CRITICAL QUALITY RECOVERY REQUIREMENT]\n` +
      `Your previous generation missed the following mandatory elements:\n` +
      validation.failures.map(f => `- ${f}`).join('\n') +
      `\nYou MUST satisfy all mandatory sections: CAPTION SEO (5 sentences), HASHTAG (5 items), SEGMEN breakdowns with micro-clips (Visual, Aksi, Suara/Subteks), RINGKASAN TEKNIS, MASTER PROMPT, and NEGATIVE PROMPT.`;

    const retryResult = await runVideoAnalyzerAllInOne(effectiveInput, enhancedPrompt);
    apiCallsUsed++;

    if (retryResult.markdown && retryResult.markdown.length > markdown.length / 2) {
      markdown = retryResult.markdown;
      analysisResult = retryResult;
      validation = validateOutput(markdown);
    }
  }

  const parsed = parseMarkdownToStructuredOutput(markdown);
  const durationMs = Date.now() - startTime;

  const output: VideoToPromptOutput = {
    markdown,
    validation,
    caption: parsed.caption,
    hashtags: parsed.hashtags,
    segments: parsed.segments,
    masterPrompt: parsed.masterPrompt,
    negativePrompt: parsed.negativePrompt,
    meta: {
      apiCallsUsed,
      durationMs,
      warnings,
      modelUsed: analysisResult.modelUsed,
      tierUsed: analysisResult.tierUsed,
    },
  };

  if (effectiveInput.useCache !== false && validation.passed) {
    promptResponseCache.set(cacheKey, {
      timestamp: Date.now(),
      data: output,
    });
  }

  return output;
}
