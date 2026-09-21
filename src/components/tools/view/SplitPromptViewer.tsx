import React, { useState } from 'react';
import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import {
  FileText,
  Hash,
  Film,
  Copy,
  Check,
  Camera,
  Download,
  Sparkles,
  ListFilter,
} from 'lucide-react';
import { learningSync } from '../../../lib/learningSync';
import BatchPhotoPromptModal from '../../modals/BatchPhotoPromptModal';

export interface SplitPromptViewerProps {
  rawPrompt: string;
  segmentDuration?: string;
  targetAI?: string;
  sourceCaption?: string;
  onSendToPhotoPrompt?: (
    text: string,
    options?: {
      autoGenerate?: boolean;
      aspectRatio?: string;
      photoStyle?: string;
      targetGenerator?: string;
      negativePrompt?: string;
      referenceImage?: File;
    }
  ) => void;
}

export interface ClipSegment {
  id: number;
  title: string;
  timestamp: string;
  startSec?: number;
  endSec?: number;
  durationSec?: number;
  visual: string;
  aksi: string;
  voiceOver?: string;
  subteks?: string;
  lensInfo?: string;
  cameraMotion?: string;
  lightingInfo?: string;
  roleTag?: string;
  wordCount?: number;
  estVoiceDurationSec?: number;
  masterPrompt: string;
  content: string;
}

export interface SeoCaptionInfo {
  caption: string;
  hashtags: string;
  cleanCaptionWithoutTags?: string;
  tagsList: string[];
  charCount: number;
  wordCount: number;
}

export function extractStructuredData(rawText: string): any | null {
  if (!rawText) return null;
  const match = rawText.match(/<!--\s*STRUCTURED_DATA:\s*([\s\S]*?)\s*-->/);
  if (match) {
    try {
      return JSON.parse(match[1].trim());
    } catch (e) {}
  }
  if (rawText.trim().startsWith('{')) {
    try {
      return JSON.parse(rawText.trim());
    } catch (e) {}
  }
  return null;
}

export function parseSeoCaptionAndHashtags(rawText: string): SeoCaptionInfo | null {
  if (!rawText) return null;

  const structured = extractStructuredData(rawText);
  if (structured && (structured.caption || structured.hashtags)) {
    const cap = (structured.caption || '').trim();
    const hash = (structured.hashtags || '').trim();
    const tagMatches = hash.match(/#[\w\u0590-\u05ff\u0600-\u06ff\u0e00-\u0e7f_]+/g) || [];
    const tagsList = tagMatches.slice(0, 5);
    const combined = `${cap}\n\n${tagsList.join(' ')}`.trim();
    return {
      caption: combined,
      hashtags: tagsList.join(' '),
      cleanCaptionWithoutTags: cap,
      tagsList,
      charCount: combined.length,
      wordCount: combined ? combined.split(/\s+/).filter(Boolean).length : 0,
    };
  }

  // Check for caption & hashtag section
  const sectionMatch = rawText.match(/(?:###|\*\*)\s*(?:📱|🔥|✨)?\s*CAPTION\s*(?:&|DAN)?\s*HASHTAG[\s\S]*$/i);
  const targetText = sectionMatch ? sectionMatch[0] : rawText;

  // Match Caption
  const captionMatch =
    targetText.match(/\*\*Caption[^\n]*\*\*[:\s]*\n*([\s\S]*?)(?=\n*\*\*(?:Hashtags?|Tag|Hashtag Viral)|$)/i) ||
    targetText.match(/(?:Caption SEO|Caption FYP|Caption)[:\s]*\n*([\s\S]*?)(?=\n*(?:#|Hashtag|\*\*Hashtag)|$)/i);

  // Match Hashtags
  const hashtagsMatch =
    targetText.match(/\*\*Hashtags?[^\n]*\*\*[:\s]*\n*([\s\S]*?)(?=\n*---|\n*###|$)/i) ||
    targetText.match(/(?:Hashtags?|Hashtag Viral|Tags?)[:\s]*\n*([\s\S]*?)(?=\n*---|\n*###|$)/i) ||
    targetText.match(/((?:#[\w\u0590-\u05ff\u0600-\u06ff\u0e00-\u0e7f_]+\s*){2,})/i);

  let caption = captionMatch ? captionMatch[1].trim() : '';
  let hashtags = hashtagsMatch ? hashtagsMatch[1].trim() : '';

  // Clean markdown quotes or backticks if any
  caption = caption.replace(/^>+\s*/gm, '').replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
  hashtags = hashtags.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

  // If hashtags was captured in caption, split them cleanly
  if (!hashtags && caption.includes('#')) {
    const hashIdx = caption.indexOf('#');
    hashtags = caption.slice(hashIdx).trim();
    caption = caption.slice(0, hashIdx).trim();
  }

  // Clean spam phrasing from caption
  if (caption) {
    caption = caption
      .replace(/\b(racun\s*tik\s*tok|racun\s*tiktok)\b/gi, 'rekomendasi produk pilihan')
      .replace(/\b(for\s*your\s*page|f\s*y\s*p|fyp)\b/gi, 'pencarian sosial media')
      .replace(/\b(viral\s*di\s*tiktok|viral\s*tiktok)\b/gi, 'banyak dicari');
  }

  let tagsList: string[] = [];

  // Ensure maximum 5 hashtags strictly & filter generic spam tags
  if (hashtags) {
    const tagList = hashtags.match(/#[\w\u0590-\u05ff\u0600-\u06ff\u0e00-\u0e7f_]+/g);
    if (tagList) {
      const BANNED_SPAM = new Set([
        'fyp',
        'fypシ',
        'fypviral',
        'foryou',
        'foryoupage',
        'racuntiktok',
        'racuntiktokshop',
        'viral',
        'viralvideo',
        'trending',
        'beranda',
        'fyppage',
        'foryourpage',
      ]);
      const filtered = tagList.filter((t) => !BANNED_SPAM.has(t.replace('#', '').toLowerCase()));
      const finalTags = (filtered.length > 0 ? filtered : tagList).slice(0, 5);
      tagsList = finalTags;
      hashtags = finalTags.join(' ');
    }
  }

  if (caption || hashtags) {
    const charCount = caption.length;
    const wordCount = caption ? caption.split(/\s+/).filter(Boolean).length : 0;
    return {
      caption,
      hashtags,
      tagsList,
      charCount,
      wordCount,
    };
  }

  return null;
}

function extractSegmentDetails(body: string, id: number, totalClips: number) {
  // Visual match
  const visualMatch = body.match(
    /(?:\*\*|\*|__)?Visual(?:\*\*|\*|__)?\s*:\s*([\s\S]*?)(?=\n\s*(?:\*\*|\*|__)?(?:Aksi|Voice\s*Over|Voiceover|VO|Subteks|Teks\s*Layar|Prompt)(?:\*\*|\*|__)?\s*:|$)/i
  );

  // Aksi match
  const aksiMatch = body.match(
    /(?:\*\*|\*|__)?Aksi(?:\s*Kamera)?(?:\*\*|\*|__)?\s*:\s*([\s\S]*?)(?=\n\s*(?:\*\*|\*|__)?(?:Visual|Voice\s*Over|Voiceover|VO|Subteks|Teks\s*Layar)(?:\*\*|\*|__)?\s*:|$)/i
  );

  // Voice Over match
  const voMatch = body.match(
    /(?:\*\*|\*|__)?(?:Voice\s*Over|Voiceover|VO|Dialog|Narasi)(?:\*\*|\*|__)?\s*:\s*([\s\S]*?)(?=\n\s*(?:\*\*|\*|__)?(?:Visual|Aksi|Subteks|Teks\s*Layar)(?:\*\*|\*|__)?\s*:|$)/i
  );

  // Subteks match
  const subMatch = body.match(
    /(?:\*\*|\*|__)?(?:Subteks|Teks\s*Layar|Text\s*Overlay|Overlay)(?:\*\*|\*|__)?\s*:\s*([\s\S]*?)(?=\n\s*(?:\*\*|\*|__)?(?:Visual|Aksi|Voice\s*Over|Voiceover|VO)(?:\*\*|\*|__)?\s*:|$)/i
  );

  let visual = visualMatch ? visualMatch[1].trim() : '';
  let aksi = aksiMatch ? aksiMatch[1].trim() : '';
  let voiceOver = voMatch ? voMatch[1].trim() : '';
  let subteks = subMatch ? subMatch[1].trim() : '';

  // Clean markdown delimiters
  visual = visual.replace(/^>+\s*/gm, '').replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
  aksi = aksi.replace(/^>+\s*/gm, '').replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
  voiceOver = voiceOver.replace(/^>+\s*/gm, '').replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
  subteks = subteks.replace(/^>+\s*/gm, '').replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

  // Fallback: If neither visual nor aksi found, treat plain text body as visual
  if (!visual && !aksi && !voiceOver && !subteks) {
    visual = body.replace(/```[a-z]*\n?/gi, '').replace(/\n?```/gi, '').trim();
  }

  // Optical & Technical metadata extraction
  const combinedText = `${visual} ${aksi}`;

  // Lens & Framing
  const lensMatch = visual.match(/\b\d{1,3}mm(?:\s+anamorphic)?\b/i);
  const shotMatch = visual.match(
    /\b(macro(?:\s+shot)?|extreme\s+close-up|close-up|wide(?:\s+shot)?|medium(?:\s+shot)?|cutaway(?:\s+teknikal)?|hero(?:\s+shot)?|establishing\s+shot|overhead|low-angle|high-angle|dutch\s+angle)\b/i
  );
  let lensInfo = '';
  if (shotMatch && lensMatch) {
    lensInfo = `${shotMatch[0]} ${lensMatch[0]}`;
  } else if (shotMatch) {
    lensInfo = shotMatch[0];
  } else if (lensMatch) {
    lensInfo = `Lensa ${lensMatch[0]}`;
  }

  // Camera Motion
  const motionMatch = combinedText.match(
    /\b(push-in(?:\s+cepat|\s+lambat|\s+halus)?|pull-out|dolly-in|dolly-out|tilt-down|tilt-up|orbit(?:\s+\d+\s*(?:derajat|°))?|slow\s+pan|pan(?:\s+kiri|\s+kanan|\s+halus)?|handheld(?:\s+dinamis)?|tracking(?:\s+shot)?|crane(?:\s+shot)?|zoom-in|zoom-out|static(?:\s+shot)?)\b/i
  );
  const cameraMotion = motionMatch ? motionMatch[0] : '';

  // Lighting & Mood
  const lightMatch = visual.match(
    /\b(chiaroscuro(?:\s+bernuansa\s+[\w\-]+)?|studio\s+dramatis|teal-orange|golden\s+hour|softbox|neon(?:\s+rim)?|cinematic\s+moody|natural\s+daylight|high\s+contrast|rim\s+light(?:ing)?)\b/i
  );
  const lightingInfo = lightMatch ? lightMatch[0] : '';

  let roleTag = 'Adegan Sinematik';
  if (id === 1) {
    roleTag = 'Hook Visual (0-3s)';
  } else if (id === 2) {
    roleTag = 'Eskalasi Masalah';
  } else if (id === totalClips && totalClips > 2) {
    roleTag = 'Call to Action';
  } else {
    roleTag = 'Solusi & Demo';
  }

  const wordCount = voiceOver ? voiceOver.split(/\s+/).filter(Boolean).length : 0;
  const estVoiceDurationSec = Math.max(1, Math.round(wordCount / 2.5));

  // Construct standard Master Prompt AI matching the screenshot:
  // Visual: ... Aksi: ... voice over: ...
  const promptParts: string[] = [];
  if (visual) promptParts.push(`Visual: ${visual}`);
  if (aksi) promptParts.push(`Aksi: ${aksi}`);
  if (voiceOver) promptParts.push(`voice over: ${voiceOver}`);
  if (subteks) promptParts.push(`Subteks: ${subteks}`);

  const masterPrompt = promptParts.join(' ').trim() || body;

  return {
    visual,
    aksi,
    voiceOver,
    subteks,
    lensInfo,
    cameraMotion,
    lightingInfo,
    roleTag,
    wordCount,
    estVoiceDurationSec,
    masterPrompt,
  };
}

export function parseClipSegments(rawText: string, defaultDurationSec = 10): ClipSegment[] {
  if (!rawText) return [];

  // Check if structured data exists (100% reliable direct JSON parsing)
  const structured = extractStructuredData(rawText);
  if (structured && Array.isArray(structured.shots) && structured.shots.length > 0) {
    const totalClips = structured.shots.length;
    return structured.shots.map((shot: any, index: number) => {
      const id = index + 1;
      const startSec = typeof shot.startSec === 'number' ? shot.startSec : index * defaultDurationSec;
      const endSec = typeof shot.endSec === 'number' ? shot.endSec : (index + 1) * defaultDurationSec;
      const durationSec = Math.max(1, Math.round(endSec - startSec));
      const timestamp = `${startSec}–${endSec} detik`;

      const visual = shot.scene || shot.subject || structured.global?.style || 'Visual adegan sinematik';
      const actionsList = Array.isArray(shot.actions) ? shot.actions : (shot.actions ? [shot.actions] : []);
      const aksi = actionsList.join('. ');
      const voiceOver = shot.dialogue || shot.voiceOver || '';
      const subteks = shot.onScreenText || '';

      const lensInfo = shot.cameraChange || structured.cinematography?.lens || structured.cinematography?.framing || 'Standar Lensa';
      const cameraMotion = shot.cameraChange || structured.cinematography?.cameraMovement || 'Kamera Dinamis';
      const lightingInfo = shot.lightingChange || structured.cinematography?.lighting || 'Pencahayaan Natural';

      let roleTag = 'Adegan Sinematik';
      if (id === 1) {
        roleTag = 'Hook Visual (0-3s)';
      } else if (id === 2) {
        roleTag = 'Eskalasi Masalah';
      } else if (id === totalClips && totalClips > 2) {
        roleTag = 'Call to Action';
      }

      const voiceWords = voiceOver.trim() ? voiceOver.trim().split(/\s+/).filter(Boolean) : [];
      const wordCount = voiceWords.length;
      const estVoiceDurationSec = Math.max(1, Math.round((wordCount / 140) * 60));

      const masterPrompt = shot.generationPrompt ||
        `${structured.global?.style || 'Cinematic video'}, ${visual}, ${aksi}, ${lensInfo}, ${lightingInfo}, 8K photorealistic`;

      const content = `${visual}\n${aksi}\n${voiceOver ? `voice over: ${voiceOver}` : (subteks ? `Subteks: ${subteks}` : '')}`.trim();

      return {
        id,
        title: `Segmen Prompt Klip ${id}`,
        timestamp,
        startSec,
        endSec,
        durationSec,
        content,
        visual,
        aksi,
        voiceOver,
        subteks,
        lensInfo,
        cameraMotion,
        lightingInfo,
        roleTag,
        wordCount,
        estVoiceDurationSec,
        masterPrompt,
      };
    });
  }

  // Strip caption/hashtag section from the clips body
  const clipsPart = rawText.split(/(?:###|\*\*)\s*(?:📱|🔥|✨)?\s*CAPTION\s*(?:&|DAN)?\s*HASHTAG/i)[0];

  const segments: ClipSegment[] = [];

  // Pattern 1: "0–10 detik" / "0-10 detik" / "0 – 10 detik"
  const timelineRegex =
    /(?:^|\n)\s*(\d+(?:[.,]\d+)?)\s*[–\-—]\s*(\d+(?:[.,]\d+)?)\s*(?:detik|s|sec)?\s*\n([\s\S]*?)(?=(?:\n\s*\d+(?:[.,]\d+)?\s*[–\-—]\s*\d+(?:[.,]\d+)?\s*(?:detik|s|sec)?)|$)/gi;

  const matches: Array<{ start: string; end: string; body: string }> = [];
  let m;
  while ((m = timelineRegex.exec(clipsPart)) !== null) {
    matches.push({
      start: m[1].replace(',', '.'),
      end: m[2].replace(',', '.'),
      body: m[3].trim(),
    });
  }

  // Pattern 2: "KLIP 1" / "Segmen 1"
  if (matches.length === 0) {
    const clipBlockRegex =
      /(?:###|##|\*\*)\s*(?:🎬|🎥)?\s*(?:KLIP|Segmen|Scene)\s*(\d+)[^\n]*\n([\s\S]*?)(?=(?:\n\s*(?:###|##|\*\*)\s*(?:🎬|🎥)?\s*(?:KLIP|Segmen|Scene)\s*\d+)|$)/gi;
    let cm;
    let idx = 0;
    while ((cm = clipBlockRegex.exec(clipsPart)) !== null) {
      idx++;
      const startS = (idx - 1) * defaultDurationSec;
      const endS = idx * defaultDurationSec;
      matches.push({
        start: String(startS),
        end: String(endS),
        body: cm[2].trim(),
      });
    }
  }

  // Pattern 3: Fallback split by double horizontal rule or headers
  if (matches.length === 0) {
    const parts = clipsPart
      .split(/\n\s*---\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 1) {
      parts.forEach((p, idx) => {
        const startS = idx * defaultDurationSec;
        const endS = (idx + 1) * defaultDurationSec;
        matches.push({
          start: String(startS),
          end: String(endS),
          body: p,
        });
      });
    }
  }

  // Fallback to single clip
  if (matches.length === 0 && clipsPart.trim()) {
    matches.push({
      start: '0',
      end: String(defaultDurationSec),
      body: clipsPart.trim(),
    });
  }

  matches.forEach((item, index) => {
    const id = index + 1;
    const startSec = parseFloat(item.start) || 0;
    const endSec = parseFloat(item.end) || startSec + defaultDurationSec;
    const durationSec = Math.max(1, endSec - startSec);
    const timestamp = `${startSec}–${endSec} detik`;
    const details = extractSegmentDetails(item.body, id, matches.length);

    segments.push({
      id,
      title: `Segmen Prompt Klip ${id}`,
      timestamp,
      startSec,
      endSec,
      durationSec,
      content: item.body,
      ...details,
    });
  });

  return segments;
}

export default function SplitPromptViewer({
  rawPrompt,
  segmentDuration = '10',
  targetAI = 'GENERAL',
  sourceCaption,
  onSendToPhotoPrompt,
}: SplitPromptViewerProps) {
  const [viewMode, setViewMode] = useState<'cards' | 'raw'>('cards');
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [copiedHashtags, setCopiedHashtags] = useState(false);
  const [copiedTag, setCopiedTag] = useState<string | null>(null);
  const [copiedAllPrompts, setCopiedAllPrompts] = useState(false);
  const [copiedClipKey, setCopiedClipKey] = useState<string | null>(null);
  const [isBatchPhotoModalOpen, setIsBatchPhotoModalOpen] = useState(false);

  const seoInfo = parseSeoCaptionAndHashtags(rawPrompt);
  const defaultSec = parseInt(segmentDuration, 10) || 10;
  const segments = parseClipSegments(rawPrompt, defaultSec);

  const displayCaption = seoInfo?.caption || sourceCaption || '';
  const hashtagChips = seoInfo?.tagsList && seoInfo.tagsList.length > 0 ? seoInfo.tagsList.slice(0, 5) : [];

  // Copy individual hashtag
  const handleCopyTag = (tag: string) => {
    navigator.clipboard.writeText(tag);
    setCopiedTag(tag);
    setTimeout(() => setCopiedTag(null), 2000);
  };

  // Copy caption only
  const handleCopyCaption = () => {
    if (!displayCaption) return;
    navigator.clipboard.writeText(displayCaption.trim());
    setCopiedCaption(true);
    setTimeout(() => setCopiedCaption(false), 2000);
    learningSync.track('caption_copied', { length: displayCaption.length });
  };

  // Copy hashtags only
  const handleCopyHashtags = () => {
    if (hashtagChips.length === 0) return;
    const textToCopy = hashtagChips.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ');
    navigator.clipboard.writeText(textToCopy);
    setCopiedHashtags(true);
    setTimeout(() => setCopiedHashtags(false), 2000);
  };

  // Copy all clip prompts
  const handleCopyAllPrompts = () => {
    if (segments.length === 0) return;
    const combined = segments
      .map((clip) => {
        const p = (clip.masterPrompt || clip.content || '').trim().replace(/^```(?:text)?\n?|```$/g, '');
        return `[Klip ${clip.id} - ${clip.timestamp}]\n${p}`;
      })
      .join('\n\n---\n\n');

    navigator.clipboard.writeText(combined);
    setCopiedAllPrompts(true);
    setTimeout(() => setCopiedAllPrompts(false), 2500);
    learningSync.track('prompt_copied', { type: 'all_clips', total: segments.length });
  };

  // Copy individual clip prompt
  const handleCopyClipPrompt = (clipId: number, text: string) => {
    const cleanText = text.trim().replace(/^```(?:text)?\n?|```$/g, '');
    navigator.clipboard.writeText(cleanText);
    const key = `clip_${clipId}`;
    setCopiedClipKey(key);
    setTimeout(() => setCopiedClipKey(null), 2000);
    learningSync.track('prompt_copied', { type: 'single_clip', clipId });
  };

  // Download all as TXT
  const handleDownloadTxt = () => {
    const text = [
      `=== EKSTRAK PROMPT VIDEO ===`,
      `Target AI: ${targetAI.toUpperCase()}`,
      `Durasi Per Klip: ${segmentDuration} Detik\n`,
      `--- CAPTION SEO ---`,
      displayCaption || '',
      `\n--- HASHTAG RELEVAN (MAX 5) ---`,
      hashtagChips.join(' '),
      `\n--- MASTER PROMPTS PER KLIP ---`,
      ...segments.map(
        (s) =>
          `\n[KLIP ${s.id} - ${s.timestamp}]\n${(s.masterPrompt || s.content || '').trim().replace(/^```(?:text)?\n?|```$/g, '')}`
      ),
    ].join('\n');

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ekstrak-prompt-video-${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Utility Bar */}
      <div className="flex items-center justify-end gap-2 pb-1">
        <button
          type="button"
          onClick={() => setViewMode(viewMode === 'cards' ? 'raw' : 'cards')}
          className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
        >
          <FileText className="w-3.5 h-3.5 text-slate-600" />
          <span>{viewMode === 'cards' ? 'Format Markdown' : 'Tampilan Kartu'}</span>
        </button>

        <button
          type="button"
          onClick={handleDownloadTxt}
          className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
          title="Unduh seluruh prompt dalam file teks"
        >
          <Download className="w-3.5 h-3.5 text-slate-600" />
          <span>Unduh .TXT</span>
        </button>
      </div>

      {viewMode === 'raw' ? (
        /* Markdown Raw View */
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
              Format Output Markdown Mentah
            </span>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold cursor-pointer hover:bg-blue-100 transition-colors"
            >
              Kembali ke Tampilan Kartu
            </button>
          </div>
          <div className="markdown-body text-slate-800 text-xs sm:text-sm leading-relaxed space-y-4">
            <ReactMarkdown>{rawPrompt}</ReactMarkdown>
          </div>
        </div>
      ) : (
        /* Unified Cards View matching Image 1 (4).jpeg exactly */
        <div className="space-y-6">
          {/* 1. CAPTION SEO TIKTOK / REELS / SHORTS CARD */}
          {displayCaption && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-6 sm:p-7 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-sky-600" />
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Caption SEO TikTok / Reels / Shorts
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyCaption}
                  className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                >
                  {copiedCaption ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                  )}
                  <span>{copiedCaption ? 'Tersalin' : 'Salin Caption'}</span>
                </button>
              </div>
              <p className="text-slate-800 text-sm leading-relaxed whitespace-pre-wrap font-normal">
                {displayCaption}
              </p>
            </motion.div>
          )}

          {/* 2. HASHTAG RELEVAN & SEO SEARCH (MAX 5 TAG) CARD */}
          {hashtagChips.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="p-6 sm:p-7 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Hash className="w-4 h-4 text-sky-600" />
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Hashtag Relevan & SEO Search (Max 5 Tag)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyHashtags}
                  className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                >
                  {copiedHashtags ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                  )}
                  <span>{copiedHashtags ? 'Tersalin' : 'Salin Hashtag'}</span>
                </button>
              </div>
              <div className="flex items-center gap-2.5 flex-wrap pt-0.5">
                {hashtagChips.map((tag, tIdx) => {
                  const cleanTag = tag.startsWith('#') ? tag : `#${tag}`;
                  const isThisCopied = copiedTag === cleanTag;
                  return (
                    <button
                      key={tIdx}
                      type="button"
                      onClick={() => handleCopyTag(cleanTag)}
                      className="group px-3 py-1.5 rounded-lg bg-sky-50/80 hover:bg-sky-100 text-sky-700 border border-sky-200/60 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                      title={`Salin ${cleanTag}`}
                    >
                      <span>{cleanTag}</span>
                      {isThisCopied ? (
                        <Check className="w-3 h-3 text-emerald-600" />
                      ) : (
                        <Copy className="w-3 h-3 text-sky-400 group-hover:text-sky-600 opacity-70 group-hover:opacity-100 transition-opacity" />
                      )}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* 3. HASIL SPLIT PROMPT VIDEO SECTION */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-4 pt-1"
          >
            {/* Section Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-2xs">
                  <Film className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                    Hasil Split Prompt Video
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Dipecah per {segmentDuration === 'auto' ? '10 detik' : `${segmentDuration} detik`} · Target: {targetAI.toUpperCase()}
                  </p>
                </div>
              </div>

              {segments.length > 0 && (
                <div className="flex items-center gap-2.5 flex-wrap self-end sm:self-auto">
                  {onSendToPhotoPrompt && (
                    <button
                      type="button"
                      onClick={() => setIsBatchPhotoModalOpen(true)}
                      className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-2xs"
                      title="Generate prompt foto untuk seluruh klip ini sekaligus"
                    >
                      <Camera className="w-4 h-4 text-slate-600" />
                      <span>Generate Semua Prompt Foto ({segments.length} Klip)</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleCopyAllPrompts}
                    className="px-4 py-2 rounded-xl bg-[#005ab3] hover:bg-[#004d9c] text-white text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-sm active:scale-98"
                  >
                    {copiedAllPrompts ? (
                      <Check className="w-4 h-4 text-emerald-200" />
                    ) : (
                      <Copy className="w-4 h-4 text-white" />
                    )}
                    <span>
                      {copiedAllPrompts ? 'Tersalin' : `Salin Semua ${segments.length} Prompt`}
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* Clip Cards List */}
            {segments.length === 0 ? (
              <div className="p-8 sm:p-12 rounded-2xl bg-white border border-slate-200/80 text-center space-y-2.5 shadow-xs">
                <Film className="w-10 h-10 text-slate-300 mx-auto" />
                <h5 className="text-sm sm:text-base font-semibold text-slate-800">
                  Belum ada segmen prompt
                </h5>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Segmen prompt belum terdeteksi. Silakan coba proses ulang.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {segments.map((clip, cIdx) => {
                  const clipKey = `clip_${clip.id}`;
                  const isCopied = copiedClipKey === clipKey;
                  const promptText = (clip.masterPrompt || clip.content || '')
                    .trim()
                    .replace(/^```(?:text)?\n?|```$/g, '');

                  return (
                    <div
                      key={clip.id || cIdx}
                      className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-3.5 hover:border-slate-300 transition-all"
                    >
                      {/* Card Top Row: Header + Aksi */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                        {/* Header details */}
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-600 font-bold text-xs border border-blue-100">
                            #{clip.id}
                          </span>
                          <span className="text-sm sm:text-base font-bold text-slate-900">
                            Segmen Prompt Klip {clip.id}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
                            {clip.timestamp}
                          </span>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 self-end sm:self-auto">
                          {onSendToPhotoPrompt && (
                            <button
                              type="button"
                              onClick={() => {
                                let promptToPass = `Visual adegan klip [${clip.timestamp}]: ${promptText}`;
                                const negMatch = promptText.match(
                                  /\[Negative Prompt\]:\s*([\s\S]*?)(?=\n\[|$)/i
                                );
                                let negPrompt = '';
                                if (negMatch && negMatch[1]) {
                                  negPrompt = negMatch[1].trim();
                                  promptToPass += `\n\nNegative Prompt: ${negPrompt}`;
                                }
                                onSendToPhotoPrompt(promptToPass, {
                                  negativePrompt: negPrompt || undefined,
                                });
                              }}
                              className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                              title="Kirim ke Generator Prompt Foto"
                            >
                              <Camera className="w-3.5 h-3.5 text-slate-500" />
                              <span>Ke Prompt Foto</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleCopyClipPrompt(clip.id, promptText)}
                            className="px-3 py-1.5 rounded-lg bg-blue-50/70 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                            title="Salin prompt klip ini"
                          >
                            {isCopied ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 text-blue-600" />
                            )}
                            <span>{isCopied ? 'Tersalin' : 'Salin Prompt Klip'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Subheader: MASTER PROMPT AI KLIP {id} (SIAP COPY) */}
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider pt-0.5">
                        <Sparkles className="w-3 h-3 text-slate-400" />
                        <span>MASTER PROMPT AI KLIP {clip.id} (SIAP COPY)</span>
                      </div>

                      {/* Prompt Body Box */}
                      <div className="p-4 sm:p-5 rounded-xl bg-[#f8fafc] border border-slate-100 text-slate-800 text-sm leading-relaxed whitespace-pre-wrap select-text font-normal min-h-[90px]">
                        {promptText}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* Batch Photo Prompt Modal */}
      {segments.length > 0 && onSendToPhotoPrompt && (
        <BatchPhotoPromptModal
          isOpen={isBatchPhotoModalOpen}
          onClose={() => setIsBatchPhotoModalOpen(false)}
          conceptTitle={`Ekstrak Prompt Video (${segments.length} Klip Segmen)`}
          clips={segments.map((s) => ({
            id: s.id,
            title: s.title,
            timeRange: s.timestamp,
            actionAndVO: s.masterPrompt || s.content,
            aiPrompt: s.masterPrompt || s.content,
          }))}
          onConfirm={(opts) => {
            const batchClipsText =
              `KONSEP EKSTRAK PROMPT VIDEO BATCH PROMPT FOTO (${segments.length} KLIP):\n` +
              segments
                .map(
                  (s) =>
                    `### [${s.timestamp}] Klip ${s.id}: ${s.title}\nDeskripsi Adegan Visual:\n${s.masterPrompt || s.content}`
                )
                .join('\n\n---\n\n');

            learningSync.track('prompt_copied', {
              type: 'batch_photo_prompts_send',
              totalClips: segments.length,
              segmentDuration,
              targetAI,
              aspectRatio: opts.aspectRatio,
            });

            onSendToPhotoPrompt(batchClipsText, {
              autoGenerate: true,
              aspectRatio: opts.aspectRatio,
              photoStyle: opts.photoStyle,
              targetGenerator: opts.targetGenerator,
              negativePrompt: opts.negativePrompt,
            });
            setIsBatchPhotoModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
