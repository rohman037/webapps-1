import { logger } from '@/server/core/utils/logger';
import { LinkEnricherInput, LinkEnricherOutput } from '../types';

export async function enrichProductLink(inputOrUrl: LinkEnricherInput | string): Promise<LinkEnricherOutput> {
  const shopUrl = typeof inputOrUrl === 'string' ? inputOrUrl : (inputOrUrl?.shopUrl || '');
  const trimmedShopUrl = shopUrl.trim();

  if (!trimmedShopUrl) {
    return {
      enrichedInfo: 'Tidak ada link produk disediakan. Menggunakan data input user / foto referensi.',
      enrichedProductName: '',
      enrichedPrice: '',
      enrichedDescription: '',
    };
  }

  logger.info(`[link-enricher] Enriching metadata from URL: ${trimmedShopUrl}`);
  try {
    let cleanUrl = trimmedShopUrl;
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }

    let sitePlatform = 'TikTok Shop / E-Commerce';
    if (cleanUrl.includes('tiktok.com') || cleanUrl.includes('vt.tiktok.com') || cleanUrl.includes('shop.tiktok.com'))
      sitePlatform = 'TikTok Shop';
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
            'User-Agent':
              'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
          },
        });
        clearTimeout(timeoutTimer);

        if (res.ok) {
          finalUrl = res.url || cleanUrl;
          htmlText = await res.text();
          break;
        }
      } catch (fetchErr) {
        if (attempt === 1) {
          logger.warn('[link-enricher] Fetch retry reached limit:', fetchErr);
        }
      }
    }

    let enrichedProductName = '';
    let enrichedPrice = '';
    let enrichedDescription = '';

    if (htmlText) {
      const noScriptHtml = htmlText
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
        .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ');

      const ogTitleMatch =
        htmlText.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
        htmlText.match(/<meta[^>]*name=["']title["'][^>]*content=["']([^"']+)["']/i) ||
        htmlText.match(/<title>([^<]+)<\/title>/i);

      const ogDescMatch =
        htmlText.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ||
        htmlText.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);

      const priceMatch =
        htmlText.match(/<meta[^>]*property=["'](?:product:price:amount|og:price:amount)["'][^>]*content=["']([^"']+)["']/i) ||
        htmlText.match(/Rp\s*[\d\.,]+/i) ||
        htmlText.match(/IDR\s*[\d\.,]+/i);

      if (ogTitleMatch) {
        enrichedProductName = ogTitleMatch[1]
          .replace(/&#x27;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .trim();
      }
      if (ogDescMatch) {
        enrichedDescription = ogDescMatch[1]
          .replace(/&#x27;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .trim();
      }
      if (priceMatch) {
        enrichedPrice = (priceMatch[0] || priceMatch[1] || '').trim();
      }

      const textSnippet = noScriptHtml
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 3000);

      const enrichedInfo = `[DATA HASIL ENRICHMENT LINK TIKTOK SHOP]
Platform: ${sitePlatform}
Original Link: ${cleanUrl}
Expanded Final Link: ${finalUrl}
Judul Halaman / Nama Produk: ${enrichedProductName || urlSlugKeywords || 'Dari slug link: ' + (urlSlugKeywords || 'Lihat catatan input')}
Estimasi Harga: ${enrichedPrice || 'Sesuai etalase toko'}
Deskripsi Produk / Meta: ${enrichedDescription || 'Tersedia di etalase'}
Ringkasan Konten Teks Halaman (Max ~3000 Karakter):
${textSnippet}`;

      return {
        enrichedInfo,
        enrichedProductName,
        enrichedPrice,
        enrichedDescription,
      };
    }
  } catch (err) {
    logger.warn('[link-enricher] Error during link enrichment:', err);
  }

  return {
    enrichedInfo: 'Gagal fetch otomatis. Gunakan data dari link + input user.',
    enrichedProductName: '',
    enrichedPrice: '',
    enrichedDescription: '',
  };
}
