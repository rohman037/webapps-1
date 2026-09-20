export function sanitizeCaptionsAndHashtags(text: string): string {
  if (!text) return text;

  const BANNED_SPAM_TAGS = new Set([
    'fyp', 'fypシ', 'fypviral', 'foryou', 'foryoupage', 'racuntiktok',
    'racuntiktokshop', 'viral', 'viralvideo', 'trending', 'trendingvideo',
    'beranda', 'fypindonesia', 'fyppage', 'viraltiktok', 'foryourpage',
    'racunshopee', 'racuntiktokmurah', 'gayaingatfyp'
  ]);

  let result = text;

  // 1. Clean spam phrasing in caption text
  result = result
    .replace(/\b(racun\s*tik\s*tok|racun\s*tiktok)\b/gi, 'rekomendasi produk pilihan')
    .replace(/\b(for\s*your\s*page|f\s*y\s*p|fyp)\b/gi, 'pencarian sosial media')
    .replace(/\b(viral\s*di\s*tiktok|viral\s*tiktok)\b/gi, 'banyak dicari');

  // 2. Sanitize explicit Hashtag markdown sections
  const hashtagSectionRegex = /(\*\*(?:Hashtags?[^\n]*|Hashtag[^\n]*)\*\*[:\s]*\n*)([\s\S]*?)(?=\n*---|\n*###|\n-|\n\n|$)/gi;
  result = result.replace(hashtagSectionRegex, (fullMatch, prefix, hashtagsContent) => {
    const rawTags = hashtagsContent.match(/#[\w\u0590-\u05ff\u0600-\u06ff\u0e00-\u0e7f_]+/g) || [];
    const validTags: string[] = [];
    
    for (const tag of rawTags) {
      const cleanTag = tag.slice(1).toLowerCase();
      if (!BANNED_SPAM_TAGS.has(cleanTag) && !validTags.includes(tag)) {
        validTags.push(tag);
      }
    }

    const clamped = validTags.slice(0, 5);
    if (clamped.length > 0) {
      return `${prefix}${clamped.join(' ')}\n`;
    }
    return fullMatch;
  });

  // 3. Global inline hashtag cluster cleanup (any group of hashtags)
  result = result.replace(/((?:#[a-zA-Z0-9_\u0590-\u05ff\u0600-\u06ff\u0e00-\u0e7f]+\s*){2,})/g, (match) => {
    const rawTags = match.match(/#[\w\u0590-\u05ff\u0600-\u06ff\u0e00-\u0e7f_]+/g) || [];
    const validTags: string[] = [];
    
    for (const tag of rawTags) {
      const cleanTag = tag.slice(1).toLowerCase();
      if (!BANNED_SPAM_TAGS.has(cleanTag) && !validTags.includes(tag)) {
        validTags.push(tag);
      }
    }
    
    return validTags.slice(0, 5).join(' ');
  });

  return result;
}
