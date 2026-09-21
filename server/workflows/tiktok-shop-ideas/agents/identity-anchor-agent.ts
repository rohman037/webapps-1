import { callGeminiWithFallback } from '@/server/core/llm/geminiGateway';
import { normalizeGeminiModel } from '@/server/core/llm/routing/modelRouter';
import { logger } from '@/src/utils/logger';
import { IDENTITY_ANCHOR_USER_PROMPT } from '../prompts/identity-anchor';
import { IdentityAnchorInput } from '../types';

export async function extractIdentityAnchor(input: IdentityAnchorInput): Promise<string> {
  const { referenceImageBase64, referenceImageMimeType, model, customApiKey, clientAccessCode } = input;

  if (!referenceImageBase64) return '';

  try {
    logger.info('[identity-anchor-agent] Extracting identity anchor from reference image | tier=tier2');
    const anchorPayload = {
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: referenceImageMimeType || 'image/jpeg',
              data: referenceImageBase64,
            },
          },
          {
            text: IDENTITY_ANCHOR_USER_PROMPT,
          },
        ],
      },
    };

    const anchorResult = await callGeminiWithFallback(
      model ? normalizeGeminiModel(model) : 'gemini-3.8-flash',
      anchorPayload,
      customApiKey,
      clientAccessCode,
      'tier2',
      'TikTok Shop Identity Anchor'
    );

    const extractedText = anchorResult?.text?.trim() || '';
    if (extractedText.length > 20) {
      logger.info('[identity-anchor-agent] Identity anchor extracted successfully.');
      return extractedText;
    }
  } catch (err) {
    logger.warn('[identity-anchor-agent] Identity Anchor failed or low confidence, proceeding without anchor:', err);
  }

  return '';
}
