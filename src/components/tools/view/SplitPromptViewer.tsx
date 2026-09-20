import React, { useState } from 'react';
import {
  Copy,
  Check,
  Sparkles,
  Layers,
  FileText,
  ChevronDown,
  ChevronUp,
  Share2,
  Clapperboard,
  Camera,
  Hash,
  MessageSquareText,
  Flame,
  CheckCheck,
  TrendingUp,
  Mic,
  Video,
  Aperture,
  Move,
  Film,
  Type,
  Clock,
  Download,
  Sun,
  Timer,
  PlaySquare,
  Sparkle
} from 'lucide-react';
import Markdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { learningSync } from '../../../lib/learningSync';
import BatchPhotoPromptModal from '../../modals/BatchPhotoPromptModal';

interface SplitPromptViewerProps {
  rawPrompt: string;
  segmentDuration: string;
  targetAI: string;
  sourceCaption?: string;
  onSendToPhotoPrompt?: (
    text: string,
    options?: {
      autoGenerate?: boolean;
      aspectRatio?: string;
      photoStyle?: string;
      targetGenerator?: string;
      negativePrompt?: string;
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
  tagsList: string[];
  charCount: number;
  wordCount: number;
}

export function parseSeoCaptionAndHashtags(rawText: string): SeoCaptionInfo | null {
  if (!rawText) return null;

  // Check for caption & hashtag section
  const sectionMatch = rawText.match(/(?:###|\*\*)\s*(?:📱|🔥|✨)?\s*CAPTION\s*(?:&|DAN)?\s*HASHTAG[\s\S]*$/i);
  const targetText = sectionMatch ? sectionMatch[0] : rawText;

  // Match Caption
  const captionMatch = targetText.match(/\*\*Caption[^\n]*\*\*[:\s]*\n*([\s\S]*?)(?=\n*\*\*(?:Hashtags?|Tag|Hashtag Viral)|$)/i)
    || targetText.match(/(?:Caption SEO|Caption FYP|Caption)[:\s]*\n*([\s\S]*?)(?=\n*(?:#|Hashtag|\*\*Hashtag)|$)/i);

  // Match Hashtags
  const hashtagsMatch = targetText.match(/\*\*Hashtags?[^\n]*\*\*[:\s]*\n*([\s\S]*?)(?=\n*---|\n*###|$)/i)
    || targetText.match(/(?:Hashtags?|Hashtag Viral|Tags?)[:\s]*\n*([\s\S]*?)(?=\n*---|\n*###|$)/i)
    || targetText.match(/((?:#[\w\u0590-\u05ff\u0600-\u06ff\u0e00-\u0e7f_]+\s*){2,})/i);

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
      const BANNED_SPAM = new Set(['fyp', 'fypシ', 'fypviral', 'foryou', 'foryoupage', 'racuntiktok', 'racuntiktokshop', 'viral', 'viralvideo', 'trending', 'beranda', 'fyppage', 'foryourpage']);
      const filtered = tagList.filter(t => !BANNED_SPAM.has(t.replace('#', '').toLowerCase()));
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
  const visualMatch = body.match(/(?:\*\*|\*|__)?Visual(?:\*\*|\*|__)?\s*:\s*([\s\S]*?)(?=\n\s*(?:\*\*|\*|__)?(?:Aksi|Voice\s*Over|Voiceover|VO|Subteks|Teks\s*Layar|Prompt)(?:\*\*|\*|__)?\s*:|$)/i);
  
  // Aksi match
  const aksiMatch = body.match(/(?:\*\*|\*|__)?Aksi(?:\s*Kamera)?(?:\*\*|\*|__)?\s*:\s*([\s\S]*?)(?=\n\s*(?:\*\*|\*|__)?(?:Visual|Voice\s*Over|Voiceover|VO|Subteks|Teks\s*Layar)(?:\*\*|\*|__)?\s*:|$)/i);
  
  // Voice Over match
  const voMatch = body.match(/(?:\*\*|\*|__)?(?:Voice\s*Over|Voiceover|VO|Dialog|Narasi)(?:\*\*|\*|__)?\s*:\s*([\s\S]*?)(?=\n\s*(?:\*\*|\*|__)?(?:Visual|Aksi|Subteks|Teks\s*Layar)(?:\*\*|\*|__)?\s*:|$)/i);
  
  // Subteks match
  const subMatch = body.match(/(?:\*\*|\*|__)?(?:Subteks|Teks\s*Layar|Text\s*Overlay|Overlay)(?:\*\*|\*|__)?\s*:\s*([\s\S]*?)(?=\n\s*(?:\*\*|\*|__)?(?:Visual|Aksi|Voice\s*Over|Voiceover|VO)(?:\*\*|\*|__)?\s*:|$)/i);

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
  const shotMatch = visual.match(/\b(macro(?:\s+shot)?|extreme\s+close-up|close-up|wide(?:\s+shot)?|medium(?:\s+shot)?|cutaway(?:\s+teknikal)?|hero(?:\s+shot)?|establishing\s+shot|overhead|low-angle|high-angle|dutch\s+angle)\b/i);
  let lensInfo = '';
  if (shotMatch && lensMatch) {
    lensInfo = `${shotMatch[0]} ${lensMatch[0]}`;
  } else if (shotMatch) {
    lensInfo = shotMatch[0];
  } else if (lensMatch) {
    lensInfo = `Lensa ${lensMatch[0]}`;
  }

  // Camera Motion
  const motionMatch = combinedText.match(/\b(push-in(?:\s+cepat|\s+lambat|\s+halus)?|pull-out|dolly-in|dolly-out|tilt-down|tilt-up|orbit(?:\s+\d+\s*(?:derajat|°))?|slow\s+pan|pan(?:\s+kiri|\s+kanan|\s+halus)?|handheld(?:\s+dinamis)?|tracking(?:\s+shot)?|crane(?:\s+shot)?|zoom-in|zoom-out|static(?:\s+shot)?)\b/i);
  const cameraMotion = motionMatch ? motionMatch[0] : '';

  // Lighting & Mood
  const lightMatch = visual.match(/\b(chiaroscuro(?:\s+bernuansa\s+[\w\-]+)?|studio\s+dramatis|teal-orange|golden\s+hour|softbox|neon(?:\s+rim)?|cinematic\s+moody|natural\s+daylight|high\s+contrast|rim\s+light(?:ing)?)\b/i);
  const lightingInfo = lightMatch ? lightMatch[0] : '';

  // Strategic Funnel Role Tag
  let roleTag = '🎬 Adegan Sinematik';
  if (id === 1) {
    roleTag = '⚡ Hook Visual & Retensi FYP (0-3s)';
  } else if (id === 2) {
    roleTag = '🔍 Eskalasi Masalah & Bukti Visual';
  } else if (id === totalClips && totalClips > 2) {
    roleTag = '🎯 Call to Action & Keranjang Belanja';
  } else if (id === totalClips - 1 && totalClips > 3) {
    roleTag = '🧪 Validasi Hasil & Pembuktian';
  } else {
    roleTag = '🛠️ Solusi Produk & Demo Fitur';
  }

  // Word count & voice duration
  const wordCount = voiceOver ? voiceOver.split(/\s+/).filter(Boolean).length : 0;
  const estVoiceDurationSec = Math.max(1, Math.round(wordCount / 2.5));

  // Master Prompt AI (Siap Copy Paste)
  const masterPrompt = [
    visual ? `Visual: ${visual}` : '',
    aksi ? `Aksi: ${aksi}` : '',
    voiceOver ? `voice over: ${voiceOver}` : '',
    subteks ? `Subteks: ${subteks}` : '',
  ].filter(Boolean).join('\n\n');

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
    masterPrompt: masterPrompt || body,
  };
}

export function parseClipSegments(rawText: string): ClipSegment[] {
  if (!rawText) return [];

  // Strip caption/hashtag section from the clips body
  const clipsPart = rawText.split(/(?:###|\*\*)\s*(?:📱|🔥|✨)?\s*CAPTION\s*(?:&|DAN)?\s*HASHTAG/i)[0];

  const segments: ClipSegment[] = [];

  // Format: "0–10 detik" atau "0-10 detik" atau "0 – 10 detik"
  const timelineRegex = /(?:^|\n)\s*(\d+(?:[.,]\d+)?)\s*[–\-—]\s*(\d+(?:[.,]\d+)?)\s*(?:detik|s|sec)?\s*\n([\s\S]*?)(?=(?:\n\s*\d+(?:[.,]\d+)?\s*[–\-—]\s*\d+(?:[.,]\d+)?\s*(?:detik|s|sec)?)|$)/gi;

  const matches: Array<{ start: string; end: string; body: string }> = [];
  let m;
  while ((m = timelineRegex.exec(clipsPart)) !== null) {
    matches.push({
      start: m[1].replace(',', '.'),
      end: m[2].replace(',', '.'),
      body: m[3].trim(),
    });
  }

  if (matches.length > 0) {
    matches.forEach((item, idx) => {
      const id = idx + 1;
      const details = extractSegmentDetails(item.body, id, matches.length);
      const startNum = parseFloat(item.start) || 0;
      const endNum = parseFloat(item.end) || 0;
      const durationSec = endNum > startNum ? endNum - startNum : undefined;

      segments.push({
        id,
        title: `Klip ${id}`,
        timestamp: `${item.start}–${item.end} detik`,
        startSec: startNum,
        endSec: endNum,
        durationSec,
        visual: details.visual,
        aksi: details.aksi,
        voiceOver: details.voiceOver,
        subteks: details.subteks,
        lensInfo: details.lensInfo,
        cameraMotion: details.cameraMotion,
        lightingInfo: details.lightingInfo,
        roleTag: details.roleTag,
        wordCount: details.wordCount,
        estVoiceDurationSec: details.estVoiceDurationSec,
        masterPrompt: details.masterPrompt,
        content: item.body,
      });
    });
  }

  // Fallback: jika format timeline regex tidak ketemu, pecah dengan header KLIP / SEGMEN
  if (segments.length === 0) {
    const headerSplitter = /(?=(?:^|\n)#{2,4}\s*(?:🎬|🎥|📹)?\s*(?:KLIP|SEGMEN|CLIP|PART|\d+\.)\b)/gi;
    const blocks = clipsPart.split(headerSplitter).filter(b => b.trim());

    blocks.forEach((block, idx) => {
      const id = idx + 1;
      const headerMatch = block.match(/(?:^|\n)#{2,4}\s*(?:🎬|🎥|📹)?\s*(?:KLIP|SEGMEN|CLIP|PART|\d+\.)\s*([^\n]+)/i);
      const fullHeader = headerMatch ? headerMatch[1].trim() : `Klip ${id}`;
      
      let timestamp = '';
      const timeMatch = fullHeader.match(/\(Timestamp:?\s*([^\)]+)\)/i)
        || block.match(/Timestamp:?\s*([0-9:\s\-]+)/i)
        || fullHeader.match(/(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})/);
      timestamp = timeMatch ? timeMatch[1].trim() : `Segmen ${id}`;

      const details = extractSegmentDetails(block.trim(), id, blocks.length);

      segments.push({
        id,
        title: `Klip ${id}`,
        timestamp,
        visual: details.visual,
        aksi: details.aksi,
        voiceOver: details.voiceOver,
        subteks: details.subteks,
        lensInfo: details.lensInfo,
        cameraMotion: details.cameraMotion,
        lightingInfo: details.lightingInfo,
        roleTag: details.roleTag,
        wordCount: details.wordCount,
        estVoiceDurationSec: details.estVoiceDurationSec,
        masterPrompt: details.masterPrompt,
        content: block.trim(),
      });
    });
  }

  return segments;
}

export default function SplitPromptViewer({
  rawPrompt,
  segmentDuration,
  targetAI,
  sourceCaption,
  onSendToPhotoPrompt,
}: SplitPromptViewerProps) {
  const [copiedClipId, setCopiedClipId] = useState<number | null>(null);
  const [copiedPartKey, setCopiedPartKey] = useState<string | null>(null);
  const [copiedTag, setCopiedTag] = useState<string | null>(null);
  const [copiedAllPrompts, setCopiedAllPrompts] = useState(false);
  const [copiedAllVO, setCopiedAllVO] = useState(false);
  const [copiedFullReport, setCopiedFullReport] = useState(false);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [copiedHashtags, setCopiedHashtags] = useState(false);
  const [copiedAllCaptionTags, setCopiedAllCaptionTags] = useState(false);
  const [activeTab, setActiveTab] = useState<'cards' | 'voiceover' | 'master' | 'raw'>('cards');
  const [expandedClip, setExpandedClip] = useState<number | null>(null);
  const [isBatchPhotoModalOpen, setIsBatchPhotoModalOpen] = useState(false);

  const segments = parseClipSegments(rawPrompt);
  const seoData = parseSeoCaptionAndHashtags(rawPrompt);

  // Aggregated audio/voiceover stats
  const totalVoWords = segments.reduce((sum, s) => sum + (s.wordCount || 0), 0);
  const totalVoDurationSec = segments.reduce((sum, s) => sum + (s.estVoiceDurationSec || 0), 0);
  const totalVideoDurationSec = segments.length > 0 && segments[segments.length - 1].endSec
    ? segments[segments.length - 1].endSec
    : segments.length * (parseInt(segmentDuration, 10) || 10);

  const handleCopyPart = (text: string, partKey: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedPartKey(partKey);
    setTimeout(() => setCopiedPartKey(null), 2000);
  };

  const handleCopyTag = (tag: string) => {
    navigator.clipboard.writeText(tag);
    setCopiedTag(tag);
    setTimeout(() => setCopiedTag(null), 2000);
  };

  const handleCopyClipPrompt = (segment: ClipSegment) => {
    const textToCopy = segment.masterPrompt || segment.content;
    navigator.clipboard.writeText(textToCopy);
    setCopiedClipId(segment.id);

    learningSync.track('prompt_clip_copied', {
      type: 'video_clip_prompt',
      clipIndex: segment.id,
      promptSnippet: textToCopy.slice(0, 100),
      segmentDuration,
      targetAI,
      text: textToCopy,
    });

    setTimeout(() => setCopiedClipId(null), 2000);
  };

  const handleCopyAllPrompts = () => {
    let textToCopy = rawPrompt;
    if (segments.length === 0) {
      navigator.clipboard.writeText(rawPrompt);
    } else {
      const allPromptsText = segments
        .map((s, idx) => `[KLIP ${idx + 1} (${s.timestamp}) - TARGET: ${targetAI.toUpperCase()}]\n${s.masterPrompt}\n`)
        .join('\n---\n\n');
      textToCopy = allPromptsText;
      navigator.clipboard.writeText(allPromptsText);
    }
    setCopiedAllPrompts(true);

    learningSync.track('prompt_copied', {
      type: 'video_clip_prompt_all',
      text: textToCopy,
    });

    setTimeout(() => setCopiedAllPrompts(false), 2000);
  };

  const handleCopyAllVO = () => {
    const allVOText = segments
      .filter(s => s.voiceOver)
      .map(s => `[${s.timestamp} - Klip ${s.id}]\n${s.voiceOver}`)
      .join('\n\n');
    
    if (!allVOText) return;
    navigator.clipboard.writeText(allVOText);
    setCopiedAllVO(true);

    learningSync.track('prompt_copied', {
      type: 'voiceover_all_copied',
      text: allVOText,
    });

    setTimeout(() => setCopiedAllVO(false), 2000);
  };

  const handleCopyFullReport = () => {
    navigator.clipboard.writeText(rawPrompt);
    setCopiedFullReport(true);

    learningSync.track('prompt_copied', {
      type: 'video_prompt_full_report',
      text: rawPrompt,
    });

    setTimeout(() => setCopiedFullReport(false), 2000);
  };

  const handleCopyCaption = () => {
    if (!seoData?.caption) return;
    navigator.clipboard.writeText(seoData.caption);
    setCopiedCaption(true);
    learningSync.track('seo_caption_copied', {
      type: 'seo_caption_only',
      text: seoData.caption,
      snippet: seoData.caption.slice(0, 100),
    });
    setTimeout(() => setCopiedCaption(false), 2000);
  };

  const handleCopyHashtags = () => {
    if (!seoData?.hashtags) return;
    navigator.clipboard.writeText(seoData.hashtags);
    setCopiedHashtags(true);
    learningSync.track('hashtags_copied', {
      type: 'seo_hashtags_only',
      text: seoData.hashtags,
      snippet: seoData.hashtags.slice(0, 100),
    });
    setTimeout(() => setCopiedHashtags(false), 2000);
  };

  const handleCopyAllCaptionTags = () => {
    if (!seoData) return;
    const combined = `${seoData.caption}\n\n${seoData.hashtags}`.trim();
    navigator.clipboard.writeText(combined);
    setCopiedAllCaptionTags(true);
    learningSync.track('seo_caption_copied', {
      type: 'seo_caption_and_hashtags_all',
      text: combined,
      snippet: combined.slice(0, 100),
    });
    setTimeout(() => setCopiedAllCaptionTags(false), 2000);
  };

  const handleDownloadScript = () => {
    let content = `====================================================\n`;
    content += `EKSTRAK PROMPT DARI VIDEO - PRODUCTION SCRIPT\n`;
    content += `Target AI: ${targetAI.toUpperCase()} | Durasi Split: ${segmentDuration} detik\n`;
    content += `Total Klip: ${segments.length} Klip | Est Durasi Total: ${totalVideoDurationSec} detik\n`;
    content += `====================================================\n\n`;

    if (seoData?.caption) {
      content += `[CAPTION SEO TIKTOK / REELS / SHORTS]\n`;
      content += `${seoData.caption}\n\n`;
    }
    if (seoData?.hashtags) {
      content += `[HASHTAG SEO RELEVAN]\n`;
      content += `${seoData.hashtags}\n\n`;
    }

    const allVO = segments.filter(s => s.voiceOver).map(s => `[${s.timestamp}] Klip ${s.id}:\n"${s.voiceOver}"`).join('\n\n');
    if (allVO) {
      content += `====================================================\n`;
      content += `NASKAH LENGKAP VOICE OVER (Total ${totalVoWords} Kata)\n`;
      content += `====================================================\n`;
      content += `${allVO}\n\n`;
    }

    content += `====================================================\n`;
    content += `RINCIAN DETAIL MASTER PROMPT PER SEGMEN KLIP\n`;
    content += `====================================================\n\n`;

    segments.forEach(s => {
      content += `----------------------------------------------------\n`;
      content += `KLIP #${s.id} [${s.timestamp}] - ${s.roleTag}\n`;
      const specs = [s.lensInfo && `Lensa: ${s.lensInfo}`, s.cameraMotion && `Motion: ${s.cameraMotion}`, s.lightingInfo && `Lighting: ${s.lightingInfo}`].filter(Boolean).join(' | ');
      if (specs) content += `Spesifikasi Teknis: ${specs}\n`;
      content += `----------------------------------------------------\n`;
      if (s.visual) content += `Visual: ${s.visual}\n`;
      if (s.aksi) content += `Aksi: ${s.aksi}\n`;
      if (s.voiceOver) content += `voice over: ${s.voiceOver}\n`;
      if (s.subteks) content += `Subteks: ${s.subteks}\n`;
      content += `\n`;
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ekstrak-prompt-video-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* 1. SEO CAPTION & VIRAL HASHTAGS CARD (VisionOS Refined High-Contrast) */}
      {seoData && (seoData.caption || seoData.hashtags) && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl bg-gradient-to-br from-indigo-950 via-[#1e1b4b] to-slate-950 text-white p-5 sm:p-6 shadow-md border border-indigo-500/25 relative overflow-hidden"
        >
          {/* Subtle Refractive Glow */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
          
          <div className="relative z-10 space-y-4">
            {/* Top Bar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-slate-950 font-bold shadow-xs">
                  <Flame className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                      Caption & Hashtag SEO Viral
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      FYP Boosted
                    </span>
                  </div>
                  <p className="text-xs text-indigo-200/80 mt-0.5">
                    {sourceCaption
                      ? 'Ditingkatkan dari caption asli sumber TikTok agar lebih relevan & berbobot SEO tinggi.'
                      : 'Dirumuskan khusus berdasarkan visual & konteks video untuk optimasi algoritma pencarian.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={handleCopyAllCaptionTags}
                  className="px-3.5 py-1.5 rounded-xl bg-[#5b50e5] hover:bg-[#4f46e5] text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer border border-indigo-400/30 active:scale-95"
                >
                  {copiedAllCaptionTags ? <CheckCheck className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedAllCaptionTags ? 'Semua Tersalin!' : 'Salin Caption + Hashtag'}</span>
                </button>
              </div>
            </div>

            {/* Caption Block */}
            {seoData.caption && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-indigo-200 uppercase tracking-wider flex items-center gap-1.5">
                      <MessageSquareText className="w-3.5 h-3.5 text-amber-400" />
                      Caption SEO TikTok / Reels / Shorts
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/10 text-indigo-200 font-mono">
                      {seoData.wordCount} Kata • {seoData.charCount} Karakter
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyCaption}
                    className="text-[11px] font-semibold text-indigo-300 hover:text-white transition-colors flex items-center gap-1 cursor-pointer bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-lg border border-white/10"
                  >
                    {copiedCaption ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedCaption ? 'Tersalin' : 'Salin Caption'}</span>
                  </button>
                </div>
                <div className="p-3.5 rounded-xl bg-black/30 border border-white/10 text-xs sm:text-sm text-slate-100 leading-relaxed font-sans select-all whitespace-pre-wrap">
                  {seoData.caption}
                </div>
              </div>
            )}

            {/* Hashtags Block with Click-to-Copy Individual Tags */}
            {seoData.hashtags && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-indigo-200 uppercase tracking-wider flex items-center gap-1.5">
                      <Hash className="w-3.5 h-3.5 text-purple-400" />
                      Hashtag Relevan & SEO Search (Max 5 Tag)
                    </span>
                    <span className="text-[10px] text-indigo-300/80">
                      (Klik tag untuk salin satuan)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyHashtags}
                    className="text-[11px] font-semibold text-indigo-300 hover:text-white transition-colors flex items-center gap-1 cursor-pointer bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-lg border border-white/10"
                  >
                    {copiedHashtags ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedHashtags ? 'Semua Tersalin' : 'Salin Semua Hashtag'}</span>
                  </button>
                </div>

                {/* Individual interactive chips */}
                {seoData.tagsList.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-0.5">
                    {seoData.tagsList.map((tag, tIdx) => {
                      const isTagCopied = copiedTag === tag;
                      return (
                        <button
                          key={tIdx}
                          type="button"
                          onClick={() => handleCopyTag(tag)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 border cursor-pointer ${
                            isTagCopied
                              ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                              : 'bg-white/5 hover:bg-white/10 border-white/15 text-amber-200 hover:border-amber-300/40'
                          }`}
                          title={`Klik untuk salin ${tag}`}
                        >
                          {isTagCopied ? <Check className="w-3 h-3 text-emerald-300" /> : <Copy className="w-3 h-3 text-indigo-300" />}
                          <span>{tag}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* 2. HEADER INTEL & CONTROLS BAR */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/90 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-[#5b50e5] shrink-0 shadow-xs">
            <Clapperboard className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">Hasil Split Prompt Video</h3>
              {segments.length > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold flex items-center gap-1">
                  <Sparkle className="w-3 h-3 text-emerald-600" />
                  {segments.length} Klip Siap Salin
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500">
              <span>
                {segmentDuration !== 'auto'
                  ? `Dipecah per ${segmentDuration} detik`
                  : `Transisi Adegan Alami`}
              </span>
              <span>•</span>
              <span className="font-semibold text-slate-700 uppercase">Target: {targetAI}</span>
              {totalVideoDurationSec > 0 && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1 font-mono text-slate-600">
                    <Clock className="w-3 h-3" /> ±{totalVideoDurationSec}s Total
                  </span>
                </>
              )}
              {totalVoWords > 0 && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1 font-medium text-indigo-600">
                    <Mic className="w-3 h-3" /> {totalVoWords} Kata VO
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* View Toggle Navigation */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-start lg:justify-end">
          {segments.length > 0 && (
            <div className="flex items-center p-1 bg-slate-100 border border-slate-200 rounded-xl text-xs font-medium">
              <button
                type="button"
                onClick={() => setActiveTab('cards')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'cards' ? 'bg-[#5b50e5] text-white font-semibold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Tampilan kartu detail lengkap per adegan"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Detail Segmen ({segments.length})</span>
              </button>
              
              <button
                type="button"
                onClick={() => setActiveTab('voiceover')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'voiceover' ? 'bg-[#5b50e5] text-white font-semibold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Naskah voice over penuh untuk audio generator"
              >
                <Mic className="w-3.5 h-3.5" />
                <span>Naskah VO</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('master')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'master' ? 'bg-[#5b50e5] text-white font-semibold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Prompt AI video siap batch paste"
              >
                <Film className="w-3.5 h-3.5" />
                <span>Prompt AI</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('raw')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'raw' ? 'bg-[#5b50e5] text-white font-semibold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Format markdown mentah"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Teks Mentah</span>
              </button>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {segments.length > 0 && onSendToPhotoPrompt && (
              <button
                type="button"
                onClick={() => setIsBatchPhotoModalOpen(true)}
                className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition-all flex items-center gap-1.5 shadow-xs active:scale-95 cursor-pointer"
                title="Generate otomatis seluruh prompt foto untuk semua klip dalam video ini sekaligus"
              >
                <Camera className="w-3.5 h-3.5 text-purple-200" />
                <span>Generate Semua Prompt Foto ({segments.length} Klip)</span>
              </button>
            )}

            {segments.length > 0 && (
              <button
                type="button"
                onClick={handleCopyAllPrompts}
                className="px-3.5 py-1.5 rounded-xl bg-[#5b50e5] hover:bg-[#4f46e5] text-white font-bold text-xs transition-all flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
              >
                {copiedAllPrompts ? <Check className="w-3.5 h-3.5 text-emerald-200" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedAllPrompts ? 'Semua Tersalin!' : `Salin Semua ${segments.length} Prompt`}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDownloadScript}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-all flex items-center gap-1.5 border border-slate-200 cursor-pointer"
              title="Unduh naskah produksi dan prompt video sebagai file teks (.txt)"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Unduh Script (.txt)</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. TAB CONTENT 1: DETAIL SEGMEN PRO (SANGAT DETAIL) */}
      {activeTab === 'cards' && segments.length > 0 && (
        <div className="space-y-4">
          {segments.map((segment) => {
            const isExpanded = expandedClip === segment.id;
            const hasTechSpecs = Boolean(segment.lensInfo || segment.cameraMotion || segment.lightingInfo);

            return (
              <motion.div
                key={segment.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="rounded-2xl bg-white border border-slate-200/90 hover:border-[#5b50e5]/40 transition-all shadow-xs overflow-hidden"
              >
                {/* Header Card Segment */}
                <div className="p-4 sm:p-5 bg-slate-50/80 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 text-[#5b50e5] flex items-center justify-center font-bold text-sm shrink-0 shadow-2xs">
                      #{segment.id}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm sm:text-base font-bold text-slate-900">
                          Segmen Prompt Klip {segment.id}
                        </h4>
                        <span className="px-2.5 py-0.5 rounded-md bg-indigo-50 text-[#5b50e5] border border-indigo-100 font-mono text-xs font-semibold flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {segment.timestamp}
                        </span>
                        {segment.roleTag && (
                          <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold border border-slate-200/60">
                            {segment.roleTag}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Dioptimalkan untuk {targetAI.toUpperCase()}
                      </p>
                    </div>
                  </div>

                  {/* Header Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                    {onSendToPhotoPrompt && (
                      <button
                        type="button"
                        onClick={() => {
                          const text = segment.visual || segment.masterPrompt || segment.content;
                          learningSync.track('prompt_sent_to_photo', {
                            clipIndex: segment.id,
                            promptSnippet: text.slice(0, 100),
                            segmentDuration,
                            targetAI,
                          });
                          onSendToPhotoPrompt(text);
                        }}
                        className="px-3 py-1.5 rounded-xl font-medium text-xs transition-all flex items-center gap-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 shadow-2xs cursor-pointer active:scale-95"
                        title="Kirim deskripsi visual klip ini ke Prompt Foto AI Generator"
                      >
                        <Camera className="w-3.5 h-3.5 text-purple-600" />
                        <span>Ke Prompt Foto</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleCopyClipPrompt(segment)}
                      className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95 ${
                        copiedClipId === segment.id
                          ? 'bg-emerald-600 text-white'
                          : 'bg-[#5b50e5] hover:bg-[#4f46e5] text-white'
                      }`}
                    >
                      {copiedClipId === segment.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedClipId === segment.id ? 'Prompt Tersalin!' : 'Salin Prompt Klip'}</span>
                    </button>
                  </div>
                </div>

                {/* Technical Optics & Cinematography Bar */}
                {hasTechSpecs && (
                  <div className="px-4 py-2.5 bg-slate-100/50 border-b border-slate-100 flex flex-wrap items-center gap-2 text-xs">
                    {segment.lensInfo && (
                      <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 font-medium flex items-center gap-1.5 shadow-2xs">
                        <Camera className="w-3.5 h-3.5 text-indigo-600" />
                        <span><strong>Lensa:</strong> {segment.lensInfo}</span>
                      </span>
                    )}

                    {segment.cameraMotion && (
                      <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 font-medium flex items-center gap-1.5 shadow-2xs">
                        <Move className="w-3.5 h-3.5 text-amber-600" />
                        <span><strong>Kamera:</strong> {segment.cameraMotion}</span>
                      </span>
                    )}

                    {segment.lightingInfo && (
                      <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 font-medium flex items-center gap-1.5 shadow-2xs">
                        <Sun className="w-3.5 h-3.5 text-purple-600" />
                        <span><strong>Lighting:</strong> {segment.lightingInfo}</span>
                      </span>
                    )}
                  </div>
                )}

                {/* Structured Breakdown Details */}
                <div className="p-4 sm:p-5 space-y-3.5">
                  {/* Visual Composition Block */}
                  {segment.visual && (
                    <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50/70 border border-slate-200/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                          <Aperture className="w-3.5 h-3.5 text-[#5b50e5]" />
                          Visual & Komposisi Adegan
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyPart(segment.visual, `visual-${segment.id}`)}
                          className="text-[11px] font-semibold text-slate-600 hover:text-indigo-600 transition-colors flex items-center gap-1 cursor-pointer bg-white px-2.5 py-1 rounded-md border border-slate-200 shadow-2xs"
                        >
                          {copiedPartKey === `visual-${segment.id}` ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span className="text-emerald-600">Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Salin Visual</span>
                            </>
                          )}
                        </button>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-800 leading-relaxed font-sans">
                        {segment.visual}
                      </p>
                    </div>
                  )}

                  {/* Camera Action & Subject Motion Block */}
                  {segment.aksi && (
                    <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50/70 border border-slate-200/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                          <Move className="w-3.5 h-3.5 text-amber-600" />
                          Aksi Subjek & Pergerakan Kamera
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyPart(segment.aksi, `aksi-${segment.id}`)}
                          className="text-[11px] font-semibold text-slate-600 hover:text-amber-700 transition-colors flex items-center gap-1 cursor-pointer bg-white px-2.5 py-1 rounded-md border border-slate-200 shadow-2xs"
                        >
                          {copiedPartKey === `aksi-${segment.id}` ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span className="text-emerald-600">Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Salin Aksi</span>
                            </>
                          )}
                        </button>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-800 leading-relaxed font-sans">
                        {segment.aksi}
                      </p>
                    </div>
                  )}

                  {/* Voice Over Script Block */}
                  {segment.voiceOver && (
                    <div className="p-3.5 sm:p-4 rounded-xl bg-indigo-50/60 border border-indigo-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#5b50e5] uppercase tracking-wider flex items-center gap-1.5">
                            <Mic className="w-3.5 h-3.5 text-[#5b50e5]" />
                            Voice Over / Narasi Audio
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-100/70 text-indigo-800 font-mono font-medium">
                            ~{segment.wordCount} kata • ±{segment.estVoiceDurationSec}s baca
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyPart(segment.voiceOver || '', `vo-${segment.id}`)}
                          className="text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 transition-colors flex items-center gap-1 cursor-pointer bg-white px-2.5 py-1 rounded-md border border-indigo-200 shadow-2xs"
                        >
                          {copiedPartKey === `vo-${segment.id}` ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span className="text-emerald-600">Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Salin Voice Over</span>
                            </>
                          )}
                        </button>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-900 font-medium leading-relaxed font-sans italic">
                        "{segment.voiceOver}"
                      </p>
                    </div>
                  )}

                  {/* Subteks / On-Screen Graphic Text */}
                  {segment.subteks && (
                    <div className="p-3.5 sm:p-4 rounded-xl bg-amber-50/60 border border-amber-200/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                          <Type className="w-3.5 h-3.5 text-amber-700" />
                          Teks Layar / Subteks On-Screen
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyPart(segment.subteks || '', `sub-${segment.id}`)}
                          className="text-[11px] font-semibold text-amber-800 hover:text-amber-950 transition-colors flex items-center gap-1 cursor-pointer bg-white px-2.5 py-1 rounded-md border border-amber-300 shadow-2xs"
                        >
                          {copiedPartKey === `sub-${segment.id}` ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span className="text-emerald-600">Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Salin Subteks</span>
                            </>
                          )}
                        </button>
                      </div>
                      <div className="p-2.5 rounded-lg bg-amber-100/60 border border-amber-200 font-bold text-xs sm:text-sm text-amber-950 uppercase tracking-wide">
                        {segment.subteks}
                      </div>
                    </div>
                  )}

                  {/* Toggle Full Master Prompt AI */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setExpandedClip(isExpanded ? null : segment.id)}
                      className="text-xs font-semibold text-[#5b50e5] hover:text-[#4f46e5] flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      <span>{isExpanded ? 'Sembunyikan Raw Master Prompt' : 'Lihat Master Prompt AI Utuh (Siap Copy Paste)'}</span>
                    </button>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="mt-2.5 p-3.5 rounded-xl bg-slate-900 text-slate-200 font-mono text-xs leading-relaxed select-all space-y-2"
                        >
                          <div className="flex items-center justify-between pb-1 border-b border-slate-800 text-[10px] text-slate-400">
                            <span>RAW PROMPT AI KLIP {segment.id}</span>
                            <button
                              type="button"
                              onClick={() => handleCopyClipPrompt(segment)}
                              className="text-indigo-300 hover:text-white flex items-center gap-1"
                            >
                              <Copy className="w-3 h-3" />
                              <span>Salin</span>
                            </button>
                          </div>
                          <div className="whitespace-pre-wrap">{segment.masterPrompt}</div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* 4. TAB CONTENT 2: NASKAH VOICE OVER LENGKAP */}
      {activeTab === 'voiceover' && (
        <div className="rounded-2xl bg-white border border-slate-200/90 p-5 sm:p-6 shadow-sm space-y-5">
          {/* Header Summary for VO */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Mic className="w-5 h-5 text-[#5b50e5]" />
                Naskah Lengkap Voice Over (Seluruh Video)
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Kumpulan dialog narasi berurutan dari Klip 1 sampai akhir, siap disalin ke ElevenLabs, CapCut TTS, atau dibacakan langsung.
              </p>
            </div>

            <button
              type="button"
              onClick={handleCopyAllVO}
              className="px-4 py-2 rounded-xl bg-[#5b50e5] hover:bg-[#4f46e5] text-white font-bold text-xs transition-all flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
            >
              {copiedAllVO ? <Check className="w-3.5 h-3.5 text-emerald-200" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedAllVO ? 'Semua Voice Over Tersalin!' : 'Salin Seluruh Naskah VO'}</span>
            </button>
          </div>

          {/* Quick Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Kata VO</span>
              <div className="text-lg font-bold text-slate-900 mt-0.5">{totalVoWords} Kata</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Est Durasi Baca</span>
              <div className="text-lg font-bold text-indigo-600 mt-0.5">±{totalVoDurationSec}s</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Jumlah Segmen</span>
              <div className="text-lg font-bold text-slate-900 mt-0.5">{segments.filter(s => s.voiceOver).length} Klip Berisi VO</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Kecepatan Pacing</span>
              <div className="text-lg font-bold text-emerald-600 mt-0.5">Optimal FYP</div>
            </div>
          </div>

          {/* Sequenced Voice Over Timeline */}
          <div className="space-y-3">
            {segments.filter(s => s.voiceOver).map((s) => (
              <div
                key={s.id}
                className="p-4 rounded-xl bg-indigo-50/40 border border-indigo-100 flex flex-col sm:flex-row items-start gap-3.5"
              >
                <div className="shrink-0 flex sm:flex-col items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-[#5b50e5] text-white text-xs font-bold font-mono">
                    Klip #{s.id}
                  </span>
                  <span className="text-[11px] font-mono text-indigo-700">
                    {s.timestamp}
                  </span>
                </div>
                <div className="flex-1">
                  <p className="text-xs sm:text-sm text-slate-800 leading-relaxed font-medium">
                    "{s.voiceOver}"
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyPart(s.voiceOver || '', `vo-timeline-${s.id}`)}
                  className="shrink-0 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium border border-slate-200 shadow-2xs flex items-center gap-1 cursor-pointer"
                >
                  {copiedPartKey === `vo-timeline-${s.id}` ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedPartKey === `vo-timeline-${s.id}` ? 'Tersalin' : 'Salin Baris'}</span>
                </button>
              </div>
            ))}
          </div>

          {/* Aggregated Raw Textarea for Bulk Copy */}
          <div className="space-y-2 pt-2">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-[#5b50e5]" />
              Format Teks Gabungan Bersih (Siap Paste):
            </label>
            <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 font-mono text-xs text-slate-800 whitespace-pre-wrap leading-relaxed select-all">
              {segments
                .filter(s => s.voiceOver)
                .map(s => s.voiceOver)
                .join(' ')}
            </div>
          </div>
        </div>
      )}

      {/* 5. TAB CONTENT 3: MASTER PROMPT AI SEMUA KLIP */}
      {activeTab === 'master' && (
        <div className="rounded-2xl bg-white border border-slate-200/90 p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Film className="w-5 h-5 text-[#5b50e5]" />
                Master Prompt AI Semua Klip ({segments.length} Klip)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Format prompt urut siap copy untuk dimasukkan ke antrean generator video AI ({targetAI.toUpperCase()}).
              </p>
            </div>

            <button
              type="button"
              onClick={handleCopyAllPrompts}
              className="px-4 py-2 rounded-xl bg-[#5b50e5] hover:bg-[#4f46e5] text-white font-bold text-xs transition-all flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
            >
              {copiedAllPrompts ? <Check className="w-3.5 h-3.5 text-emerald-200" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedAllPrompts ? 'Semua Prompt Tersalin!' : `Salin Semua ${segments.length} Prompt`}</span>
            </button>
          </div>

          <div className="space-y-4">
            {segments.map((s) => (
              <div key={s.id} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#5b50e5] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> KLIP #{s.id} ({s.timestamp})
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyClipPrompt(s)}
                    className="text-xs font-semibold text-slate-600 hover:text-[#5b50e5] flex items-center gap-1 cursor-pointer"
                  >
                    {copiedClipId === s.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedClipId === s.id ? 'Tersalin' : 'Salin Prompt Klip Ini'}</span>
                  </button>
                </div>
                <div className="p-3 rounded-lg bg-white border border-slate-200/80 font-mono text-xs text-slate-800 whitespace-pre-wrap leading-relaxed select-all">
                  {s.masterPrompt}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. TAB CONTENT 4: TEKS MENTAH (MARKDOWN) */}
      {activeTab === 'raw' && (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#5b50e5]" />
              Output Teks Mentah (Markdown Lengkap)
            </h3>
            <button
              type="button"
              onClick={handleCopyFullReport}
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-all flex items-center gap-1.5 border border-slate-200 cursor-pointer"
            >
              {copiedFullReport ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedFullReport ? 'Laporan Tersalin!' : 'Salin Seluruh Teks'}</span>
            </button>
          </div>
          <div className="prose prose-slate max-w-none text-xs sm:text-sm leading-relaxed">
            <Markdown>{rawPrompt}</Markdown>
          </div>
        </div>
      )}

      {/* Batch Photo Prompt Modal */}
      {segments.length > 0 && (
        <BatchPhotoPromptModal
          isOpen={isBatchPhotoModalOpen}
          onClose={() => setIsBatchPhotoModalOpen(false)}
          conceptTitle={`Ekstrak Prompt Video Split (${segments.length} Klip Segmen)`}
          clips={segments.map(s => ({
            id: s.id,
            title: s.title,
            timeRange: s.timestamp,
            actionAndVO: s.masterPrompt || s.content,
          }))}
          onConfirm={(opts) => {
            const batchClipsText = `KONSEP EKSTRAK PROMPT VIDEO BATCH PROMPT FOTO (${segments.length} KLIP):\n` +
              segments.map(s => `### [${s.timestamp}] Klip ${s.id}: ${s.title}\nDeskripsi Adegan Visual:\n${s.masterPrompt || s.content}`).join('\n\n---\n\n');

            learningSync.track('prompt_copied', {
              type: 'batch_photo_prompts_send',
              totalClips: segments.length,
              segmentDuration,
              targetAI,
              aspectRatio: opts.aspectRatio,
            });

            if (onSendToPhotoPrompt) {
              onSendToPhotoPrompt(batchClipsText, {
                autoGenerate: true,
                aspectRatio: opts.aspectRatio,
                photoStyle: opts.photoStyle,
                targetGenerator: opts.targetGenerator,
                negativePrompt: opts.negativePrompt,
              });
            }
            setIsBatchPhotoModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
