import crypto from 'crypto';
import { callGeminiWithFallback } from '@/server/core/llm/geminiGateway';
import { promptResponseCache, PROMPT_CACHE_TTL_MS } from '@/server/core/state/serverState';
import { normalizeGeminiModel } from '@/server/core/llm/routing/modelRouter';
import { runStructuredPromptArchitect, isStructureSchemaConsistent } from './agent';
import { logger } from '@/server/core/utils/logger';

export interface GeneratePhotoPromptOptions {
  mimeType: string;
  base64Data: string;
  model?: string;
  targetGenerator?: string;
  photoStyle?: string;
  aspectRatio?: string;
  negativePrompt?: string;
  referenceImageBase64?: string;
  referenceImageMimeType?: string;
  analysisMode?: string;
  ultraDetail?: boolean;
  isUltra?: boolean;
  mode?: string;
  customApiKey?: string;
  clientAccessCode?: string;
  useCache?: boolean;
}

export async function generatePhotoPromptService(options: GeneratePhotoPromptOptions) {
  const {
    mimeType,
    base64Data,
    model,
    targetGenerator = 'nanobananapro',
    photoStyle = 'commercial',
    aspectRatio = '--ar 16:9',
    negativePrompt,
    referenceImageBase64,
    referenceImageMimeType,
    analysisMode,
    ultraDetail,
    isUltra,
    mode,
    customApiKey,
    clientAccessCode,
    useCache = true,
  } = options;

  if (!base64Data || !mimeType) {
    throw new Error('Data gambar/teks dan tipe MIME diperlukan');
  }

  const isUserExplicitChoice = Boolean(model && typeof model === 'string' && model.trim() && model !== 'auto');
  const userSelectedModel = (!model || model === 'auto') ? undefined : normalizeGeminiModel(model);

  if (useCache) {
    const cacheModelId = userSelectedModel || 'auto_routed';
    const cacheInput = `photo_${mimeType}_${base64Data.slice(0, 500)}_${base64Data.length}_${cacheModelId}_${targetGenerator}_${photoStyle}_${aspectRatio}_${negativePrompt || ''}_${referenceImageBase64 ? referenceImageBase64.slice(0, 500) : ''}`;
    const cacheKey = crypto.createHash('sha256').update(cacheInput).digest('hex');
    const cached = promptResponseCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < PROMPT_CACHE_TTL_MS) {
      logger.info('[Photo Prompt Cache Hit - Saved Quota]', cacheKey);
      return {
        prompt: cached.text,
        modelUsed: cached.modelUsed,
        tierUsed: (cached as any).tierUsed || 'cached',
        promptArchitect: cached.promptArchitect,
        cached: true,
      };
    }
  }

  const promptText = `Anda adalah Master Director of Photography (DoP) Sinematik Global, Ahli Algoritma Visual TikTok FYP, dan Spesialis Multimodal Google SEO / AEO (Answer Engine Optimization) & Entity Search.

TUGAS UTAMA:
Analisis secara SUPER PRESISI input gambar atau teks konsep dari pengguna, lalu transformasikan menjadi Master Prompt AI Image Generator (Midjourney v6.1 / Flux.1 / DALL-E 3) yang memiliki RELEVANSI TINGGI, REKAYASA SCENE MENDALAM, VISUAL HOOK TIKTOK KUAT, dan MEMENUHI STANDAR MULTIMODAL GOOGLE SEARCH / AEO TERBARU.

DETEKSI MODE INPUT:
1. JIKA INPUT BERISI RINCIAN MULTI-KLIP SEKALIGUS (MULTI-CLIP / BATCH SCENE BREAKDOWN):
   (Contoh: Naskah TikTok Shop, Ide Konten, atau Video to Prompt dengan klip 1 s/d N seperti [00:00 - 00:10] Klip 1, Klip 2, Klip 3, dst.):
   - ATURAN JUMLAH KLIP (WAJIB & STRICT): Jika di input ada N klip (misal 3 klip), Anda WAJIB menghasilkan TEPAT N prompt foto terpisah (Klip 1, Klip 2, s/d Klip N). Jangan kurangi dan jangan gabungkan!
   - ATURAN KONEKTIVITAS & KESELARASAN NASKAH VIDEO (STORYLINE & SCRIPT CONTINUITY):
     * Setiap prompt foto per klip harus selaras 100% dengan naskah adegan dan voice-over video pada klip tersebut (Klip 1 = Hook awal visual, Klip 2 = Eksplorasi masalah/fitur/demo produk, Klip 3 = Solusi/CTA/Closing).
     * Seluruh prompt foto (Klip 1, 2, 3...) WAJIB SALING TERHUBUNG (CONNECTED):
       1. Konsistensi Karakter & Talent: Wajah, etnisitas, warna & model rambut, usia, dan ciri fisik subjek HARUS 100% IDENTIK dan disebutkan secara konsisten di semua prompt klip.
       2. Konsistensi Busana & Wardrobe: Pakaian, warna baju, aksesoris, sepatu, dan gaya busana HARUS SAMA & KONSISTEN di setiap prompt klip.
       3. Konsistensi Produk & Packaging: Bentuk produk, warna, label, dan tekstur produk HARUS SAMA PERSIS di setiap klip.
       4. Kesatuan Sinematografi: Palet warna ambient dan gaya pencahayaan menyatu harmonis antar klip.
   - Gunakan format header klip: "### 🎬 KLIP [X] ([TIMESTAMP]) — [JUDUL / FOKUS ADEGAN]" untuk setiap klip.
   - Setiap klip memiliki blok prompt code (\`\`\`text ... \`\`\`) yang berdiri sendiri, lengkap dengan target aspect ratio ${aspectRatio} --style raw --v 6.1, dan SIAP SALIN (1-click copy).

2. JIKA INPUT BERUPA SATU KONSEP TUNGGAL / SINGLE PHOTO:
   - Bedah secara semantik seluruh konteks cerita, subjek inti, aktivitas, lokasi spesifik, mood emosional, dan detail prop.
   - Terapkan pemetaan entitas (Google AEO): sebutkan material nyata, nama arsitektur/setting, dan kondisi atmosfer yang jelas.
   - Bangun visual hook 3-detik pertama untuk TikTok.

3. JIKA INPUT BERUPA FOTO REFERENSI (IMAGE):
   - Lakukan dekonstruksi visual mendalam: identifikasi anatomi wajah, gaya rambut, busana, sudut kamera, arah & temperatur cahaya, palet warna, dan latar belakang.
   - Pertahankan identitas visual dan esensi komposisi referensi dengan resolusi sinematik 8K dan tekstur fotorealistik murni.

PARAMETER TEKNIS FOTOGRAFI WAJIB:
- Tipe Kamera & Lensa: (Contoh: Shot on Hasselblad H6D-100c / Sony A7R V / Arri Alexa LF, Zeiss Master Prime 85mm f/1.2 atau 35mm f/1.4).
- Pencahayaan: (Contoh: Volumetric golden hour side lighting, softbox diffusion at 45 degrees, subtle blue rim lighting, ray-traced reflections).
- Detail Tekstur: (Contoh: Ultra-detailed skin texture, authentic fabric weave, natural specular reflections, sharp edge definition).
- Target Aspect Ratio: ${aspectRatio}
- Preset Gaya: ${photoStyle.toUpperCase()}

FORMAT OUTPUT:
JIKA SINGLE PROMPT:
### 📸 TIKTOK-OPTIMIZED AI PROMPT (SUPER REALISTIS & SIAP COPY)
\`\`\`text
[Master Shot]: Hyper-realistic ${photoStyle} photography, TikTok FYP visual hook aesthetic, Google AEO high-relevance semantic framing.
[Subject & Identity]: [Deskripsi super spesifik subjek: usia, fitur wajah otentik, ekspresi mikro yang menarik perhatian, pose dinamis, busana & tekstur bahan detail].
[Scene Context & Environment]: [Latar belakang storytelling kaya entitas, detail arsitektur/ruang, elemen pendukung, kedalaman spasial sinematik].
[Lighting & Atmospheric Physics]: [Pencahayaan presisi: arah key light, soft fill, subtle rim light, temperatur warna ambient, volumetric rays, bayangan lembut].
[Camera, Optics & Composition]: [Kamera profesional, panjang lensa (focal length), aperture f-stop ultra-lebar, fokus tajam pada subjek, natural optical depth of field / creamy bokeh].
[Texture & Rendering Quality]: 8k UHD resolution, raw authentic documentary photo, natural micro skin pores, fabric threading, zero artificial airbrushing, photorealistic raytraced reflections, ${aspectRatio} --style raw --v 6.1
\`\`\`

---

### 🔍 ANALISIS MENDALAM RELEVANSI SCENE & ALGORITMA
- **🎯 Konteks Scene & Semantic Entity (Google SEO/AEO)**: [Penjelasan entitas subjek, lokasi, material].
- **⚡ TikTok Visual Hook (3-Second Retention)**: [Analisis elemen visual utama].
- **💡 Pencahayaan, Optik & Komposisi Kamera**: [Setup teknis].
- **🎨 Color Grading & Tekstur Otentik**: [Palet warna sinematik].

JIKA MULTI-KLIP (BATCH CLIPS):
### 🎬 KLIP 1 (00:00 - 00:10) — [HOOK VISUAL PEMBUKA]
\`\`\`text
[Master Shot]: Hyper-realistic ${photoStyle} photography, TikTok hook scene 1, [Deskripsi adegan visual klip 1 sesuai script]...
[Subject & Identity]: [Deskripsi subjek / talent spesifik, wajah, rambut, postur tubuh, busana/wardrobe lengkap]...
[Scene Context & Environment]: [Setting lokasi klip 1, supermarket/toko/kamar/jalanan sesuai naskah]...
[Lighting & Physics]: [Key light, soft volumetric ambient, natural shadows]...
[Camera & Optics]: [Lensa, focal length, angle kamera]...
[Texture & Quality]: 8k UHD resolution, photorealistic micro details, ${aspectRatio} --style raw --v 6.1
\`\`\`

---

### 🔍 ANALISIS MENDALAM RELEVANSI KONTEN & KONSISTENSI VISUAL BATCH
- **🎯 Konsistensi Karakter & Produk**: [Penjelasan bagaimana identitas subjek, pakaian, dan produk dijaga 100% konsisten dari klip 1 hingga klip akhir].
- **⚡ Keselarasan Naskah & Visual Hook**: [Bagaimana setiap prompt foto menguatkan cerita naskah video dari hook awal hingga CTA].
- **💡 Rekomendasi Prompt Generator**: [Saran model gambar terbaik seperti Midjourney v6.1, Flux.1, atau Ideogram v2].`;

  let extendedPromptText = promptText;
  if (negativePrompt && negativePrompt.trim()) {
    extendedPromptText += `\n\nTAMBAHKAN TAG NEGATIVE PROMPT PADA AKHIR BLOK: [Negative Prompt]: ${negativePrompt.trim()}`;
  }

  let promptPayload: any = {
    contents: {
      parts: []
    },
    config: {
      systemInstruction: "You are the world's leading Director of Photography, TikTok Visual Hook Strategist, and Google AEO Multimodal SEO Specialist. Generate highly precise, hyper-realistic AI image prompts with deep scene comprehension, authentic camera physics, and complete visual algorithm compliance.",
    }
  };

  if (mimeType === 'text/plain') {
    const rawUserText = Buffer.from(base64Data, 'base64').toString('utf-8');
    promptPayload.contents.parts.push({
      text: `BERIKUT DESKRIPSI / KONSEP FOTO INPUT DARI USER:\n"""\n${rawUserText}\n"""\n\nTUGAS UTAMA ANDA:\n${extendedPromptText}`
    });

    if (referenceImageBase64 && referenceImageMimeType) {
      promptPayload.contents.parts.push({
        text: `\n\nIni adalah IDENTITY ANCHOR REFERENCE IMAGE opsional yang diberikan user:`
      });
      promptPayload.contents.parts.push({
        inlineData: {
          mimeType: referenceImageMimeType,
          data: referenceImageBase64,
        },
      });
    }
  } else {
    promptPayload.contents.parts.push({
      inlineData: {
        mimeType: mimeType,
        data: base64Data,
      },
    });
    promptPayload.contents.parts.push({
      text: extendedPromptText,
    });
  }

  const hasImageMedia = Boolean(
    (mimeType && mimeType.startsWith('image/')) ||
    referenceImageBase64
  );
  const isUltraMode = Boolean(
    ultraDetail ||
    isUltra ||
    mode === 'ultra' ||
    analysisMode === 'deep' ||
    analysisMode === 'ultra' ||
    (typeof photoStyle === 'string' && photoStyle.toLowerCase().includes('ultra'))
  );

  const photoTargetTier = (hasImageMedia || isUltraMode) ? 'flagship' : 'tier2';
  const photoToolName = isUltraMode ? 'Photo Prompt Ultra' : 'Photo Prompt';

  const result = await callGeminiWithFallback(
    userSelectedModel,
    promptPayload,
    customApiKey,
    clientAccessCode,
    photoTargetTier,
    photoToolName,
    isUserExplicitChoice,
    '/api/generate-photo-prompt'
  );

  let finalPromptText = result.text;
  let architectMetadata: any = undefined;

  try {
    const architectResult = await runStructuredPromptArchitect(
      result.text,
      targetGenerator || photoStyle || 'general'
    );
    architectMetadata = architectResult;

    if (architectResult.isOptimized && isStructureSchemaConsistent(result.text, architectResult.finalPrompt)) {
      finalPromptText = architectResult.finalPrompt;
    } else if (architectResult.isOptimized) {
      logger.warn('[StructuredPromptArchitect] Photo prompt output failed structural schema consistency check, falling back to raw model draft.');
    }
  } catch (archErr) {
    logger.warn('[StructuredPromptArchitect] Photo prompt enhancement notice:', archErr);
  }

  if (useCache) {
    const cacheModelId = userSelectedModel || 'auto_routed';
    const cacheInput = `photo_${mimeType}_${base64Data.slice(0, 500)}_${base64Data.length}_${cacheModelId}_${targetGenerator}_${photoStyle}_${aspectRatio}_${negativePrompt || ''}_${referenceImageBase64 ? referenceImageBase64.slice(0, 500) : ''}`;
    const cacheKey = crypto.createHash('sha256').update(cacheInput).digest('hex');
    promptResponseCache.set(cacheKey, {
      timestamp: Date.now(),
      text: finalPromptText,
      modelUsed: result.modelUsed,
      promptArchitect: architectMetadata
    });
  }

  return {
    prompt: finalPromptText,
    modelUsed: result.modelUsed,
    tierUsed: result.tierUsed,
    latencyMs: result.latencyMs,
    keyMasked: result.keyMasked,
    promptArchitect: architectMetadata,
  };
}
