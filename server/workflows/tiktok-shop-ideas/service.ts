import { sanitizeCaptionsAndHashtags } from '@/server/workflows/shared/sanitizer';
import { recordExecutionAndUpgrade } from '@/server/core/state/serverState';
import { logger } from '@/server/core/utils/logger';
import { GenerateTikTokShopIdeasOptions } from './types';
import { extractIdentityAnchor, analyzeIdentityAnchor } from './agents/identity-anchor';
import { enrichProductLink } from './agents/link-enricher';
import { classifyKeywordIntent } from './agents/keyword-classifier';
import { generateShopContent, generateContent } from './agents/content-generator';
import { refineShopCopy, refineCopy } from './agents/copy-refiner';
import { validateOutput, validateShopIdeasOutput, isNewClipFormat } from './validators/output-validator';

export * from './types';
export {
  analyzeIdentityAnchor,
  enrichProductLink,
  classifyKeywordIntent,
  generateContent,
  refineCopy,
  validateOutput,
};

export async function runTikTokShopIdeasPipeline(input: any) {
  const shopUrl = input?.shopUrl || input?.url || '';
  const referenceImageBase64 = input?.referenceImageBase64 || '';
  const referenceImageMimeType = input?.referenceImageMimeType || 'image/jpeg';
  const settings = input?.settings || {
    totalIdeas: input?.numIdeas || 3,
    maxSecNum: parseInt(input?.totalDuration || '60', 10),
    segSecNum: parseInt(input?.promptSplitSec || '6', 10) || 6,
    expectedClipsCount: Math.ceil(
      (parseInt(input?.totalDuration || '60', 10) || 60) /
      (parseInt(input?.promptSplitSec || '6', 10) || 6)
    ),
  };

  // CALL 1: Identity Anchor (conditional)
  const identityAnchor = referenceImageBase64
    ? await analyzeIdentityAnchor(
        referenceImageBase64,
        referenceImageMimeType,
        input?.model,
        input?.customApiKey,
        input?.clientAccessCode
      )
    : null;

  // CALL 2: Link Enrichment
  const enrichedInfo = await enrichProductLink(shopUrl);

  // CALL 3: Keyword Intent
  const keywordIntent = await classifyKeywordIntent({
    derivedProductName: enrichedInfo.enrichedProductName || input?.productDetails || 'Produk TikTok Shop',
    productDetails: input?.productDetails || '',
    enrichedInfo: enrichedInfo.enrichedInfo,
    totalIdeas: settings.totalIdeas || 3,
    model: input?.model,
    customApiKey: input?.customApiKey,
    clientAccessCode: input?.clientAccessCode,
  });

  // CALL 4: Content Generator
  const output = await generateContent({
    identityAnchor,
    enrichedInfo,
    keywordIntent,
    settings,
    productDetails: input?.productDetails,
    referenceImageBase64,
    referenceImageMimeType,
    model: input?.model,
    customApiKey: input?.customApiKey,
    clientAccessCode: input?.clientAccessCode,
  });

  // Validator
  const validation = validateOutput(output, enrichedInfo, Boolean(identityAnchor));

  // CALL 5: Copy Refiner (conditional)
  const final = validation.needsRefine
    ? await refineCopy(output, validation, input?.model, input?.customApiKey, input?.clientAccessCode)
    : output;

  const sanitized = sanitizeCaptionsAndHashtags(final);

  return {
    markdown: sanitized,
    result: sanitized,
    text: sanitized,
    validation,
    enrichedInfo,
  };
}

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
