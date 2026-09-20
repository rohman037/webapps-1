import {
  ValidatorAgentInput,
  ValidatorAgentOutput,
} from '@/src/types/viralReplicaContracts';

const SLOP_PHRASES = [
  'apakah anda tahu',
  'tahukah anda',
  'tahukah kamu',
  'mari kita bahas',
  'di era modern ini',
  'solusi revolusioner',
  'tidak diragukan lagi',
  'simak selengkapnya',
];

export class ValidatorAgent {
  public async audit(input: ValidatorAgentInput): Promise<ValidatorAgentOutput> {
    const { productionDraft, productTruth } = input;

    const unauthorizedClaims: string[] = [];
    const missingAnchorScenes: number[] = [];
    const leakedReferenceTerms: string[] = [];
    const detectedSlop: string[] = [];

    const anchorKeywordSnippet = productTruth.visualAnchor.immutablePromptKeywords.slice(0, 20).toLowerCase();

    productionDraft.scenes.forEach((scene) => {
      // 1. Identity Anchor Check
      const combinedPrompt = `${scene.imagePrompt} ${scene.videoPrompt}`.toLowerCase();
      if (!combinedPrompt.includes(anchorKeywordSnippet)) {
        missingAnchorScenes.push(scene.sceneIndex);
      }

      // 2. Anti-AI-Slop Voiceover Check
      const voLower = scene.voiceOverScript.toLowerCase();
      SLOP_PHRASES.forEach((phrase) => {
        if (voLower.includes(phrase)) {
          detectedSlop.push(`Scene ${scene.sceneIndex}: "${phrase}"`);
        }
      });

      // 3. Forbidden Claims Check
      productTruth.forbiddenClaims.forEach((forbidden) => {
        if (voLower.includes(forbidden.toLowerCase())) {
          unauthorizedClaims.push(`Forbidden claim detected: "${forbidden}" in Scene ${scene.sceneIndex}`);
        }
      });
    });

    const isHallucinationFree = unauthorizedClaims.length === 0;
    const isIdentityConsistent = missingAnchorScenes.length === 0;
    const isSlopFree = detectedSlop.length === 0;

    const passed = isHallucinationFree && isIdentityConsistent && isSlopFree;
    const confidenceScore = passed ? 1.0 : 0.65;

    let retryDirective: ValidatorAgentOutput['retryContext'] = undefined;
    if (!passed) {
      const issues: string[] = [];
      if (!isHallucinationFree) issues.push(`Klaim terlarang: ${unauthorizedClaims.join(', ')}`);
      if (!isIdentityConsistent) issues.push(`Scene tanpa Identity Anchor: ${missingAnchorScenes.join(', ')}`);
      if (!isSlopFree) issues.push(`AI-Slop terdeteksi: ${detectedSlop.join(', ')}`);

      retryDirective = {
        targetAgent: !isHallucinationFree ? 'AdaptationAgent' : 'GeneratorAgent',
        correctivePromptDirectives: `Perbaiki pelanggaran berikut: ${issues.join(' | ')}. Pastikan 100% patuh pada data produk.`,
      };
    }

    return {
      decision: passed ? 'PASS' : 'RETRY_REQUIRED',
      confidenceScore,
      checklist: {
        zeroHallucinationCheck: {
          passed: isHallucinationFree,
          unauthorizedClaimsFound: unauthorizedClaims,
        },
        visualIdentityCheck: {
          passed: isIdentityConsistent,
          missingAnchorScenes,
        },
        brandLeakCheck: {
          passed: leakedReferenceTerms.length === 0,
          leakedReferenceTerms,
        },
        slopVoiceOverCheck: {
          passed: isSlopFree,
          detectedSlopPhrases: detectedSlop,
        },
      },
      retryContext: retryDirective,
    };
  }
}
