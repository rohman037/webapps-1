import { validateShopIdeasOutput, isNewClipFormat } from '../validator';

export { validateShopIdeasOutput, isNewClipFormat };

export interface OutputValidationResult {
  passed: boolean;
  score: number;
  failures: string[];
  needsRefine: boolean;
}

export function validateOutput(
  rawText: string,
  enrichedInfo?: any,
  hasAnchor?: boolean
): OutputValidationResult {
  const result = validateShopIdeasOutput(rawText, Boolean(hasAnchor));
  const hashtagCount = (rawText.match(/#[a-zA-Z0-9_\u0590-\u05ff\u0600-\u06ff\u0e00-\u0e7f]+/g) || []).length;
  const hasCaption = /Draft\s*Caption/i.test(rawText);
  const needsRefine = !hasCaption || hashtagCount < 3 || result.status === 'rejected';

  return {
    passed: result.status === 'passed',
    score: result.score,
    failures: result.failures,
    needsRefine,
  };
}
