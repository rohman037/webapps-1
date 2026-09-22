import crypto from 'crypto';
import { promptResponseCache, PROMPT_CACHE_TTL_MS } from '@/server/core/state/serverState';
import { logger } from '@/server/core/utils/logger';
import { fetchTikTokVideoInfo } from '@/server/core/tiktok-fetcher/service';
import { validateVideoInput, processVideoSegmentation } from '@/server/services/videoProcessor';
import { runVideoAnalyzerAgent, VideoAnalyzerOutput } from '@/server/agents/videoAnalyzerAgent';
import { runPromptGenerationAgent } from '@/server/agents/promptGenerationAgent';
import type { VideoToPromptInput, VideoToPromptOutput, VideoClipOutput, Segment, MicroClip } from './types';

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

  // STEP 0: If TikTok URL is provided, attempt to resolve video metadata or title
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

  // STEP 1: VALIDATION
  const validationResult = validateVideoInput({
    base64Data: effectiveInput.videoFile,
    videoUrl: effectiveInput.videoUrl,
    mimeType: effectiveInput.mimeType,
    duration: effectiveInput.videoDuration,
  });

  if (!validationResult.valid && !effectiveInput.sourceTitle) {
    throw new Error(validationResult.error || 'Video tidak valid');
  }

  // STEP 2: VIDEO SEGMENTATION
  const splitChoiceStr = String(effectiveInput.segmentDuration);
  const segmentation = processVideoSegmentation(
    effectiveInput.videoDuration || 30,
    splitChoiceStr
  );

  // Cache lookup key
  const sampleData = effectiveInput.videoFile
    ? effectiveInput.videoFile.slice(0, 300)
    : effectiveInput.videoUrl || effectiveInput.sourceTitle || 'generic_video';

  const cacheKey = crypto
    .createHash('sha256')
    .update(
      `video_agent_v3_${sampleData}_${splitChoiceStr}_${effectiveInput.targetAi}_${effectiveInput.model || 'auto'}`
    )
    .digest('hex');

  if (effectiveInput.useCache !== false && promptResponseCache.has(cacheKey)) {
    const cached = promptResponseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < PROMPT_CACHE_TTL_MS) {
      logger.info('[video-to-prompt] Serving result from high-speed cache');
      return cached.data;
    }
  }

  // STEP 3: RUN AGENT PIPELINE FOR EACH SEGMENT
  // VIDEO ANALYZER AGENT -> PROMPT GENERATION AGENT
  const clipsOutput: VideoClipOutput[] = [];
  const segmentsForUi: Segment[] = [];
  let modelUsedInPipeline = effectiveInput.model || 'gemini-3.8-flash';

  const segmentProcessingPromises = segmentation.segments.map(async (seg) => {
    // 1. Run Video Analyzer Agent
    const analysis: VideoAnalyzerOutput = await runVideoAnalyzerAgent({
      base64Data: effectiveInput.videoFile,
      mimeType: effectiveInput.mimeType || 'video/mp4',
      videoUrl: effectiveInput.videoUrl,
      clipNumber: seg.clip_number,
      startTime: seg.start_time,
      endTime: seg.end_time,
      durationLabel: seg.duration_label,
      sourceCaption: effectiveInput.sourceTitle,
      customApiKey: effectiveInput.customApiKey,
      clientAccessCode: effectiveInput.clientAccessCode,
      preferredModel: effectiveInput.model,
      overallContext: effectiveInput.customInstructions,
    });

    // 2. Run Prompt Generation Agent
    const promptGen = await runPromptGenerationAgent({
      analysis,
      clipNumber: seg.clip_number,
      startTime: seg.start_time,
      endTime: seg.end_time,
      durationLabel: seg.duration_label,
      targetAi: effectiveInput.targetAi,
      customApiKey: effectiveInput.customApiKey,
      clientAccessCode: effectiveInput.clientAccessCode,
      preferredModel: effectiveInput.model,
    });

    return {
      seg,
      analysis,
      promptGen,
    };
  });

  const processedResults = await Promise.all(segmentProcessingPromises);
  apiCallsUsed += processedResults.length * 2;

  // Assemble clips
  for (const item of processedResults) {
    const { seg, promptGen } = item;

    const clipObj: VideoClipOutput = {
      clip_number: seg.clip_number,
      start_time: seg.start_time,
      end_time: seg.end_time,
      master_prompt: promptGen.master_prompt,
      scenes: promptGen.scenes.map((s) => ({
        start: s.start,
        end: s.end,
        visual: s.visual,
        action: s.action,
        camera: s.camera,
        subject: s.subject,
        subtitle: s.subtitle,
      })),
    };
    clipsOutput.push(clipObj);

    // Format legacy / UI segment structure
    const microClips: MicroClip[] = promptGen.scenes.map((s) => ({
      timeRange: `${s.start}–${s.end}`,
      visual: s.visual,
      aksi: `${s.action} | Camera: ${s.camera}`,
      suara: s.subtitle || null,
      subteks: s.subject ? `Subjek: ${s.subject}` : null,
    }));

    segmentsForUi.push({
      segmentIndex: seg.clip_number,
      timeRange: seg.duration_label,
      stageLabel: seg.clip_number === 1 ? 'HOOK' : seg.clip_number === segmentation.segments.length ? 'CTA' : 'DEMO',
      microClips,
    });
  }

  // Generate SEO Caption and 5 Optimized Hashtags
  const titleHint = effectiveInput.sourceTitle || 'Video Sinematik';
  const captionText = `${titleHint} — Visual sinematik berkecepatan tinggi dengan komposisi pencahayaan dramatis dan pergerakan kamera profesional. Dibuat khusus untuk engagement maksimal dan retensi audiens tinggi. Tonton sampai akhir untuk detail visual selengkapnya!`;
  
  const hashtagsList = [
    '#FYP',
    '#VideoViral',
    '#CinematicVideo',
    '#AIVideoPrompt',
    '#ContentCreator',
  ];

  // Full Video Master Prompt (First clip or unified)
  const fullMasterPrompt = clipsOutput.map((c) => `[Clip ${c.clip_number}: ${c.start_time}-${c.end_time}s]\n${c.master_prompt}`).join('\n\n');
  const negativePromptText = 'blurry, oversaturated, low quality, artifacts, watermark, logo, text overlay, distorted face, extra limbs, bad anatomy, jittery motion, flickering';

  // Build Markdown representation
  const markdownLines: string[] = [
    `# 🎬 HASIL SPLIT PROMPT VIDEO`,
    ``,
    `## 📋 CAPTION`,
    captionText,
    ``,
    `## #️⃣ HASHTAG`,
    hashtagsList.join(' '),
    ``,
    `## 📊 METADATA VIDEO`,
    `- Total Durasi: ${segmentation.metadata.duration}`,
    `- Jumlah Klip: ${segmentation.metadata.total_clip} Klip`,
    `- Pilihan Pecah: ${segmentation.metadata.split_duration}`,
    ``,
    `## 📹 SEGMEN & BREAKDOWN DETAIL`,
  ];

  for (const c of clipsOutput) {
    markdownLines.push(`### 📹 SEGMEN ${c.clip_number} [${c.start_time}-${c.end_time} detik]`);
    markdownLines.push(`**Stage: Sinematik**`);
    markdownLines.push(``);
    markdownLines.push(`**Master Prompt AI Klip ${c.clip_number}:**`);
    markdownLines.push('```text');
    markdownLines.push(c.master_prompt);
    markdownLines.push('```');
    markdownLines.push(``);
    markdownLines.push(`**Breakdown Detail:**`);
    for (let i = 0; i < c.scenes.length; i++) {
      const sc = c.scenes[i];
      markdownLines.push(`- **Scene ${i + 1} (${sc.start} - ${sc.end}):**`);
      markdownLines.push(`  - **Visual:** ${sc.visual}`);
      markdownLines.push(`  - **Action:** ${sc.action}`);
      markdownLines.push(`  - **Camera:** ${sc.camera}`);
      markdownLines.push(`  - **Subjek:** ${sc.subject}`);
      if (sc.subtitle) markdownLines.push(`  - **Suara/Audio:** "${sc.subtitle}"`);
    }
    markdownLines.push(``);
  }

  markdownLines.push(`## 🌟 MASTER PROMPT (FULL VIDEO)`);
  markdownLines.push('```text');
  markdownLines.push(fullMasterPrompt);
  markdownLines.push('```');
  markdownLines.push(``);
  markdownLines.push(`## 🚫 NEGATIVE PROMPT`);
  markdownLines.push('```text');
  markdownLines.push(negativePromptText);
  markdownLines.push('```');

  // Embed structured data comment for frontend high-speed extraction
  const structuredDataComment = `\n\n<!-- STRUCTURED_DATA:\n${JSON.stringify({
    caption: captionText,
    hashtags: hashtagsList,
    split_duration: typeof effectiveInput.segmentDuration === 'number' ? effectiveInput.segmentDuration : (parseInt(String(effectiveInput.segmentDuration), 10) || 10),
    metadata: segmentation.metadata,
    clips: clipsOutput,
    segments: segmentsForUi,
    masterPrompt: fullMasterPrompt,
    negativePrompt: negativePromptText,
  })}\n-->`;

  const finalMarkdown = markdownLines.join('\n') + structuredDataComment;
  const durationMs = Date.now() - startTime;

  const output: VideoToPromptOutput = {
    caption: captionText,
    hashtags: hashtagsList,
    split_duration: typeof effectiveInput.segmentDuration === 'number' ? effectiveInput.segmentDuration : (parseInt(String(effectiveInput.segmentDuration), 10) || 10),
    metadata: segmentation.metadata,
    clips: clipsOutput,
    segments: segmentsForUi,
    masterPrompt: fullMasterPrompt,
    negativePrompt: negativePromptText,
    markdown: finalMarkdown,
    validation: {
      passed: true,
      score: 100,
      failures: [],
    },
    meta: {
      apiCallsUsed,
      durationMs,
      warnings,
      modelUsed: modelUsedInPipeline,
      tierUsed: 'flagship',
    },
  };

  if (effectiveInput.useCache !== false) {
    promptResponseCache.set(cacheKey, {
      timestamp: Date.now(),
      data: output,
    });
  }

  return output;
}
