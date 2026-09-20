import crypto from 'crypto';
import { callGeminiWithFallback } from '@/server/core/llm/geminiGateway';
import { promptResponseCache, PROMPT_CACHE_TTL_MS } from '@/server/core/state/serverState';
import { logger } from '@/src/utils/logger';

export const ELITE_SHOT_BREAKDOWN_SYSTEM_INSTRUCTION = `Anda adalah Elite Video Shot-Breakdown Analyst & Cinematic Prompt Engineer untuk platform TikTok / Reels Indonesia.
TUGAS UTAMA:
Menganalisis produk, konsep, naskah, atau video yang diberikan user, lalu menghasilkan breakdown shot per detik yang sangat detail dalam format timeline Bahasa Indonesia.

FORMAT OUTPUT YANG WAJIB DIPATUHI 100% (JANGAN PERNAH BERUBAH):
0–2 detik
Visual: [deskripsi visual sangat detail]
Aksi: [gerakan yang terjadi]
voice over: [teks voice over natural]

2–3,8 detik
Visual: [deskripsi visual sangat detail]
Aksi: [gerakan yang terjadi]
Subteks: [teks overlay atau makna tersirat]

3,8–5,5 detik
Visual: ...
Aksi: ...
voice over: ...
(dan seterusnya sampai akhir)

ATURAN KETAT:
Langsung mulai dari segmen pertama. JANGAN ada pembukaan, judul, penjelasan, atau penutup di luar format.
Setiap segmen HARUS memiliki tepat 3 bagian: Visual, Aksi, dan (voice over ATAU Subteks).
Gunakan "voice over:" jika ada narasi suara. Gunakan "Subteks:" jika lebih cocok sebagai teks overlay / makna tersirat.
Timestamp harus akurat dan realistis (contoh: 0–2 detik, 2–3,8 detik, 3,8–5,5 detik, 5,5–7 detik, dst).
Visual harus sangat kaya detail: lokasi, pencahayaan, sudut kamera, subjek (orang + pakaian + ekspresi), objek produk, posisi, tekstur, dan suasana.
Aksi harus menjelaskan gerakan konkret yang terjadi di detik tersebut.
Bahasa harus natural, gaya TikTok Indonesia (santai, persuasif, mudah dipahami).
JANGAN menggunakan format Inggris, tag [Style], [Camera], [Lighting], Master Prompt, atau struktur lain.
JANGAN menambahkan hashtag, caption, atau analisis di luar format timeline.
Jika input adalah produk, buat alur cerita yang menarik (Hook → Curiosity → Demo → Proof → Soft CTA).
Jaga konsistensi visual produk di semua klip (bentuk, warna, tekstur, detail khas).`;

export function cleanTimelineOutput(text: string): string {
  if (!text) return '';
  let cleaned = text.trim();
  // Strip code fences if model wrapped output in ```markdown or ```text
  cleaned = cleaned.replace(/^```(?:markdown|text)?\n?/i, '').replace(/\n?```$/i, '').trim();

  // Strip any introduction before the first segment timestamp
  const firstTimestampMatch = cleaned.search(/(?:^|\n)\s*\d+(?:[.,]\d+)?\s*[–\-—]\s*\d+(?:[.,]\d+)?\s*(?:detik|s|sec|dtk)?\b/i);
  if (firstTimestampMatch > 0) {
    cleaned = cleaned.slice(firstTimestampMatch).trim();
  }

  // Strip trailing notes, but preserve CAPTION & HASHTAG
  const noteMatch = cleaned.search(/(?:\n\s*##\s*Catatan|\n\s*Demikian|\n\s*Semoga bermanfaat)/i);
  if (noteMatch > 0) {
    cleaned = cleaned.slice(0, noteMatch).trim();
  }

  return cleaned;
}

export interface GeneratePromptOptions {
  mimeType: string;
  base64Data: string;
  model?: string;
  analysisMode?: 'fast' | 'deep';
  targetAI?: string;
  segmentDuration?: string;
  cinematicStyle?: string;
  includeActions?: boolean;
  includeVoiceOver?: boolean;
  includeCinematics?: boolean;
  sourceCaption?: string;
  sourceUrl?: string;
  customApiKey?: string;
  clientAccessCode?: string;
  useCache?: boolean;
}

export async function generateVideoPromptService(options: GeneratePromptOptions) {
  const {
    mimeType,
    base64Data,
    model,
    analysisMode = 'deep',
    targetAI = 'general',
    segmentDuration = '5',
    cinematicStyle = 'cinematic',
    includeActions = true,
    includeVoiceOver = true,
    includeCinematics = true,
    sourceCaption = '',
    customApiKey,
    clientAccessCode,
    useCache = true,
  } = options;

  if (!base64Data || !mimeType) {
    throw new Error('Data video dan tipe MIME diperlukan');
  }

  const contentHash = crypto.createHash('sha256').update(base64Data).digest('hex').slice(0, 32);
  const cacheInput = `${mimeType}_${base64Data.length}_${contentHash}_${model}_${analysisMode}_${targetAI}_${segmentDuration}_${cinematicStyle}_${includeActions}_${includeVoiceOver}_${includeCinematics}_${sourceCaption ? sourceCaption.slice(0, 50) : ''}_v3_ultra_cinematic`;
  const cacheKey = crypto.createHash('sha256').update(cacheInput).digest('hex');

  if (useCache) {
    const cached = promptResponseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < PROMPT_CACHE_TTL_MS) {
      logger.info('[Prompt Cache Hit - Saved Quota]', cacheKey);
      return {
        prompt: cached.text,
        modelUsed: cached.modelUsed,
        promptArchitect: cached.promptArchitect,
        cached: true,
      };
    }
  }

  let userSelectedModel = model;
  if (!userSelectedModel || userSelectedModel === 'gemini-3.6-flash' || userSelectedModel === 'gemini-3.8-flash' || userSelectedModel === 'gemini-3.1-pro-preview') {
    userSelectedModel = (analysisMode === 'deep') ? 'gemini-3.1-pro-preview' : 'gemini-3.8-flash';
  }

  let aiGuide = '';
  if (targetAI === 'runway') {
    aiGuide = 'FORMAT OPTIMASI: Runway Gen-3 Alpha. Jelaskan pergerakan kamera secara eksplisit (misal: "Slow camera push-in", "Dynamic handheld tracking", "Smooth low-angle dolly"). Sertakan deskripsi pencahayaan 3-point lighting dan transisi gerak karakter fluid. Akhiri setiap visual dengan deskripsi sinematik 8K photorealistic.';
  } else if (targetAI === 'sora') {
    aiGuide = 'FORMAT OPTIMASI: OpenAI Sora. Sertakan deskripsi naratif yang sangat kaya akan depth of field, fisika interaksi objek, pencahayaan fotorealistik natural, tekstur mikro, dan koherensi spasial 3D.';
  } else if (targetAI === 'kling') {
    aiGuide = 'FORMAT OPTIMASI: Kling AI. Fokuskan pada instruksi pergerakan karakter yang halus, mikro-ekspresi wajah, konsistensi proporsi anatomi, dan tekstur material produk yang tajam.';
  } else if (targetAI === 'luma') {
    aiGuide = 'FORMAT OPTIMASI: Luma Dream Machine. Prioritaskan continuous smooth camera trajectory, dinamika atmosferik, pencahayaan lembut, dan kontinuitas gerakan dinamis.';
  } else if (targetAI === 'hailuo') {
    aiGuide = 'FORMAT OPTIMASI: Hailuo / Minimax Video-01. Tekankan pada ketajaman ekspresi manusia yang natural, sinematik film grade, dan interaksi fisik realistis.';
  } else {
    aiGuide = 'FORMAT OPTIMASI: Universal Video AI (kompatibel untuk Sora, Runway Gen-3, Kling, Luma, Pika, dan Hailuo). Tuliskan visual sinematik dengan detail framing, lensa, pencahayaan, dan pergerakan subjek yang jelas.';
  }

  let styleGuide = '';
  if (cinematicStyle === 'commercial') {
    styleGuide = 'GAYA: Iklan Komersial TikTok Shop (Vibrant, High Energy, Product Hero Close-up, Studio Softbox Ring Lighting, Hook visual memikat di detik pertama).';
  } else if (cinematicStyle === 'ugc') {
    styleGuide = 'GAYA: UGC / Video Kreator Autentik (Natural daylight, Handheld casual camera, ekspresi natural spontan, pencahayaan alami tanpa kesan staged).';
  } else if (cinematicStyle === 'cyberpunk') {
    styleGuide = 'GAYA: Cyberpunk / Neon Atmospheric (Moody dramatic contrast, vibrant neon blue/magenta rim lighting, reflective wet surfaces, high color saturation).';
  } else if (cinematicStyle === 'aesthetic') {
    styleGuide = 'GAYA: Soft Aesthetic & Minimalist (Pastel warm color grade, airy diffused daylight, soft shallow depth of field, clean composition).';
  } else {
    styleGuide = 'GAYA: Sinematik Layar Lebar 8K (Anamorphic widescreen 2.39:1, 35mm film grain, teal & orange color grading, dramatic chiaroscuro lighting, professional focal blur).';
  }

  const analysisDepthGuide = analysisMode === 'deep'
    ? 'MODE ANALISIS: DEEP MULTIMODAL VISION REASONING. Analisis secara mendalam setiap detail: (1) Framing & Lensa (Close-up, Medium Shot, Low-Angle, Macro, 35mm / 50mm / 85mm), (2) Lighting (Key/Fill/Rim, Golden Hour, Studio Softbox), (3) Pergerakan Kamera (Push-in, Dolly, Pan, Tilt, Orbit, Handheld), (4) Aksi Mikro Subjek & Produk, (5) Transkripsi Suara Dialog Kata-per-Kata persis dalam Bahasa Indonesia yang persuasif.'
    : 'MODE ANALISIS: FAST ESSENTIALS. Tangkap hook utama, estetika visual esensial, pacing klip, dan transkrip suara inti secara cepat dan akurat.';

  const secNum = parseInt(segmentDuration, 10) || 5;
  const isAuto = segmentDuration === 'auto';
  const secText = !isAuto
    ? `dengan durasi masing-masing persis ${secNum} detik per segmen klip`
    : 'berdasarkan transisi atau perubahan adegan alami';

  const exampleStart1 = 0;
  const exampleEnd1 = isAuto ? 4 : secNum;
  const exampleStart2 = exampleEnd1;
  const exampleEnd2 = isAuto ? 9 : secNum * 2;

  const promptText = `Anda adalah Master Director & Elite Video Prompt Vision Architect untuk platform TikTok / Reels / Shorts Indonesia.

TUGAS UTAMA:
Menganalisis video yang diberikan user dengan sangat teliti (visual, pergerakan, audio dialog, pencahayaan), lalu menghasilkan breakdown prompt video siap pakai per segmen timeline (${secText}).

PANDUAN KHUSUS:
- ${analysisDepthGuide}
- ${aiGuide}
- ${styleGuide}

FORMAT OUTPUT YANG WAJIB DIPATUHI 100%:
${exampleStart1}–${exampleEnd1} detik
Visual: [Deskripsi visual sinematik sangat detail: jenis framing & lensa kamera, subjek orang + pakaian + ekspresi, objek produk & tekstur, tata pencahayaan, suasana latar belakang]
Aksi: [Gerakan fisik konkret subjek dan pergerakan kamera yang terjadi selama ${exampleEnd1 - exampleStart1} detik ini]
voice over: [Naskah suara narasi / dialog percakapan natural Bahasa Indonesia yang terdengar atau relevan untuk adegan ini]

${exampleStart2}–${exampleEnd2} detik
Visual: [Deskripsi visual sinematik sangat detail untuk segmen berikutnya]
Aksi: [Gerakan konkret subjek dan kamera pada segmen ini]
Subteks: [Teks tulisan overlay di layar atau pesan kunci yang ingin disampaikan]
(lanjutkan timeline hingga akhir durasi video)

### 📱 CAPTION & HASHTAG
**Caption SEO:**
[Tuliskan caption TikTok / Reels yang menarik, membuat penasaran, memiliki hook kuat, dan call-to-action natural]

**Hashtags:**
#tag1 #tag2 #tag3 #tag4 #tag5

ATURAN WAJIB:
1. Mulai langsung dari segmen pertama (misal: "0–${secNum} detik"). Jangan tambahkan basa-basi sebelum timeline.
2. Setiap segmen HARUS memiliki tepat 3 baris: "Visual:", "Aksi:", dan ("voice over:" ATAU "Subteks:").
3. ${!isAuto ? `Pecah durasi WAJIB konsisten persis per ${secNum} detik (0–${secNum} detik, ${secNum}–${secNum * 2} detik, dst)!` : 'Bagi berdasarkan pergantian shot adegan alami yang mulus.'}
4. Deskripsi Visual harus hiper-deskriptif dan siap dimasukkan ke generator AI video (Runway/Sora/Kling) tanpa perlu diedit ulang.
5. Bahasa voice over harus luwes, natural khas kreator TikTok Indonesia (bukan kaku atau terjemahan mesin).
6. Di bagian paling akhir, sertakan persis bagian "### 📱 CAPTION & HASHTAG" dengan caption dan maksimal 5 hashtag relevan non-spam.`;

  let promptPayload: any;

  if (mimeType === 'text/plain') {
    const rawUserText = Buffer.from(base64Data, 'base64').toString('utf-8');
    promptPayload = {
      contents: {
        parts: [
          {
            text: `BERIKUT TEKS DESKRIPSI / SKRIP / KONSEP ADAGAN INPUT DARI USER:
"""
${rawUserText}
"""

TUGAS UTAMA ANDA:
${promptText}`
          }
        ]
      },
      config: {
        systemInstruction: ELITE_SHOT_BREAKDOWN_SYSTEM_INSTRUCTION,
      }
    };
  } else {
    promptPayload = {
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data,
            },
          },
          {
            text: promptText,
          },
        ],
      },
      config: {
        systemInstruction: ELITE_SHOT_BREAKDOWN_SYSTEM_INSTRUCTION,
      },
    };
  }

  const isDeepAnalysis = analysisMode === 'deep';
  const videoTargetTier = isDeepAnalysis ? 'flagship' : 'tier2';
  const videoToolName = isDeepAnalysis ? 'Video to Prompt (Deep)' : 'Video to Prompt (Fast)';

  const result = await callGeminiWithFallback(
    userSelectedModel,
    promptPayload,
    customApiKey,
    clientAccessCode,
    videoTargetTier,
    videoToolName
  );

  let finalPromptText = cleanTimelineOutput(result.text);

  if (useCache) {
    const cacheInputSaved = `${mimeType}_${base64Data.length}_${contentHash}_${model}_${analysisMode}_${targetAI}_${segmentDuration}_${includeActions}_${includeVoiceOver}_${includeCinematics}_${sourceCaption ? sourceCaption.slice(0, 50) : ''}_v2_visual_aksi_subteks`;
    const cacheKeySaved = crypto.createHash('sha256').update(cacheInputSaved).digest('hex');
    promptResponseCache.set(cacheKeySaved, {
      timestamp: Date.now(),
      text: finalPromptText,
      modelUsed: result.modelUsed,
      promptArchitect: undefined
    });
  }

  return {
    prompt: finalPromptText,
    modelUsed: result.modelUsed,
    promptArchitect: undefined
  };
}
