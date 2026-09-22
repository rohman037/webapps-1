import { Segment, MicroClip } from '../types';

export interface ValidationResult {
  passed: boolean;
  score: number;
  failures: string[];
}

export function validateOutput(output: string): ValidationResult {
  const failures: string[] = [];
  const text = output || '';

  // C1: Caption ada
  if (!text.includes('CAPTION SEO') && !text.includes('Caption SEO') && !text.includes('CAPTION')) {
    failures.push('Missing CAPTION SEO section');
  }

  // C2: Hashtag ada
  if (!text.includes('HASHTAG') && !text.includes('Hashtag') && !text.includes('#')) {
    failures.push('Missing HASHTAG section');
  }

  // C3: Hashtag minimal 5 buah
  const hashtags = text.match(/#[\w\d_]+/g) || [];
  if (hashtags.length < 5) {
    failures.push(`Expected at least 5 hashtags, got ${hashtags.length}`);
  }

  // C4: Breakdown per segmen ada
  if (!text.includes('SEGMEN') && !text.includes('Segmen') && !text.includes('SEGMENT')) {
    failures.push('Missing SEGMEN breakdown');
  }

  // C5: Micro-clip punya Visual + Aksi + Suara/Subteks
  const visualCount = (text.match(/Visual:/gi) || []).length;
  const aksiCount = (text.match(/Aksi:/gi) || []).length;
  const suaraCount = (text.match(/Suara:/gi) || []).length;
  const subteksCount = (text.match(/Subteks:/gi) || []).length;

  if (visualCount === 0) failures.push('Missing Visual fields');
  if (aksiCount === 0) failures.push('Missing Aksi fields');
  if (suaraCount === 0 && subteksCount === 0) {
    failures.push('Missing Suara/Subteks fields');
  }

  // C6: Master Prompt ada
  if (!text.includes('MASTER PROMPT') && !text.includes('Master Prompt') && !text.includes('MASTER')) {
    failures.push('Missing MASTER PROMPT');
  }

  // C7: Negative Prompt ada
  if (!text.includes('NEGATIVE PROMPT') && !text.includes('Negative Prompt') && !text.includes('NEGATIVE')) {
    failures.push('Missing NEGATIVE PROMPT');
  }

  // C8: Ringkasan Teknis ada
  if (!text.includes('RINGKASAN TEKNIS') && !text.includes('Ringkasan Teknis') && !text.includes('TEKNIKAL')) {
    failures.push('Missing RINGKASAN TEKNIS');
  }

  // C9: Tidak ada placeholder yang belum diisi
  if (text.includes('[isi') || text.includes('[TODO') || text.includes('XXX') || text.includes('[N]')) {
    failures.push('Found unfilled placeholders');
  }

  const totalChecks = 9;
  const score = Math.max(0, Math.round(((totalChecks - failures.length) / totalChecks) * 100));

  return {
    passed: score >= 75 && failures.length <= 2,
    score,
    failures,
  };
}

/**
 * Utility parser to extract structured entities from markdown if needed
 */
export function parseMarkdownToStructuredOutput(markdown: string): {
  caption?: string;
  hashtags: string[];
  segments: Segment[];
  masterPrompt?: string;
  negativePrompt?: string;
} {
  const hashtags = Array.from(new Set(markdown.match(/#[\w\d_]+/g) || [])).slice(0, 5);

  let caption = '';
  const captionMatch = markdown.match(/##\s*📋?\s*CAPTION[^\n]*\n([\s\S]*?)(?=##|$)/i);
  if (captionMatch) {
    caption = captionMatch[1].trim();
  }

  let masterPrompt = '';
  const masterMatch = markdown.match(/##\s*🎯?\s*MASTER PROMPT[^\n]*\n([\s\S]*?)(?=##|$)/i);
  if (masterMatch) {
    masterPrompt = masterMatch[1].trim();
  }

  let negativePrompt = '';
  const negMatch = markdown.match(/##\s*🚫?\s*NEGATIVE PROMPT[^\n]*\n([\s\S]*?)(?=##|$)/i);
  if (negMatch) {
    negativePrompt = negMatch[1].trim();
  }

  const segments: Segment[] = [];
  const segmentRegex = /###\s*📹?\s*SEGMEN\s*(\d+)[\s—\-]*\[?([^\]\n]*)\]?[\s\S]*?\*\*Stage:\s*([^\*]+)\*\*[\s\S]*?```([\s\S]*?)```/gi;
  let match;
  while ((match = segmentRegex.exec(markdown)) !== null) {
    const segIdx = parseInt(match[1], 10) || segments.length + 1;
    const timeRange = (match[2] || '').trim();
    const stageLabel = (match[3] || '').trim();
    const rawClipsText = match[4] || '';

    const microClips: MicroClip[] = [];
    const clipBlocks = rawClipsText.split(/\n(?=\d+[–\-\.]\d+|\d+\s*detik)/i);
    for (const block of clipBlocks) {
      const timeMatch = block.match(/^([^\n]+)/);
      const visMatch = block.match(/Visual:\s*([^\n]+)/i);
      const aksMatch = block.match(/Aksi:\s*([^\n]+)/i);
      const suaMatch = block.match(/Suara:\s*"?([^"\n]+)"?/i);
      const subMatch = block.match(/Subteks:\s*"?([^"\n]+)"?/i);

      if (visMatch || aksMatch) {
        microClips.push({
          timeRange: timeMatch ? timeMatch[1].trim() : '',
          visual: visMatch ? visMatch[1].trim() : '',
          aksi: aksMatch ? aksMatch[1].trim() : '',
          suara: suaMatch ? suaMatch[1].trim() : null,
          subteks: subMatch ? subMatch[1].trim() : null,
        });
      }
    }

    segments.push({
      segmentIndex: segIdx,
      timeRange,
      stageLabel,
      microClips,
    });
  }

  return {
    caption,
    hashtags,
    segments,
    masterPrompt,
    negativePrompt,
  };
}
