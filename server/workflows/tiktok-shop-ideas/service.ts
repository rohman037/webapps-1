import { callGeminiWithFallback } from '@/server/core/llm/geminiGateway';
import { sanitizeCaptionsAndHashtags } from '@/server/core/utils/sanitizer';
import { recordExecutionAndUpgrade } from '@/server/core/state/serverState';
import { normalizeGeminiModel } from '@/platform_intelligence/routing/modelRouter';
import { validateShopIdeasOutput, isNewClipFormat } from './validator';
import { logger } from '@/src/utils/logger';

export interface GenerateTikTokShopIdeasOptions {
  shopUrl?: string;
  productDetails?: string;
  numIdeas?: number;
  totalDuration?: string;
  promptSplitSec?: string;
  aeoTargetMode?: string;
  enableBigSound?: boolean;
  enableTextOverlay?: boolean;
  analysisMode?: string;
  referenceImageBase64?: string;
  referenceImageMimeType?: string;
  model?: string;
  customApiKey?: string;
  clientAccessCode?: string;
  onProgress?: (progress: number) => void;
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

  // =========================================================================
  // STAGE 2: IDENTITY ANCHOR
  // =========================================================================
  let identityAnchorDescription = '';
  const runStage2IdentityAnchor = async (): Promise<void> => {
    if (!referenceImageBase64) return;
    try {
      logger.info('[TikTok Shop Pipeline] Stage 2: Extracting identity anchor from reference image...');
      const anchorPrompt = `Anda adalah AI E-Commerce Product Vision Extractor. Analisis gambar produk referensi ini secara presisi.
Ekstrak 1 paragraf padat (maksimal 4-5 kalimat) mendeskripsikan secara jelas dan objektif ciri khas fisik visual produk:
- Warna utama, tone gradasi, dan aksen warna
- Bentuk geometri kemasan, proporsi wadah, tutup, atau material bodi
- Tekstur permukaan (matte, glossy, transparan, ribbed, emboss, fabric)
- Detail logo, tipografi merek, penempatan label, atau elemen visual khas
ATURAN KETAT:
- JANGAN buat klaim marketing, kata sifat promosi, atau klaim khasiat/kehebatan apapun.
- HANYA deskripsikan fitur fisik visual yang kasat mata agar prompt video AI konsisten dan akurat.`;

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
        model ? normalizeGeminiModel(model) : 'gemini-3.8-flash',
        anchorPayload,
        customApiKey,
        clientAccessCode,
        'tier2',
        'TikTok Shop Identity Anchor'
      );

      const extractedText = anchorResult?.text?.trim() || '';
      if (extractedText.length > 20) {
        identityAnchorDescription = extractedText;
        logger.info('[TikTok Shop Pipeline] Stage 2: Identity anchor extracted successfully.');
      } else {
        identityAnchorDescription = '';
      }
    } catch (err) {
      logger.warn('[TikTok Shop Pipeline] Stage 2: Identity Anchor failed or low confidence, proceeding without anchor:', err);
      identityAnchorDescription = '';
    }
  };

  // =========================================================================
  // STAGE 3: LINK ENRICHER
  // =========================================================================
  let enrichedInfo = '';
  let enrichedProductName = '';
  let enrichedPrice = '';
  let enrichedDescription = '';

  const runStage3LinkEnricher = async (): Promise<void> => {
    if (!trimmedShopUrl) {
      enrichedInfo = 'Tidak ada link produk disediakan. Menggunakan data input user / foto referensi.';
      return;
    }

    logger.info(`[TikTok Shop Pipeline] Stage 3: Enriching metadata from URL: ${trimmedShopUrl}`);
    try {
      let cleanUrl = trimmedShopUrl;
      if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        cleanUrl = 'https://' + cleanUrl;
      }

      let sitePlatform = 'TikTok Shop / E-Commerce';
      if (cleanUrl.includes('tiktok.com') || cleanUrl.includes('vt.tiktok.com') || cleanUrl.includes('shop.tiktok.com')) sitePlatform = 'TikTok Shop';
      else if (cleanUrl.includes('tokopedia') || cleanUrl.includes('tokopedia.link')) sitePlatform = 'Tokopedia';
      else if (cleanUrl.includes('shopee') || cleanUrl.includes('s.shopee.co.id')) sitePlatform = 'Shopee';
      else if (cleanUrl.includes('lazada')) sitePlatform = 'Lazada';

      let urlSlugKeywords = '';
      try {
        const urlObj = new URL(cleanUrl);
        const pathParts = urlObj.pathname.split('/').filter(p => p.length > 2);
        const rawSlug = pathParts.join(' ').replace(/[-_]/g, ' ');
        if (rawSlug && !rawSlug.includes('http')) {
          urlSlugKeywords = rawSlug.replace(/\b(product|item|i|p|dp|detail|view|shop|seller|buy|goods)\b/gi, '').trim();
        }
      } catch (e) {}

      let htmlText = '';
      let finalUrl = cleanUrl;

      for (let attempt = 0; attempt <= 1; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutTimer = setTimeout(() => controller.abort(), 8000);

          const res = await fetch(cleanUrl, {
            method: 'GET',
            redirect: 'follow',
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            }
          });
          clearTimeout(timeoutTimer);

          if (res.ok) {
            finalUrl = res.url || cleanUrl;
            htmlText = await res.text();
            break;
          }
        } catch (fetchErr) {
          if (attempt === 1) {
            logger.warn('[TikTok Shop Pipeline] Stage 3: Fetch retry reached limit:', fetchErr);
          }
        }
      }

      if (htmlText) {
        const noScriptHtml = htmlText
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
          .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
          .replace(/<!--[\s\S]*?-->/g, ' ');

        const ogTitleMatch = htmlText.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
                             htmlText.match(/<meta[^>]*name=["']title["'][^>]*content=["']([^"']+)["']/i) ||
                             htmlText.match(/<title>([^<]+)<\/title>/i);

        const ogDescMatch = htmlText.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ||
                            htmlText.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);

        const priceMatch = htmlText.match(/<meta[^>]*property=["'](?:product:price:amount|og:price:amount)["'][^>]*content=["']([^"']+)["']/i) ||
                           htmlText.match(/Rp\s*[\d\.,]+/i) ||
                           htmlText.match(/IDR\s*[\d\.,]+/i);

        if (ogTitleMatch) {
          enrichedProductName = ogTitleMatch[1]
            .replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
        }
        if (ogDescMatch) {
          enrichedDescription = ogDescMatch[1]
            .replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
        }
        if (priceMatch) {
          enrichedPrice = (priceMatch[0] || priceMatch[1] || '').trim();
        }

        const textSnippet = noScriptHtml
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 3000);

        enrichedInfo = `[DATA HASIL ENRICHMENT LINK TIKTOK SHOP]
Platform: ${sitePlatform}
Original Link: ${cleanUrl}
Expanded Final Link: ${finalUrl}
Judul Halaman / Nama Produk: ${enrichedProductName || urlSlugKeywords || 'Dari slug link: ' + (urlSlugKeywords || 'Lihat catatan input')}
Estimasi Harga: ${enrichedPrice || 'Sesuai etalase toko'}
Deskripsi Produk / Meta: ${enrichedDescription || 'Tersedia di etalase'}
Ringkasan Konten Teks Halaman (Max ~3000 Karakter):
${textSnippet}`;
      } else {
        enrichedInfo = 'Gagal fetch otomatis. Gunakan data dari link + input user.';
      }
    } catch (err) {
      logger.warn('[TikTok Shop Pipeline] Stage 3 error:', err);
      enrichedInfo = 'Gagal fetch otomatis. Gunakan data dari link + input user.';
    }
  };

  await Promise.all([runStage2IdentityAnchor(), runStage3LinkEnricher()]);
  if (onProgress) onProgress(30);

  // =========================================================================
  // STAGE 4: KEYWORD INTENT CLASSIFIER
  // =========================================================================
  logger.info('[TikTok Shop Pipeline] Stage 4: Classifying keyword intent & hook assignments...');

  const derivedProductName = enrichedProductName ||
    (productDetails ? productDetails.slice(0, 80) : '') ||
    (trimmedShopUrl ? trimmedShopUrl.split('/').pop()?.replace(/[-_]/g, ' ') : '') ||
    'Produk TikTok Shop';

  interface KeywordSeed {
    keyword: string;
    intent: 'problem' | 'result' | 'curiosity' | 'price';
  }

  interface IdeaHookAssignment {
    idea_number: number;
    hook_type: 'Result-first' | 'Suspense-thinking' | 'Conflict-contrast' | 'Pain-point';
    primary_keyword: string;
    intent: string;
  }

  let classifiedKeywords: KeywordSeed[] = [];
  let ideasHookAssignments: IdeaHookAssignment[] = [];

  const fallbackHookTypes: ('Result-first' | 'Pain-point' | 'Suspense-thinking' | 'Conflict-contrast')[] = [
    'Result-first',
    'Pain-point',
    'Suspense-thinking',
    'Conflict-contrast',
    'Result-first',
  ];

  try {
    const keywordPrompt = `Anda adalah TikTok Shop SEO & Consumer Search Intent Specialist untuk pasar Indonesia.
Analisis produk berikut dan tentukan 8-12 keyword intent serta variasi hook konten video.

Informasi Produk:
- Nama Produk / Konteks: ${derivedProductName}
- Detail Input User: ${productDetails || 'Tidak ada catatan tambahan'}
- Ringkasan Data Produk: ${enrichedInfo ? enrichedInfo.slice(0, 700) : 'Dari foto referensi & link'}

TUGAS UTAMA:
1. Hasilkan 8–12 keyword seeds pencarian TikTok Indonesia yang relevan, dicari audiens lokal, dan bernilai beli tinggi (High Commercial Intent).
2. Klasifikasikan setiap keyword ke dalam salah satu dari 4 intent:
   - "problem" (keluhan/masalah/gejala audiens)
   - "result" (bukti hasil/before-after/efektivitas produk)
   - "curiosity" (review jujur/rasa penasaran/apakah worth it)
   - "price" (harga promo/diskon/murah/hemat)
3. Alokasikan penugasan hookType yang BERBEDA untuk masing-masing ${totalIdeas} ide video:
   Pilihan hookType: "Result-first", "Suspense-thinking", "Conflict-contrast", "Pain-point".
   Setiap ide WAJIB memiliki hookType yang berbeda dan 1 primary_keyword spesifik.

OUTPUT WAJIB JSON KETAT (hanya JSON valid, tanpa markdown pembuka/penutup):
{
  "product_summary": "Nama ringkas produk",
  "keywords": [
    { "keyword": "...", "intent": "problem" },
    { "keyword": "...", "intent": "result" },
    { "keyword": "...", "intent": "curiosity" },
    { "keyword": "...", "intent": "price" }
  ],
  "ideas_hook_assignment": [
    { "idea_number": 1, "hook_type": "Result-first", "primary_keyword": "...", "intent": "result" },
    { "idea_number": 2, "hook_type": "Pain-point", "primary_keyword": "...", "intent": "problem" }
  ]
}`;

    const keywordPayload = {
      contents: {
        parts: [{ text: keywordPrompt }],
      },
    };

    const keywordResult = await callGeminiWithFallback(
      model ? normalizeGeminiModel(model) : 'gemini-2.5-flash',
      keywordPayload,
      customApiKey,
      clientAccessCode,
      'tier3',
      'TikTok Shop Keyword Intent'
    );

    const rawJsonText = keywordResult?.text?.trim() || '';
    const jsonMatch = rawJsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.keywords) && parsed.keywords.length >= 4) {
        classifiedKeywords = parsed.keywords;
      }
      if (Array.isArray(parsed.ideas_hook_assignment) && parsed.ideas_hook_assignment.length > 0) {
        ideasHookAssignments = parsed.ideas_hook_assignment;
      }
    }
  } catch (keywordErr) {
    logger.warn('[TikTok Shop Pipeline] Stage 4: Keyword Intent AI failed, using rule-based fallback:', keywordErr);
  }

  if (classifiedKeywords.length < 4) {
    const baseName = derivedProductName.slice(0, 35).trim() || 'produk tiktok';
    classifiedKeywords = [
      { keyword: `rekomendasi ${baseName}`, intent: 'result' },
      { keyword: `solusi masalah dengan ${baseName}`, intent: 'problem' },
      { keyword: `review jujur ${baseName} viral`, intent: 'curiosity' },
      { keyword: `harga promo diskon ${baseName}`, intent: 'price' },
      { keyword: `${baseName} beneran bagus gak`, intent: 'curiosity' },
      { keyword: `hasil pemakaian ${baseName}`, intent: 'result' },
      { keyword: `kenapa harus beli ${baseName}`, intent: 'problem' },
      { keyword: `voucher gratis ongkir ${baseName}`, intent: 'price' },
    ];
  }

  if (ideasHookAssignments.length === 0) {
    for (let i = 1; i <= totalIdeas; i++) {
      const hook = fallbackHookTypes[(i - 1) % fallbackHookTypes.length];
      const kwObj = classifiedKeywords[(i - 1) % classifiedKeywords.length];
      ideasHookAssignments.push({
        idea_number: i,
        hook_type: hook,
        primary_keyword: kwObj?.keyword || derivedProductName,
        intent: kwObj?.intent || 'result',
      });
    }
  }

  if (onProgress) onProgress(55);

  // =========================================================================
  // STAGE 5: PROMPT ARCHITECT
  // =========================================================================
  logger.info('[TikTok Shop Pipeline] Stage 5: Assembling final_prompt from 5 architectural blocks...');

  let block1VisualRules = '';
  if (identityAnchorDescription) {
    block1VisualRules = `=== BLOCK 1: IDENTITY ANCHOR & STRICT VISUAL CONSISTENCY ===
Karakteristik Fisik Visual Produk Referensi (WAJIB DIJAGA 100% IDENTIK):
${identityAnchorDescription}

ATURAN VISUAL KONSISTEN:
- Setiap deskripsi visual pada semua klip segmen WAJIB menampilkan bentuk kemasan, warna utama, tekstur bahan, dan label yang identik persis dengan deskripsi di atas.
- Dilarang membuat produk berubah wujud, berubah warna kemasan, atau halusinasi merek antar adegan klip.`;
  } else {
    block1VisualRules = `=== BLOCK 1: GENERIC VISUAL RULES & PRODUCT CONSISTENCY ===
ATURAN VISUAL UMUM:
- Tampilkan produk dalam kualitas visual komersial beresolusi tinggi (ultra-sharp, realistic studio or natural lighting aesthetic).
- Pertahankan konsistensi identitas visual produk di setiap adegan (warna, material, proporsi fisik, label kemasan).
- Dilarang membuat visual produk yang berubah-ubah wujudnya di tengah video.`;
  }

  const block2EnrichedData = `=== BLOCK 2: VERIFIED PRODUCT DATA & STRICT CLAIM INTEGRITY ===
Data Hasil Riset / Enrichment Produk:
${enrichedInfo}
Catatan Tambahan User: ${productDetails || 'Tidak ada catatan khusus'}
Target Durasi Video: ${maxSecNum} detik (${expectedClipsCount} klip @ ${segSecNum} detik per klip)

ATURAN KLAIM & FAKTA:
- Semua klaim manfaat, fitur, formula, harga, dan fungsi WAJIB bersandar pada data terverifikasi di atas.
- Dilarang membuat klaim medis berlebihan, klaim instan tanpa dasar, atau janji palsu yang melanggar ketentuan TikTok Shop Indonesia.`;

  const keywordsFormattedText = classifiedKeywords.map((k, idx) => `  ${idx + 1}. "${k.keyword}" (Intent: ${k.intent.toUpperCase()})`).join('\n');
  const hookAssignmentsFormattedText = ideasHookAssignments.map(a => `  - Ide #${a.idea_number}: Hook Type = [${a.hook_type}], Primary Keyword = "${a.primary_keyword}" (${a.intent})`).join('\n');

  const block3KeywordIntent = `=== BLOCK 3: KEYWORD INTENT & HOOK DIVERSITY ===
Daftar Keyword Pencarian TikTok Shop Terklasifikasi:
${keywordsFormattedText}

Penugasan Hook Type & Primary Keyword per Ide (WAJIB DITERAPKAN):
${hookAssignmentsFormattedText}

ATURAN HOOK DIVERSITY:
- Setiap ide WAJIB mengadopsi sudut pandang dan Hook Type yang telah ditentukan agar ragam video tidak monoton.
- Primary keyword yang ditugaskan WAJIB muncul secara eksplisit dalam 3 detik pertama narasi video (baik di teks layar maupun narasi suara).`;

  const block4PatenBinding = `=== BLOCK 4: FORMAT KLIP (WAJIB, JANGAN DILANGGAR) ===
Setiap klip adegan WAJIB ditulis dengan format bersih berikut (jangan buat format lain):

- Setiap klip mulai dengan baris waktu: 0–${segSecNum} detik
  (sesuaikan angka dengan pecahan durasi user, contoh: 0–${segSecNum} detik, ${segSecNum}–${segSecNum * 2} detik, ${segSecNum * 2}–${segSecNum * 3} detik, dst)
- Lanjut field berurutan, masing-masing di baris sendiri:
  Visual: [deskripsi visual detail 1-3 kalimat]
  Aksi: [gerakan konkret]
  voice over: "[teks natural pakai kamu]"
  Subteks: "[teks overlay singkat]"

Contoh persis:
0–${segSecNum} detik
Visual: [deskripsi visual detail 1-3 kalimat]
Aksi: [gerakan konkret subjek dan produk]
voice over: "[teks natural pakai kamu]"
Subteks: "[teks overlay singkat]"

${segSecNum}–${segSecNum * 2} detik
Visual: [deskripsi visual detail 1-3 kalimat berikutnya]
Aksi: [gerakan konkret kelanjutan adegan]
voice over: "[teks natural pakai kamu]"
Subteks: "[teks overlay singkat]"

ATURAN KETAT:
- Setiap klip mulai dengan baris waktu: 0–${segSecNum} detik (sesuaikan angka dengan pecahan durasi).
- Lanjut field berurutan, masing-masing di baris sendiri: Visual:, Aksi:, voice over:, Subteks:.
- Jangan gabungkan semua jadi 1 paragraf tanpa label.
- Jangan pakai [Style] [Camera] [Lighting].
- Jangan pakai header [0–2s] dulu (tunda format kurung siku agar parser stabil).
- Voice over wajib pakai kata "kamu".
- Jumlah klip menyesuaikan totalDuration / promptSplitSec (sekitar ${expectedClipsCount} klip @ ${segSecNum} detik).
- Boleh sebut Stage di dalam Visual/Aksi (opsional), tapi jangan buat header rumit.
- Tanpa BGM atau musik latar sama sekali.`;

  const block5OutputInstructions = `=== BLOCK 5: FORMAT OUTPUT RESMI (STRUKTUR 3 BAGIAN MARKDOWN) ===
FORMAT OUTPUT WAJIB (JANGAN MENGUBAH NAMA BAGIAN ATAU HEADING):

# 🛍️ ANALISIS PRODUK & IDE KONTEN VIRAL TIKTOK SHOP (${maxSecNum}s, ~${expectedClipsCount} Klip)

## 📦 BAGIAN 1: AI ANALISIS PRODUK (5 PILAR UTAMA & ENRICHMENT)
- **Kategori & Positioning**: [Kategori spesifik & positioning produk di pasar]
- **Bahan / Key Ingredients & Formulasi**: [Bahan aktif/material utama, keunggulan formula]
- **Pain Points yang Diselesaikan**: [3 masalah utama konsumen yang diselesaikan]
- **Benefit / Claim Utama**: [Klaim manfaat utama yang terbukti/terasa]
- **Target User & Persona**: [Demografi, usia, gaya hidup, kebiasaan target pembeli]
- **Estimasi Harga / Value for Money**: [Analisis harga dan perbandingan nilai]
- **BPOM / Keamanan / Sertifikasi**: [Status BPOM / Halal / Keamanan jika relevan]
- **Unique Selling Point (USP)**: [Keunikan yang membedakan dari kompetitor]
- **Mood & Tone Konten Ideal**: [Gaya penyampaian video paling cocok]

### 📝 Ringkasan Eksekutif Produk
[1 paragraf ringkasan padat tentang produk dan selling angle terkuatnya]

---

## 🔍 BAGIAN 2: MAPPING QUERY SEO TIKTOK (8-12 QUERY)

1. **Berdasarkan Masalah / Pain Point Konsumen**
- "[query 1]"
- "[query 2]"

2. **Berdasarkan Manfaat & Hasil Pemakaian**
- "[query 3]"
- "[query 4]"

3. **Berdasarkan Merek / Produk & Kategori Terkait**
- "[query 5]"
- "[query 6]"

4. **Berdasarkan Pertanyaan Populer / Mitos vs Fakta**
- "[query 7]"
- "[query 8]"

---

## 🚀 BAGIAN 3: GENERATE ${totalIdeas} IDE KONTEN VIRAL TIKTOK SHOP

Hasilkan persis ${totalIdeas} ide konten kreatif dengan format berikut untuk setiap ide:

### 💡 IDE 1: [Judul Ide Konten & Angle Hook]
- **Query SEO Acuan**: [Sebutkan 1 query dari Bagian 2]
- **Sudut Pandang / Angle**: [Pain Point / Benefit / Before-After / Edukasi / UGC Review / Mitos vs Fakta / Unboxing]
- **Hook Type**: [Result-first / Suspense-thinking / Conflict-contrast / Pain-point sesuai penugasan]
- **Target Audience**: [Sebutkan audiens target spesifik]
- **Hook 3 Detik Pertama (0-3s)**:
  - *Visual*: [Gambaran adegan pembuka yang menghentikan scroll]
  - *Text On Screen (TOS)*: "[Kalimat teks tebal di layar]"
  - *Voice Over (VO)*: "[Kalimat pembuka yang diucapkan (wajib ada primary keyword)]"
- **Rincian Adegan Video & Prompt AI per Segmen (${maxSecNum} Detik)**:
[Tuliskan seluruh segmen adegan klip mengikuti ATURAN FORMAT KLIP WAJIB:
Setiap klip mulai dengan baris waktu: 0–${segSecNum} detik, ${segSecNum}–${segSecNum * 2} detik, dst.

Format persis setiap klip:
0–${segSecNum} detik
Visual: [deskripsi visual detail 1-3 kalimat]
Aksi: [gerakan konkret]
voice over: "[teks natural pakai kamu]"
Subteks: "[teks overlay singkat]"

(Lanjutkan hingga seluruh segmen selesai sesuai total durasi ~${maxSecNum}s. Jangan gabungkan jadi 1 paragraf tanpa label. Jangan pakai header kurung siku [0–2s].)]
- **Call To Action (CTA)**:
  "[Kalimat ajakan klik keranjang kuning / promo stok terbatas]"
- **Rekomendasi Audio & Visual Style**:
  - *Audio / Sound*: [SFX dan Foley suara nyata - TANPA BGM]
  - *Visual Style*: [Pencahayaan, lokasi, prop visual, pacing video]
- **Draft Caption TikTok Shop**:
  [Draft caption persuasif dengan emosi dan klaim produk]
- **Hashtag Relevan**: #Hashtag1 #Hashtag2 #Hashtag3 #Hashtag4 #Hashtag5

(Jika total ide lebih dari 1, buatkan juga ### 💡 IDE 2 dst dengan format yang sama)`;

  const final_prompt = [
    `Anda adalah Master TikTok Shop Strategist, Video Director, dan Indonesian Prompt Engineer spesialis FYP TikTok Shop Indonesia.`,
    block1VisualRules,
    block2EnrichedData,
    block3KeywordIntent,
    block4PatenBinding,
    block5OutputInstructions
  ].join('\n\n');

  if (onProgress) onProgress(65);

  // =========================================================================
  // STAGE 6: CONTENT GENERATOR
  // =========================================================================
  const payloadParts: any[] = [];
  if (referenceImageBase64) {
    payloadParts.push({
      inlineData: {
        mimeType: referenceImageMimeType || 'image/jpeg',
        data: referenceImageBase64,
      },
    });
  }
  payloadParts.push({ text: final_prompt });

  const strictSystemInstruction = `You are a senior TikTok Shop content strategist for Indonesian market.
RULES YOU MUST NEVER BREAK:
1. Output MUST have exactly 3 sections: BAGIAN 1 Analisis Produk, BAGIAN 2 Mapping Query SEO, BAGIAN 3 Ide Konten.
2. Each idea MUST use a DIFFERENT hook type (Result-first / Suspense-thinking / Conflict-contrast / Pain-point).
3. Video structure MUST follow 5 stages: Hook → Pain Scene → Solution Demo → Benefit/Proof → CTA (Stage may be mentioned inside Visual/Aksi optionally, no complicated headers).

CLIP FORMAT (STRICT):
Each clip starts with a time line like: 0–${segSecNum} detik
Then exactly these labels on separate lines:
Visual:
Aksi:
voice over:
Subteks:
Do not omit labels. Do not merge into one paragraph without labels.

4. Always use second person 'kamu' in voice over.
5. Primary keyword MUST appear in the first 3 seconds of voice over.
6. Do NOT invent product claims not present in the provided product data.
7. Language: Bahasa Indonesia natural gaya TikTok.
8. No English bracket tags like [Style], [Camera], [Lighting].`;

  const payload = {
    contents: {
      parts: payloadParts,
    },
    config: {
      systemInstruction: strictSystemInstruction,
    },
  };

  const userSelectedModel = model ? normalizeGeminiModel(model) : undefined;
  let geminiResult = await callGeminiWithFallback(
    userSelectedModel,
    payload,
    customApiKey,
    clientAccessCode,
    'tier2',
    'TikTok Shop Ideas'
  );

  let currentGeneratedText = geminiResult?.text || '';

  let isFormatFlawed = false;
  const isMissingStructure = !currentGeneratedText.includes('BAGIAN 1') ||
                             !currentGeneratedText.includes('BAGIAN 3') ||
                             !isNewClipFormat(currentGeneratedText);

  if (isMissingStructure) {
    logger.warn('[TikTok Shop Pipeline] Stage 6: Output awal kurang lengkap atau bukan format klip teratur, mencoba retry 1x dengan prompt koreksi...');
    try {
      const retryPayload = {
        contents: {
          parts: [
            ...payloadParts,
            {
              text: `\n\nCRITICAL FIX: Output sebelumnya SALAH FORMAT.
CLIP FORMAT (STRICT):
Each clip starts with a time line like: 0–${segSecNum} detik
Then exactly these labels on separate lines:
Visual:
Aksi:
voice over:
Subteks:
Do not omit labels. Do not merge into one paragraph without labels.`,
            },
          ],
        },
        config: {
          systemInstruction: strictSystemInstruction,
          temperature: 0.35,
        },
      };

      const retryResult = await callGeminiWithFallback(
        userSelectedModel,
        retryPayload,
        customApiKey,
        clientAccessCode,
        'tier2',
        'TikTok Shop Ideas'
      );

      if (retryResult?.text && retryResult.text.length > 250) {
        geminiResult = retryResult;
        currentGeneratedText = retryResult.text;
        logger.info('[TikTok Shop Pipeline] Stage 6: Retry berhasil mendapatkan output.');
      }
    } catch (retryErr) {
      logger.warn('[TikTok Shop Pipeline] Stage 6: Retry gagal, melanjutkan dengan output awal:', retryErr);
    }

    if (!isNewClipFormat(currentGeneratedText)) {
      isFormatFlawed = true;
    }
  }

  // =========================================================================
  // STAGE 7: QUALITY VALIDATOR
  // =========================================================================
  logger.info('[TikTok Shop Pipeline] Stage 7: Running Quality Validator (17 points)...');
  let validationResult = validateShopIdeasOutput(currentGeneratedText, !!identityAnchorDescription);
  logger.info(`[TikTok Shop Pipeline] Stage 7 Result: status=${validationResult.status}, score=${validationResult.score}%, failures=${validationResult.failures.length}`);

  // =========================================================================
  // STAGE 7.5: COPY REFINER
  // =========================================================================
  const hashtagCount = (currentGeneratedText.match(/#[a-zA-Z0-9_\u0590-\u05ff\u0600-\u06ff\u0e00-\u0e7f]+/g) || []).length;
  const hasCaptionSection = /Draft\s*Caption/i.test(currentGeneratedText);
  const isCaptionBroken = !hasCaptionSection || hashtagCount < 3;

  if (isCaptionBroken) {
    logger.info('[TikTok Shop Pipeline] Stage 7.5: Detected issues with Caption/Hashtags. Running Copy Refiner...');
    try {
      const copyRefinerPrompt = `Anda adalah TikTok Shop Copywriter Specialist untuk pasar Indonesia.
Perbaiki HANYA bagian Caption dan Hashtag pada setiap Ide Konten berikut.
ATURAN KETAT:
1. JANGAN ubah bagian script, timeline, visual, aksi, atau dialog video klip sama sekali!
2. Setiap Ide WAJIB memiliki "Draft Caption TikTok Shop" yang persuasif, emosional, santai, dan mengandung ajakan cek keranjang kuning.
3. Setiap Ide WAJIB memiliki TEPAT 5 hashtag viral dan relevan (contoh: #NamaProduk #TikTokShopID #RacunTikTok #TipsKeren #PromoSpesial).
4. Kembalikan teks utuh lengkap dengan format persis aslinya (BAGIAN 1, BAGIAN 2, BAGIAN 3), hanya update draft caption dan hashtag yang kosong/kurang.

Teks Lengkap:
${currentGeneratedText}`;

      const copyPayload = {
        contents: {
          parts: [{ text: copyRefinerPrompt }],
        },
        config: {
          systemInstruction: 'Anda adalah spesialis copywriting TikTok Shop. Perbaiki HANYA draft caption dan hashtag menjadi tepat 5 hashtag relevan, tanpa merubah script video.',
          temperature: 0.4,
        },
      };

      const refinerResult = await callGeminiWithFallback(
        userSelectedModel,
        copyPayload,
        customApiKey,
        clientAccessCode,
        'tier3',
        'TikTok Shop Copy Refiner'
      );

      if (refinerResult?.text && refinerResult.text.includes('BAGIAN 1') && refinerResult.text.includes('BAGIAN 3')) {
        currentGeneratedText = refinerResult.text;
        logger.info('[TikTok Shop Pipeline] Stage 7.5: Copy Refiner successfully updated captions & hashtags.');
        validationResult = validateShopIdeasOutput(currentGeneratedText, !!identityAnchorDescription);
      }
    } catch (copyErr) {
      logger.warn('[TikTok Shop Pipeline] Stage 7.5: Copy Refiner failed or timed out, keeping original text:', copyErr);
    }
  }

  // =========================================================================
  // STAGE 8: FINALIZE & SANITIZATION
  // =========================================================================
  const cleanResultText = sanitizeCaptionsAndHashtags(currentGeneratedText);

  const warnings: string[] = [];
  if (validationResult.status === 'rejected') {
    warnings.push(`Output belum lolos validasi penuh (Skor: ${validationResult.score}%): ${validationResult.failures.join(', ')}`);
  }
  if (isFormatFlawed || !isNewClipFormat(cleanResultText)) {
    warnings.push('Format klip belum sempurna, silakan generate ulang jika label Visual/Aksi belum lengkap');
  }

  recordExecutionAndUpgrade('contentIdeas');

  return {
    success: true,
    result: cleanResultText,
    text: cleanResultText,
    modelUsed: geminiResult?.modelUsed || userSelectedModel,
    warnings,
    validationScore: validationResult.score,
  };
}
