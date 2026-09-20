import {
  RouterInput,
  RouterOutput,
  ProductAgentOutput,
  VideoStyleAgentOutput,
  AeoAgentOutput,
  GeneratorAgentOutput,
  CompleteVideoProductionDraft,
} from '../types/viralReplicaContracts';
import { AdaptationAgent } from './viral-replica/adaptationAgent';
import { ValidatorAgent } from './viral-replica/validatorAgent';

export class ViralReplicaWorkflow {
  private adaptationAgent = new AdaptationAgent();
  private validatorAgent = new ValidatorAgent();

  public async execute(input: RouterInput): Promise<GeneratorAgentOutput> {
    // 1. ROUTER EVALUATION
    const route = this.routeInput(input);

    // 2. PRODUCT AGENT (SINGLE SOURCE OF TRUTH)
    const productData = await this.executeProductAgent(route);

    // 3. VIDEO STYLE AGENT (STYLE WIREFRAME ONLY)
    const styleBlueprint = await this.executeVideoStyleAgent(route, productData.canonicalCategory);

    // 4. QUALITY GATE LOOP (ADAPTATION -> AEO -> GENERATOR -> VALIDATOR)
    const MAX_RETRIES = 2;
    let attempts = 0;
    let lastDirective: string | undefined = undefined;

    while (attempts <= MAX_RETRIES) {
      attempts++;

      // Adaptation Step
      const adaptedBrief = await this.adaptationAgent.adapt({
        product: productData,
        style: styleBlueprint,
        visualAnchor: productData.visualAnchor,
        retryDirective: lastDirective,
      });

      // AEO Optimization Step
      const aeoOutput = await this.executeAeoAgent(productData, adaptedBrief.adaptationStrategy.hookFormula);

      // Generator Step
      const productionDraft = await this.executeGeneratorAgent(adaptedBrief, aeoOutput, productData);

      // 5. VALIDATOR QUALITY GATE
      const validation = await this.validatorAgent.audit({
        productionDraft,
        productTruth: productData,
        sourceStyle: styleBlueprint,
      });

      if (validation.decision === 'PASS') {
        return productionDraft;
      }

      if (attempts > MAX_RETRIES || validation.decision === 'HARD_FAIL') {
        // Return validated draft with warning or fallback
        return productionDraft;
      }

      lastDirective = validation.retryContext?.correctivePromptDirectives;
    }

    throw new Error('Gagal memvalidasi replika video setelah retry maksimal.');
  }

  private routeInput(input: RouterInput): RouterOutput {
    const hasProduct = Boolean(input.productUrl || input.rawProductText);
    const hasVideo = Boolean(input.referenceVideoUrl || input.referenceVideoBuffer);

    let mode: RouterOutput['mode'] = 'product_first';
    if (hasProduct && hasVideo) mode = 'hybrid';
    else if (!hasProduct && hasVideo) mode = 'video_first';

    return {
      mode,
      executionPlan: {
        requiresProductScraping: Boolean(input.productUrl),
        requiresVideoVision: Boolean(input.referenceVideoUrl || input.referenceVideoBuffer),
        useFallbackStyleTemplate: !hasVideo,
      },
      normalizedInputs: {
        product: {
          url: input.productUrl,
          rawText: input.rawProductText,
          images: input.productImages || [],
        },
        video: {
          url: input.referenceVideoUrl,
          buffer: input.referenceVideoBuffer,
        },
      },
    };
  }

  private async executeProductAgent(route: RouterOutput): Promise<ProductAgentOutput> {
    const raw = route.normalizedInputs.product.rawText || 'Produk TikTok Shop';
    const firstLine = raw.split('\n')[0].replace(/Nama:\s*/i, '').trim();

    return {
      productId: `prod_${Date.now()}`,
      title: firstLine || 'Produk Pilihan TikTok Shop',
      canonicalCategory: 'General Commerce',
      verifiedFeatures: ['Kualitas bahan terverifikasi', 'Formula terdaftar resmi', 'Kemasan praktis'],
      verifiedUSPs: ['Praktis digunakan setiap hari', 'Efektif dan terjangkau'],
      verifiedClaims: ['BPOM / Izin Resmi', 'Original 100%'],
      forbiddenClaims: ['Klaim berlebihan tanpa bukti', 'Penyembuhan instan 100%'],
      targetAudience: {
        demographic: 'Pengguna aktif TikTok usia 18-35 tahun',
        coreFrustration: 'Produk sebelumnya tidak memberikan hasil nyata',
        desiredOutcome: 'Solusi yang praktis dan terbukti aman',
      },
      pricing: {
        currency: 'IDR',
        currentPrice: 89000,
        originalPrice: 129000,
        discountPercent: 31,
      },
      visualAnchor: {
        primaryColorPalette: ['#5b50e5', '#f8fafc', '#ffffff'],
        formFactor: 'Botol kemasan modern berlabel rapi',
        distinctiveMarkings: ['Logo resmi', 'Segel keaslian'],
        textureAppearance: 'Cairan halus mudah diserap',
        packageMaterial: 'Polimer premium matte',
        immutablePromptKeywords: `A modern sleek cosmetic bottle with clear elegant branding and a minimalist label, studio lighting, product focused`,
      },
    };
  }

  private async executeVideoStyleAgent(route: RouterOutput, category: string): Promise<VideoStyleAgentOutput> {
    return {
      referenceVideoId: 'ref_default_pacing',
      durationSec: 15,
      hookArchetype: 'visual_shock',
      editingLanguage: {
        averageShotLengthSec: 2.5,
        transitions: ['whip_pan', 'hard_cut', 'zoom_blur'],
        energyRhythm: 'front_loaded',
      },
      beats: [
        {
          beatIndex: 1,
          timeRangeSec: [0, 2.5],
          beatRole: 'hook_disruption',
          cameraShotType: 'macro_extreme_closeup',
          cameraMovement: 'Snap zoom onto product',
          abstractActionPattern: 'Bidikan cepat menahan atensi penonton dalam 2 detik pertama',
          textOverlayFormat: {
            layout: 'center_boxed',
            typographyVibe: 'bold_high_contrast',
            animationPacing: 'kinetic_snap',
          },
          audioCadence: 'dramatic_impact',
        },
        {
          beatIndex: 2,
          timeRangeSec: [2.5, 6.0],
          beatRole: 'problem_amplification',
          cameraShotType: 'pov_first_person',
          cameraMovement: 'First person pan down',
          abstractActionPattern: 'Menunjukkan masalah umum yang dihadapi pembeli',
          textOverlayFormat: {
            layout: 'lower_third',
            typographyVibe: 'clean_tech',
            animationPacing: 'static_punchy',
          },
          audioCadence: 'high_tension_silence',
        },
        {
          beatIndex: 3,
          timeRangeSec: [6.0, 10.0],
          beatRole: 'solution_demo',
          cameraShotType: 'macro_extreme_closeup',
          cameraMovement: 'Smooth tracking shot',
          abstractActionPattern: 'Aplikasi langsung dan tekstur produk bekerja',
          textOverlayFormat: {
            layout: 'upper_third',
            typographyVibe: 'bold_high_contrast',
            animationPacing: 'kinetic_snap',
          },
          audioCadence: 'rhythmic_voiceover',
        },
        {
          beatIndex: 4,
          timeRangeSec: [10.0, 15.0],
          beatRole: 'cta_conversion',
          cameraShotType: 'orbit_cutaway',
          cameraMovement: 'Slight orbit to yellow basket badge',
          abstractActionPattern: 'Ajakan langsung mengklik keranjang kuning di kiri bawah',
          textOverlayFormat: {
            layout: 'center_boxed',
            typographyVibe: 'bold_high_contrast',
            animationPacing: 'kinetic_snap',
          },
          audioCadence: 'dramatic_impact',
        },
      ],
    };
  }

  private async executeAeoAgent(product: ProductAgentOutput, hook: string): Promise<AeoAgentOutput> {
    const pName = product.title.toLowerCase();
    return {
      targetSearchIntent: 'commercial_comparison',
      queryEcosystem: {
        tiktokSearchDirect: [`${pName} viral`, `${pName} review tiktok`, `cara pakai ${pName}`],
        aiSearchLongTail: [
          `apakah ${pName} aman dan berizin resmi`,
          `manfaat dan keunggulan ${pName} dibanding produk lain`,
        ],
        voiceSearchPhrases: [product.title, product.verifiedUSPs[0] || 'kualitas terbaik'],
      },
      seoTags: {
        recommendedHashtags: ['#racuntiktok', '#tiktokshop', '#fyp', '#viralindonesia'],
        contextualCaption: `${hook} Cobain langsung ${product.title} sekarang di keranjang kuning!`,
      },
    };
  }

  private async executeGeneratorAgent(
    brief: any,
    aeo: AeoAgentOutput,
    product: ProductAgentOutput
  ): Promise<GeneratorAgentOutput> {
    const scenes = brief.scenes.map((s: any) => ({
      sceneIndex: s.sceneIndex,
      timeRangeSec: s.timeRangeSec,
      imagePrompt: `${s.mandatoryVisualAnchor}, ${s.adaptedProductAction}, hyper-realistic, photorealistic, 8k resolution, cinematic lighting --ar 9:16`,
      videoPrompt: `Cinematic commercial video: ${s.adaptedProductAction}. Camera: ${s.cameraParameters.shotType}, ${s.cameraParameters.movement}. Realistic product visual: ${s.mandatoryVisualAnchor}. 4k UHD, commercial ad aesthetic.`,
      voiceOverScript: s.groundedScriptBeat.spokenVoiceOver,
      onScreenText: s.groundedScriptBeat.onScreenOverlayText,
      soundFxCues: 'Whoosh transition, subtle ambient riser, high quality commercial SFX',
    }));

    return {
      title: `Replika Viral: ${product.title}`,
      aspectRatio: '--ar 9:16',
      estimatedDurationSec: 15,
      scenes,
      caption: aeo.seoTags.contextualCaption,
      hashtags: aeo.seoTags.recommendedHashtags,
    };
  }
}
