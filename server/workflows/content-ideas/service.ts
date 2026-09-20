import crypto from 'crypto';
import { callGeminiWithFallback } from '@/server/core/llm/geminiGateway';
import { fetchTikTokShopProduct } from '@/server/core/tiktok-fetcher';
import { sanitizeCaptionsAndHashtags } from '@/server/core/utils/sanitizer';
import { promptResponseCache, PROMPT_CACHE_TTL_MS, recordExecutionAndUpgrade } from '@/server/core/state/serverState';
import { normalizeGeminiModel } from '@/platform_intelligence/routing/modelRouter';
import { runIndonesianQueryCouncil } from './agent';
import { logger } from '@/src/utils/logger';

export interface GenerateContentIdeasOptions {
  mimeType?: string;
  base64Data?: string;
  sourceTitle?: string;
  topic?: string;
  tiktokShopUrl?: string;
  contentType?: string;
  tone?: string;
  maxDuration?: string;
  segmentDuration?: string;
  targetAI?: string;
  model?: string;
  aeoQueryMode?: string;
  enableBigSound?: boolean;
  enableTextOverlay?: boolean;
  referenceImageBase64?: string;
  referenceImageMimeType?: string;
  userSeedQueries?: string[];
  numIdeas?: number;
  customApiKey?: string;
  clientAccessCode?: string;
  useCache?: boolean;
}

export async function generateContentIdeasService(options: GenerateContentIdeasOptions) {
  let {
    mimeType,
    base64Data,
    sourceTitle = '',
    topic = '',
    tiktokShopUrl = '',
    contentType = 'affiliate',
    tone = 'persuasive',
    maxDuration = '60',
    segmentDuration = '5',
    targetAI = 'general',
    model,
    aeoQueryMode = 'both',
    enableBigSound = true,
    enableTextOverlay = true,
    referenceImageBase64 = '',
    referenceImageMimeType = '',
    userSeedQueries = [],
    numIdeas = 5,
    customApiKey,
    clientAccessCode,
    useCache = true,
  } = options;

  const totalIdeas = Math.min(5, Math.max(1, Number(numIdeas) || 5));

  if (!base64Data && !topic && !sourceTitle && !tiktokShopUrl) {
    throw new Error('Mohon sediakan data video TikTok, judul, topik konten, atau link TikTok Shop.');
  }

  const sampleData = base64Data ? base64Data.slice(0, 300) : topic || sourceTitle || tiktokShopUrl;
  const refImgSample = referenceImageBase64 ? referenceImageBase64.slice(0, 50) : '';

  let userSeedQueriesClean = Array.isArray(userSeedQueries)
    ? userSeedQueries.map(s => String(s).trim().slice(0, 80)).filter(s => s.length > 0).slice(0, 10)
    : [];

  const userSeedSample = userSeedQueriesClean.join('|').slice(0, 50);
  const shopKey = (tiktokShopUrl || '').trim().slice(0, 80);

  const cacheInput = `content_ideas_v3_${mimeType}_${sampleData}_${model || 'auto'}_${contentType}_${tone}_${maxDuration}_${segmentDuration}_${targetAI}_${aeoQueryMode}_${enableBigSound}_${enableTextOverlay}_${refImgSample}_${userSeedSample}_${totalIdeas}_${shopKey}`;
  const cacheKey = crypto.createHash('sha256').update(cacheInput).digest('hex');

  if (useCache) {
    const cached = promptResponseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < PROMPT_CACHE_TTL_MS) {
      logger.info('[Content Ideas Cache Hit - Saved Quota]', cacheKey);
      return { result: cached.text, modelUsed: cached.modelUsed, cached: true };
    }
  }

  const userSelectedModel = model ? normalizeGeminiModel(model) : undefined;
  const maxSecNum = parseInt(maxDuration, 10) || 60;

  // Hitung jumlah klip & timestamp rentang waktu secara dinamis
  let segSecNum = 6;
  if (segmentDuration === '4') segSecNum = 4;
  else if (segmentDuration === '6') segSecNum = 6;
  else if (segmentDuration === '8') segSecNum = 8;
  else if (segmentDuration === '10') segSecNum = 10;
  else if (segmentDuration === '15') segSecNum = 15;
  else if (segmentDuration === 'auto') segSecNum = Math.max(4, Math.ceil(maxSecNum / 4));
  else segSecNum = Math.max(3, parseInt(segmentDuration, 10) || 6);

  const expectedClipsCount = Math.ceil(maxSecNum / segSecNum);

  const timestampGuideList: string[] = [];
  let currentSec = 0;
  for (let i = 1; i <= expectedClipsCount; i++) {
    const nextSec = Math.min(maxSecNum, currentSec + segSecNum);
    const startSecStr = currentSec === 0 ? '0' : (currentSec % 1 === 0 ? `${currentSec}` : `${currentSec}`.replace('.', ','));
    const nextSecStr = nextSec % 1 === 0 ? `${nextSec}` : `${nextSec}`.replace('.', ',');
    const timeHeader = `${startSecStr}–${nextSecStr} detik`;
    const thirdLine = (i % 2 === 1) ? 'voice over: [teks voice over natural]' : 'Subteks: [teks overlay atau makna tersirat]';

    timestampGuideList.push(`${timeHeader}
Visual: [deskripsi visual sangat detail]
Aksi: [gerakan yang terjadi]
${thirdLine}`);

    currentSec = nextSec;
  }
  const timestampTemplateText = timestampGuideList.join('\n\n');

  let productContext = '';

  if (tiktokShopUrl && typeof tiktokShopUrl === 'string' && tiktokShopUrl.trim()) {
    logger.info('[Content Ideas] Mengambil data produk dari TikTok Shop...');
    const productData = await fetchTikTokShopProduct(tiktokShopUrl.trim());

    if (productData) {
      if (!topic && productData.name) {
        topic = productData.name;
      }
      if (!sourceTitle && productData.name) {
        sourceTitle = `Produk TikTok Shop: ${productData.name}`;
      }
      productContext = `
DATA PRODUK DARI TIKTOK SHOP:
- Link: ${tiktokShopUrl.trim()}
- Nama Produk: ${productData.name || '(tidak terdeteksi)'}
- Harga: ${productData.price || '(tidak terdeteksi)'}
- Deskripsi / Konten Halaman:
${productData.description || productData.raw || '-'}
`.trim();
      logger.info('[Content Ideas] Data produk TikTok Shop berhasil diambil:', productData.name);
    } else {
      productContext = `
DATA PRODUK DARI TIKTOK SHOP (GAGAL FETCH OTOMATIS):
- Link: ${tiktokShopUrl.trim()}
- Catatan: Sistem gagal mengambil detail otomatis. Gunakan field Topik / Nama Produk yang diisi user sebagai acuan utama.
`.trim();
      logger.warn('[Content Ideas] Gagal fetch TikTok Shop, pakai fallback.');
    }
  }

  // =========================================================================
  // TAHAP 0 — AEO QUERY MODE ROUTER
  // =========================================================================
  logger.info(`[Content Ideas Stage 0] AEO Query Router. Mode: ${aeoQueryMode}`);

  // =========================================================================
  // TAHAP 1 — ANALISIS KONTEKS VISUAL VIDEO
  // =========================================================================
  let groundingContext = '';

  if (base64Data) {
    logger.info('[Content Ideas] Stage 1 dimulai | tier=tier2 | tool=Content Ideas Stage 1');
    const stage1Prompt = `Anda adalah AI Video Vision Analyzer tingkat presisi tinggi.
TUGAS TAHAP 1: Analisis video ini dari detik awal sampai akhir secara objektif tanpa mengarang.
Ekstrak struktur data internal faktual berikut:
1. Objek/Produk yang BENAR-BENAR terlihat di frame (nama barang, warna, bahan, detail visual unik, kancing, motif, kerah, jahitan, packaging).
2. Aksi Tangan / Orang yang BENAR-BENAR terjadi (misal: memegang kerah, membalik lengan baju, menunjuk detail kancing, mengoleskan krim, membuka kemasan, mengangkat barang ke kamera).
3. Environment / Setting Asli Video (ruang tamu, kamar, studio, latar belakang, lighting, suasana).
4. Ekspresi & Gesture yang Terlihat (apabila ada orang/presenter di video).
5. Transkrip Audio / Teks Terdeteksi (jika ada suara/VO/teks asli di video).

JIKA ADA BAGIAN DETAIL YANG TIDAK JELAS ATAU TIDAK TERDETEKSI: Tandai eksplisit sebagai "[Kurang yakin / Tidak terdeteksi jelas]". JANGAN PERNAH MENGARANG AKSI ATAU PRODUK YANG TIDAK ADA.`;

    const stage1Payload = {
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType || 'video/mp4',
              data: base64Data,
            },
          },
          {
            text: `${stage1Prompt}\n\nJudul/Caption Video: ${sourceTitle || '-'}\nCatatan Tambahan: ${topic || '-'}`,
          },
        ],
      },
      config: {
        systemInstruction:
          "You are an objective video vision analyzer. Extract exact physical actions, visible objects, gestures, and settings without hallucinating or making assumptions.",
      },
    };

    const stage1Result = await callGeminiWithFallback(
      userSelectedModel,
      stage1Payload,
      customApiKey,
      clientAccessCode,
      'tier2',
      'Content Ideas Stage 1'
    );
    groundingContext = stage1Result.text;
  } else {
    logger.info('[Content Ideas] Stage 1 dilewati (tanpa video base64) | menggunakan grounding teks user');
    groundingContext = `INFORMASI INPUT TEKS USER (Tanpa Video File):
- Judul/Caption Video: ${sourceTitle || '-'}
- Topik / Produk: ${topic || '-'}`;
  }

  logger.info('[Content Ideas Stage 1 Complete] Grounding context extracted.');

  let identityAnchorDescription = '';
  if (referenceImageBase64 && typeof referenceImageBase64 === 'string' && referenceImageBase64.trim().length > 0) {
    logger.info('[Content Ideas] Stage 1.5 dimulai | tier=tier2 | tool=Content Ideas Identity Anchor');
    const anchorPrompt = `Anda adalah AI Identity Extractor. Analisis gambar referensi ini secara presisi.
Ekstrak 'Identity Anchor' yang solid (seperti warna kulit, pakaian, bentuk wajah, tekstur barang, atau logo pada produk).
Deskripsi ini akan disalin persis ke prompt video generation untuk mencegah flickering identitas antar adegan.
Hasilkan HANYA 1 paragraf padat berbahasa Inggris yang mendeskripsikan secara jelas ciri khas subjek/produk utama di gambar ini.`;

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
            text: anchorPrompt,
          },
        ],
      },
    };
    const anchorResult = await callGeminiWithFallback(
      userSelectedModel,
      anchorPayload,
      customApiKey,
      clientAccessCode,
      'tier2',
      'Content Ideas Identity Anchor'
    );
    identityAnchorDescription = anchorResult?.text?.trim() || '';
    logger.info('[Content Ideas Stage 1.5 Complete] Identity Anchor extracted:', identityAnchorDescription);
  } else {
    logger.info('[Content Ideas] Stage 1.5 dilewati (tanpa gambar referensi)');
  }

  // =========================================================================
  // TAHAP 1.8 — DEWAN 10 AI AGENT QUERY (INDONESIAN QUERY COUNCIL)
  // =========================================================================
  let queryCouncilResult: any = { final_short_query_targets: [], final_long_tail_queries: [] };

  const hasUserSeedQueries = userSeedQueriesClean && userSeedQueriesClean.length > 0;
  const shouldSkipCouncil = (aeoQueryMode === 'short' && hasUserSeedQueries) || userSeedQueriesClean.length >= 5;

  if (shouldSkipCouncil) {
    logger.info(`[Content Ideas] Stage 1.8 dilewati / disederhanakan | mode=${aeoQueryMode} | seedCount=${userSeedQueriesClean.length} | menggunakan seed queries langsung`);
    queryCouncilResult = {
      final_short_query_targets: userSeedQueriesClean.filter(q => q.split(' ').length <= 4),
      final_long_tail_queries: userSeedQueriesClean.filter(q => q.split(' ').length > 4)
    };
    if (queryCouncilResult.final_short_query_targets.length === 0) queryCouncilResult.final_short_query_targets = userSeedQueriesClean.slice(0, 3);
    if (queryCouncilResult.final_long_tail_queries.length === 0) queryCouncilResult.final_long_tail_queries = userSeedQueriesClean.slice(-3);
  } else {
    logger.info('[Content Ideas] Stage 1.8 dimulai | tier=tier2 | tool=Content Ideas Query Council');
    try {
      queryCouncilResult = await runIndonesianQueryCouncil(
        topic || sourceTitle || '',
        groundingContext,
        userSeedQueriesClean,
        aeoQueryMode as any,
        (m, p, k, c, t) =>
          callGeminiWithFallback(m, p, k, c, t || 'tier2', 'Content Ideas Query Council'),
        userSelectedModel,
        customApiKey,
        clientAccessCode,
        'tier2'
      );
      logger.info(`[Content Ideas Stage 1.8 Complete] Generated ${queryCouncilResult.final_short_query_targets?.length || 0} short and ${queryCouncilResult.final_long_tail_queries?.length || 0} long queries.`);
    } catch (err) {
      logger.warn("[Stage 1.8] Query Council Agent failed or JSON parse error, falling back to legacy synthetic query generation mode. Error:", err);
    }
  }

  // =========================================================================
  // TAHAP 2 — GENERATE ${totalIdeas} IDE KONTEN GROUNDED + ANTI-AI-SLOP VOICE-OVER
  // =========================================================================
  logger.info(`[Content Ideas] Stage 2 dimulai | tier=flagship | tool=Content Ideas Stage 2 | totalIdeas=${totalIdeas}`);

  const hasCouncilQueries = (queryCouncilResult.final_short_query_targets?.length > 0 || queryCouncilResult.final_long_tail_queries?.length > 0);

  const ideaPromptTemplates: string[] = [];
  for (let i = 1; i <= totalIdeas; i++) {
    ideaPromptTemplates.push(`### 💡 IDE ${i}: [Judul Ide Konten ${i}]
- **Tipe & Angle Konten**: [Problem-Solution / POV Relatable / Unboxing Soft-Sell / Review Jujur]
- **Target Audience**: [Sebutkan audiens target spesifik]
- **AEO Query Mapping**: Short → [...], Long → [...]
- **Alasan Relevansi**: [1-2 kalimat penjelasan koneksi ke grounding & query target]
- **BLUFF Hook Pikat (0-3s)**: "[Kalimat pikat BLUFF - Langsung ke Inti Solusi/Jawaban di 3 detik pertama]"
- **Atomic Answer Summary (LLM RAG Citation Ready)**: "[1-2 kalimat fakta mandiri utuh yang siap dikutip AI Search Engine]"
- **Consensus Trigger (Tier 2 Validation)**: "[Pemicu validasi sosial / review komunitas untuk membangun konsensus LLM]"
- **Panduan Visual & Audio**: [Deskripsi gaya adegan, ekspresi, lighting, rekomendasi sound TikTok]
- **Rincian Adegan Video & Prompt AI per Segmen (${maxSecNum} Detik)**:
${timestampTemplateText}
- **AEO Caption SEO**:
"""text
[Caption AEO: Kalimat 1 = BLUFF Answer + Entitas Utama, Kalimat 2-3 = Poin Detail Faktual, Penutup = Q&A Pemicu Diskusi]
"""
- **Hashtag Relevan**: '#HashtagSpesifikVisual1 #HashtagSpesifikVisual2 #HashtagDetail3 #HashtagNiche4 #HashtagTargetSEO5'`);
  }
  const allIdeasTemplate = ideaPromptTemplates.join('\n\n---\n\n');

  const stage2PromptText = `Anda adalah TikTok Content Strategist & Anti-AI-Slop Indonesian Copywriter Spesialis FYP Ranking TikTok Indonesia.

TUGAS UTAMA TAHAP 2:
Buatkan ${totalIdeas} IDE KONTEN VIRAL SANGAT OPTIMAL, RELEVAN, & PERSUASIF berdasarkan DATA HASIL ANALISIS TAHAP 1 TERLAMPIR.

${hasCouncilQueries ? `=== HASIL DEWAN 10 AGENT QUERY TAHAP 0 (WAJIB DIPAKAI, DILARANG MENGARANG QUERY BARU) ===
Short Query Targets: ${(queryCouncilResult.final_short_query_targets || []).join(' | ')}
Long-Tail Queries: ${(queryCouncilResult.final_long_tail_queries || []).join(' | ')}
${userSeedQueriesClean.length > 0 ? `Seed Asli dari User (prioritas tertinggi): ${userSeedQueriesClean.join(' | ')}` : ''}
==================================================================

ATURAN QUERY FAN-OUT (DIPERKETAT):
1. SETIAP query yang dicantumkan di "AEO SYNTHETIC QUERY FAN-OUT" dan di
   "AEO Query Mapping" tiap ide WAJIB diambil PERSIS atau nyaris identik dari
   daftar Dewan 10 Agent di atas. DILARANG membuat query baru yang tidak ada
   di daftar tersebut — ini untuk mencegah halusinasi.` : `=== AEO SYNTHETIC QUERY FAN-OUT & MAPPING ===
1. Hasilkan dan cantumkan 5-9 synthetic long-tail queries secara mandiri berdasarkan topik dan konteks yang ada.
2. Lakukan "AEO Query Mapping" untuk setiap ide dengan mengaitkannya ke query yang relevan yang telah Anda hasilkan.`}

=== DATA GROUNDING FAKTUAL TAHAP 1 (MANDATORI DIIKUTI 100%) ===
"""
${groundingContext}
"""
==================================================================

${productContext ? `
========================================
DATA PRODUK UTAMA (DARI TIKTOK SHOP / USER)
========================================
${productContext}
` : ''}

KONFIGURASI TARGET REPLIKA:
- Target Total Durasi Video: ${maxSecNum} Detik
- Target Jenis Konten: ${contentType.toUpperCase()}
- Tone Bahasa: ${tone.toUpperCase()}

FORMAT OUTPUT WAJIB:
${allIdeasTemplate}

ATURAN STRUKTUR PROMPT VIDEO DI BAGIAN "Rincian Adegan Video & Prompt AI per Segmen":
1. WAJIB mengikuti format breakdown timeline Bahasa Indonesia per segmen:
   [start]–[end] detik
   Visual: [deskripsi visual sangat detail: lokasi, pencahayaan, sudut kamera, subjek (orang + pakaian + ekspresi), objek produk, posisi, tekstur, suasana]
   Aksi: [gerakan konkret yang terjadi di detik tersebut]
   voice over: [teks voice over natural] (atau Subteks: [teks overlay atau makna tersirat])
2. Setiap segmen HARUS memiliki tepat 3 bagian: Visual, Aksi, dan (voice over ATAU Subteks).
3. Gunakan "voice over:" jika ada narasi suara. Gunakan "Subteks:" jika lebih cocok sebagai teks overlay / makna tersirat.
4. DURASI & PEMBAGIAN SEGMEN:
   - Target total durasi: ${maxSecNum} detik, dibagi menjadi persis ${expectedClipsCount} klip segmen (masing-masing berdurasi ${segSecNum} detik).
   - Rentang waktu tiap klip WAJIB mengikuti durasi ${segSecNum} detik penuh:
${timestampGuideList.map(item => "     " + item.split("\n")[0]).join("\n")}
   - DILARANG memecah menjadi potongan mikro 2-3 detik! Setiap segmen adalah 1 PROMPT UTUH SIAP SALIN berdurasi ${segSecNum} detik untuk AI Video Generator (Sora, Kling, Minimax, Hailuo, Runway).
5. Visual harus sangat kaya detail: lokasi, pencahayaan, sudut kamera, subjek, objek produk, posisi, tekstur, dan suasana.
6. Aksi harus menjelaskan gerakan konkret yang terjadi di detik tersebut.
7. Bahasa harus natural, gaya TikTok Indonesia (santai, persuasif, mudah dipahami).
8. DILARANG menggunakan format Inggris, tag [Style], [Camera], [Lighting], [Actions], atau codeblock Inggris.
9. Jaga konsistensi visual di semua klip.
`;

  const stage2Payload = {
    contents: {
      parts: [
        {
          text: stage2PromptText,
        },
      ],
    },
    config: {
      systemInstruction: 'Anda adalah TikTok Content Strategist & Indonesian Video Prompt Engineer. Buat ide konten viral lengkap dengan rincian adegan video berformat timeline Bahasa Indonesia (Visual, Aksi, voice over/Subteks).',
    },
  };

  const stage2Result = await callGeminiWithFallback(
    userSelectedModel,
    stage2Payload,
    customApiKey,
    clientAccessCode,
    'flagship',
    'Content Ideas Stage 2'
  );
  let finalOutputText = sanitizeCaptionsAndHashtags(stage2Result.text);

  // =========================================================================
  // VALIDASI / SELF-CRITIC (HANYA DIJALANKAN JIKA OUTPUT BERMASALAH)
  // =========================================================================
  const isOutputProblematic = !finalOutputText || finalOutputText.trim().length < 80;

  if (isOutputProblematic) {
    logger.info('[Content Ideas] Stage Validasi dimulai (output bermasalah/kurang lengkap) | tier=tier3 | tool=Content Ideas Validation');
    const validationPayload = {
      contents: {
        parts: [
          {
            text: `BERIKUT DATA ANALISIS VISUAL TAHAP 1:
"""
${groundingContext}
"""

BERIKUT HASIL YANG TERDETEKSI KURANG LENGKAP:
"""
${finalOutputText}
"""

TUGAS VALIDASI:
Lengkapi kembali ${totalIdeas} ide konten viral sesuai format:
${allIdeasTemplate}

Pastikan bagian rincian adegan video memakai format:
0–2 detik
Visual: ...
Aksi: ...
voice over: ...

2–3,8 detik
Visual: ...
Aksi: ...
Subteks: ...`,
          },
        ],
      },
      config: {
        systemInstruction: 'Lengkapi dan perbaiki ide konten viral TikTok sesuai template yang diminta.',
      },
    };

    try {
      const validatedResult = await callGeminiWithFallback(
        userSelectedModel,
        validationPayload,
        customApiKey,
        clientAccessCode,
        'tier3',
        'Content Ideas Validation'
      );
      if (validatedResult?.text && validatedResult.text.trim().length >= 80) {
        finalOutputText = sanitizeCaptionsAndHashtags(validatedResult.text);
        logger.info('[Content Ideas Validation] Output berhasil diperbaiki oleh validator tier3.');
      }
    } catch (valErr) {
      logger.warn('[Validation Warning] Fast validation skipped or fallback to Stage 2 text:', valErr);
    }
  } else {
    logger.info('[Content Ideas] Stage Validasi dilewati (output Stage 2 sudah lengkap & terstruktur)');
  }

  // Record successful execution & train system memory
  recordExecutionAndUpgrade('contentIdeas');

  if (useCache) {
    promptResponseCache.set(cacheKey, { timestamp: Date.now(), text: finalOutputText, modelUsed: stage2Result.modelUsed });
  }

  return { result: finalOutputText, modelUsed: stage2Result.modelUsed };
}
