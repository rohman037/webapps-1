import { callGeminiWithFallback } from '@/server/core/llm/geminiGateway';
import { normalizeGeminiModel } from '@/server/core/llm/routing/modelRouter';
import { logger } from '@/src/utils/logger';
import { buildContentGeneratorPrompt } from '../prompts/content-generator';
import { ContentGeneratorInput, ContentGeneratorOutput } from '../types';
import { isNewClipFormat } from '../validator';

export async function generateShopContent(input: ContentGeneratorInput): Promise<ContentGeneratorOutput> {
  const {
    totalIdeas,
    maxSecNum,
    segSecNum,
    expectedClipsCount,
    identityAnchorDescription,
    enrichedInfo,
    productDetails,
    classifiedKeywords,
    ideasHookAssignments,
    referenceImageBase64,
    referenceImageMimeType,
    model,
    customApiKey,
    clientAccessCode,
  } = input;

  logger.info(`[content-generator-agent] Generating ${totalIdeas} TikTok Shop video ideas | tier=tier2`);

  const { finalPrompt, systemInstruction } = buildContentGeneratorPrompt({
    totalIdeas,
    maxSecNum,
    segSecNum,
    expectedClipsCount,
    identityAnchorDescription,
    enrichedInfo,
    productDetails,
    classifiedKeywords,
    ideasHookAssignments,
  });

  const payloadParts: any[] = [];
  if (referenceImageBase64) {
    payloadParts.push({
      inlineData: {
        mimeType: referenceImageMimeType || 'image/jpeg',
        data: referenceImageBase64,
      },
    });
  }
  payloadParts.push({ text: finalPrompt });

  const payload = {
    contents: {
      parts: payloadParts,
    },
    config: {
      systemInstruction,
    },
  };

  const userSelectedModel = model ? normalizeGeminiModel(model) : undefined;
  let geminiResult = await callGeminiWithFallback(
    userSelectedModel,
    payload,
    customApiKey,
    clientAccessCode,
    'tier2',
    'TikTok Shop Ideas'
  );

  let currentGeneratedText = geminiResult?.text || '';
  let isFormatFlawed = false;

  const isMissingStructure =
    !currentGeneratedText.includes('BAGIAN 1') ||
    !currentGeneratedText.includes('BAGIAN 3') ||
    !isNewClipFormat(currentGeneratedText);

  if (isMissingStructure) {
    logger.warn(
      '[content-generator-agent] Output kurang lengkap atau format tidak sesuai klip, mencoba retry 1x...'
    );
    try {
      const retryPayload = {
        contents: {
          parts: [
            ...payloadParts,
            {
              text: `\n\nCRITICAL FIX: Output sebelumnya SALAH FORMAT.
CLIP FORMAT (STRICT):
Each clip starts with a time line like: 0–${segSecNum} detik
Then exactly these labels on separate lines:
Visual:
Aksi:
voice over:
Subteks:
Do not omit labels. Do not merge into one paragraph without labels.`,
            },
          ],
        },
        config: {
          systemInstruction,
          temperature: 0.35,
        },
      };

      const retryResult = await callGeminiWithFallback(
        userSelectedModel,
        retryPayload,
        customApiKey,
        clientAccessCode,
        'tier2',
        'TikTok Shop Ideas'
      );

      if (retryResult?.text && retryResult.text.length > 250) {
        geminiResult = retryResult;
        currentGeneratedText = retryResult.text;
        logger.info('[content-generator-agent] Retry berhasil mendapatkan output.');
      }
    } catch (retryErr) {
      logger.warn('[content-generator-agent] Retry gagal, menggunakan output awal:', retryErr);
    }

    if (!isNewClipFormat(currentGeneratedText)) {
      isFormatFlawed = true;
    }
  }

  return {
    text: currentGeneratedText,
    modelUsed: geminiResult?.modelUsed || userSelectedModel,
    isFormatFlawed,
  };
}
