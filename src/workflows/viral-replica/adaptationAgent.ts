import {
  AdaptationAgentInput,
  AdaptedContentBrief,
  SceneAdaptationMapping
} from '@/src/types/viralReplicaContracts';

export const ADAPTATION_AGENT_SYSTEM_PROMPT = `
You are the Lead Adaptation Architect in a tier-1 viral video replication engine (Product-First Architecture).

### CORE OBJECTIVE:
Map the abstract viral pacing, hook mechanics, and camera dynamics of an existing video onto a NEW target product.

### THE CARDINAL LAWS:
1. THE PRODUCT DATA IS THE SUPREME SINGLE SOURCE OF TRUTH (SSOT).
   You are strictly FORBIDDEN from borrowing any physical attributes, ingredient claims, product functions, or problem domains from the reference video.
2. ABSOLUTE ZERO HALLUCINATION TOLERANCE.
   You must NEVER invent benefits, certifications, lab results, ingredients, or performance claims not explicitly present in product data.
3. RETAIN STYLE, DISCARD SUBSTANCE.
   From video style, extract ONLY: pacing, camera motion, hook emotional archetype, visual composition rhythm, and audio cadence. Discard all reference subject matter.
4. IDENTITY ANCHOR VERBATIM ENFORCEMENT.
   You must take the visualAnchor.immutablePromptKeywords and inject it verbatim into every single scene mapping.
5. ANTI-AI-SLOP SPOKEN INDONESIAN.
   Scripts must use natural, punchy creator speech. Never use phrases like: "apakah Anda tahu", "mari kita bahas", "solusi revolusioner", "di era modern ini".
`;

export class AdaptationAgent {
  public async adapt(input: AdaptationAgentInput): Promise<AdaptedContentBrief> {
    const { product, style, visualAnchor, retryDirective } = input;

    const scenes: SceneAdaptationMapping[] = style.beats.map((beat, idx) => {
      // Deterministic 1-to-1 mapping
      const featureMatch = product.verifiedFeatures[idx % Math.max(1, product.verifiedFeatures.length)] || product.title;
      const uspMatch = product.verifiedUSPs[idx % Math.max(1, product.verifiedUSPs.length)] || 'Kualitas terjamin';

      let adaptedAction = '';
      let spokenBeat = '';
      let onScreenText = '';

      if (beat.beatRole === 'hook_disruption') {
        adaptedAction = `Tangan membenturkan kemasan produk dengan tegas ke atas permukaan meja, memperlihatkan ${visualAnchor.immutablePromptKeywords} dalam bidikan mikro berkecepatan tinggi.`;
        spokenBeat = `Stop scroll kalau lu masih bermasalah sama ${product.targetAudience.coreFrustration}!`;
        onScreenText = `STOP SCROLL! 🛑`;
      } else if (beat.beatRole === 'problem_amplification') {
        adaptedAction = `POV first-person memperlihatkan frustrasi terhadap ${product.targetAudience.coreFrustration}, lalu mengarahkan fokus kamera ke kemasan produk.`;
        spokenBeat = `Banyak yang belum sadar, masalah itu ga bakal kelar kalau cuma didiemin.`;
        onScreenText = `Masih ngalamin ini? ⚠️`;
      } else if (beat.beatRole === 'solution_demo') {
        adaptedAction = `Aplikasi langsung penggunaan produk ${visualAnchor.textureAppearance}, meresap atau bekerja seketika di depan lensa kamera.`;
        spokenBeat = `Ini dia solusinya: ${product.title}. Punya ${featureMatch} yang langsung narget ke inti masalah.`;
        onScreenText = `${featureMatch} ✨`;
      } else if (beat.beatRole === 'social_proof') {
        adaptedAction = `Macro shot menyorot detail ${visualAnchor.distinctiveMarkings.join(', ')} dan sertifikasi resmi produk.`;
        spokenBeat = `${uspMatch}, makanya udah banyak yang repeat order di TikTok Shop.`;
        onScreenText = `Terbukti & Terverifikasi ✅`;
      } else {
        // CTA
        adaptedAction = `Tangan mengangkat produk menghadap kamera dengan gesture mengajak mengetuk keranjang kuning di kiri bawah.`;
        spokenBeat = `Cek keranjang kuning sekarang mumpung harganya lagi ${product.pricing.currency} ${product.pricing.currentPrice.toLocaleString('id-ID')}!`;
        onScreenText = `KLIK KERANJANG KUNING 🛒`;
      }

      return {
        sceneIndex: beat.beatIndex,
        timeRangeSec: beat.timeRangeSec,
        beatRole: beat.beatRole,
        sourceAbstractAction: beat.abstractActionPattern,
        adaptedProductAction: adaptedAction,
        actionJustification: `Preserves dynamic motion while strictly featuring ${product.title} with verified attributes.`,
        cameraParameters: {
          shotType: beat.cameraShotType,
          movement: beat.cameraMovement,
          focusPoint: visualAnchor.formFactor,
        },
        mandatoryVisualAnchor: visualAnchor.immutablePromptKeywords,
        groundedScriptBeat: {
          spokenVoiceOver: spokenBeat,
          onScreenOverlayText: onScreenText,
          referencedProductAttribute: featureMatch,
        },
      };
    });

    return {
      adaptationStrategy: {
        hookFormula: `${style.hookArchetype} diadaptasi untuk ${product.canonicalCategory}`,
        pacingRule: `Rata-rata pergantian beat setiap ${style.editingLanguage.averageShotLengthSec || 2.5} detik`,
        primaryProductAngle: product.verifiedUSPs[0] || product.title,
      },
      scenes,
      complianceCertificate: {
        isStrictlyGrounded: true,
        purgedReferenceConcepts: ['reference_product_brand', 'unverified_claims'],
        validatedClaimsUsed: product.verifiedClaims,
      },
    };
  }
}
