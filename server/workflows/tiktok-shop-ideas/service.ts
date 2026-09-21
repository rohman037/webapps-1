import { sanitizeCaptionsAndHashtags } from '@/server/core/utils/sanitizer';
import { recordExecutionAndUpgrade } from '@/server/core/state/serverState';
import { logger } from '@/src/utils/logger';
import { GenerateTikTokShopIdeasOptions } from './types';
import { extractIdentityAnchor } from './agents/identity-anchor-agent';
import { enrichProductLink } from './agents/link-enricher-agent';
import { classifyKeywordIntent } from './agents/keyword-classifier-agent';
import { generateShopContent } from './agents/content-generator-agent';
import { refineShopCopy } from './agents/copy-refiner-agent';
import { validateShopIdeasOutput, isNewClipFormat } from './validators/quality-validator';

export * from './types';

export async function generateTikTokShopIdeasService(options: GenerateTikTokShopIdeasOptions) {
  const {
    shopUrl = '',
    productDetails = '',
    numIdeas = 3,
    totalDuration = '60',
    promptSplitSec = '10',
    referenceImageBase64 = '',
    referenceImageMimeType = '',
    model,
    customApiKey,
    clientAccessCode,
    onProgress,
  } = options;

  const trimmedShopUrl = typeof shopUrl === 'string' ? shopUrl.trim() : '';

  if (!trimmedShopUrl && !referenceImageBase64) {
    throw new Error('Link TikTok Shop wajib diisi (atau unggah foto produk).');
  }

  const totalIdeas = Math.min(5, Math.max(1, Number(numIdeas) || 3));
  const maxSecNum = parseInt(totalDuration, 10) || 60;

  let segSecNum = 6;
  if (promptSplitSec === '4') segSecNum = 4;
  else if (promptSplitSec === '6') segSecNum = 6;
  else if (promptSplitSec === '8') segSecNum = 8;
  else if (promptSplitSec === '10') segSecNum = 10;
  else if (promptSplitSec === '15') segSecNum = 15;
  else if (promptSplitSec === 'auto') segSecNum = Math.max(4, Math.ceil(maxSecNum / 4));
  else segSecNum = Math.max(3, parseInt(promptSplitSec, 10) || 6);

  const expectedClipsCount = Math.ceil(maxSecNum / segSecNum);

  // STAGE 2: IDENTITY ANCHOR & STAGE 3: LINK ENRICHER
  const [identityAnchorDescription, linkData] = await Promise.all([
    extractIdentityAnchor({
      referenceImageBase64,
      referenceImageMimeType,
      model,
      customApiKey,
      clientAccessCode,
    }),
    enrichProductLink({
      shopUrl: trimmedShopUrl,
    }),
  ]);

  if (onProgress) onProgress(30);

  const { enrichedInfo, enrichedProductName } = linkData;

  const derivedProductName =
    enrichedProductName ||
    (productDetails ? productDetails.slice(0, 80) : '') ||
    (trimmedShopUrl ? trimmedShopUrl.split('/').pop()?.replace(/[-_]/g, ' ') : '') ||
    'Produk TikTok Shop';

  // STAGE 4: KEYWORD INTENT CLASSIFIER
  const { classifiedKeywords, ideasHookAssignments } = await classifyKeywordIntent({
    derivedProductName,
    productDetails,
    enrichedInfo,
    totalIdeas,
    model,
    customApiKey,
    clientAccessCode,
  });

  if (onProgress) onProgress(55);

  // STAGE 5 & 6: CONTENT GENERATOR
  const generated = await generateShopContent({
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
  });

  if (onProgress) onProgress(65);

  let currentGeneratedText = generated.text;

  // STAGE 7: QUALITY VALIDATOR
  logger.info('[TikTok Shop Pipeline] Validating generated content output...');
  let validationResult = validateShopIdeasOutput(currentGeneratedText, !!identityAnchorDescription);

  // STAGE 7.5: COPY REFINER
  currentGeneratedText = await refineShopCopy({
    currentGeneratedText,
    model,
    customApiKey,
    clientAccessCode,
  });
  validationResult = validateShopIdeasOutput(currentGeneratedText, !!identityAnchorDescription);

  // STAGE 8: FINALIZE & SANITIZATION
  const cleanResultText = sanitizeCaptionsAndHashtags(currentGeneratedText);

  const warnings: string[] = [];
  if (validationResult.status === 'rejected') {
    warnings.push(
      `Output belum lolos validasi penuh (Skor: ${validationResult.score}%): ${validationResult.failures.join(', ')}`
    );
  }
  if (generated.isFormatFlawed || !isNewClipFormat(cleanResultText)) {
    warnings.push('Format klip belum sempurna, silakan generate ulang jika label Visual/Aksi belum lengkap');
  }

  recordExecutionAndUpgrade('contentIdeas');

  return {
    success: true,
    result: cleanResultText,
    text: cleanResultText,
    modelUsed: generated.modelUsed,
    warnings,
    validationScore: validationResult.score,
  };
}
