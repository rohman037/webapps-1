import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
  Sliders,
  ChevronDown,
  ChevronUp,
  Package,
  Search,
  Target,
  Megaphone,
  Cpu,
  Share2,
  Eye,
  Play,
  Mic,
  Volume2,
  Info,
} from 'lucide-react';
import type { IdeaClipSegment, TikTokShopIdea } from './TikTokShopToIdeasTool';

interface AnalysisData {
  category?: string;
  ingredients?: string;
  problemSolved?: string;
  benefit?: string;
  targetUser?: string;
  priceRating?: string;
  bpom?: string;
  usp?: string;
  moodTone?: string;
  summaryParagraph?: string;
}

interface QuerySection {
  title: string;
  queries: string[];
}

interface ProductToVideoOutputViewProps {
  parsedIdeas: TikTokShopIdea[];
  rawResult: string;
  totalDuration?: string;
  promptSplitSec?: string;
  targetAI?: string;
  analysisData?: AnalysisData | null;
  querySections?: QuerySection[];
  refImageFile?: File | null;
  onSendToPhotoPrompt?: (
    prompt: string,
    options?: {
      negativePrompt?: string;
      referenceImage?: File;
      autoGenerate?: boolean;
      aspectRatio?: string;
      photoStyle?: string;
      targetGenerator?: string;
    }
  ) => void;
  onSendToVideoPrompt?: (prompt: string) => void;
  onOpenBatchPhotoModal?: (data: {
    conceptTitle: string;
    clips: {
      id: number;
      title: string;
      timeRange: string;
      actionAndVO: string;
      aiPrompt: string;
    }[];
  }) => void;
}

export const ProductToVideoOutputView: React.FC<ProductToVideoOutputViewProps> = ({
  parsedIdeas,
  rawResult,
  totalDuration = '60',
  promptSplitSec = '10',
  targetAI = 'GENERAL',
  analysisData,
  querySections = [],
  refImageFile,
  onSendToPhotoPrompt,
  onSendToVideoPrompt,
  onOpenBatchPhotoModal,
}) => {
  const [activeIdeaIndex, setActiveIdeaIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'cards' | 'raw'>('cards');
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [copiedHashtags, setCopiedHashtags] = useState(false);
  const [copiedAllPrompts, setCopiedAllPrompts] = useState(false);
  const [copiedClipKey, setCopiedClipKey] = useState<string | null>(null);
  const [copiedTag, setCopiedTag] = useState<string | null>(null);
  const [copiedRawAll, setCopiedRawAll] = useState(false);
  const [showStrategicDetails, setShowStrategicDetails] = useState(false);

  if (!parsedIdeas || parsedIdeas.length === 0) {
    return (
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm">
        <div className="markdown-body text-slate-800 text-xs sm:text-sm leading-relaxed space-y-4">
          <ReactMarkdown>{rawResult}</ReactMarkdown>
        </div>
      </div>
    );
  }

  const currentIdea = parsedIdeas[activeIdeaIndex] || parsedIdeas[0];

  // Extract clean max 5 hashtags
  const hashtagChips = (
    currentIdea.hashtags
      ? (currentIdea.hashtags.match(/#[\w\u0590-\u05ff\u0600-\u06ff\u0e00-\u0e7f_]+/g) ||
          currentIdea.hashtags.split(/\s+/).filter(Boolean))
      : []
  ).slice(0, 5);

  // Helper style for stage label badge
  const getStageBadgeStyle = (stage?: string) => {
    if (!stage) return 'bg-slate-100 text-slate-700 border-slate-200';
    const s = stage.toLowerCase();
    if (s.includes('hook')) return 'bg-violet-50 text-violet-700 border-violet-200';
    if (s.includes('pain') || s.includes('masalah')) return 'bg-amber-50 text-amber-700 border-amber-200';
    if (s.includes('demo') || s.includes('solut') || s.includes('solusi')) return 'bg-blue-50 text-blue-700 border-blue-200';
    if (s.includes('benefit') || s.includes('proof') || s.includes('bukti') || s.includes('manfaat')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (s.includes('cta') || s.includes('action') || s.includes('call') || s.includes('keranjang')) return 'bg-rose-50 text-rose-700 border-rose-200';
    return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  };

  // Clips to render with fallback
  const clipsToRender =
    currentIdea.clips && currentIdea.clips.length > 0
      ? currentIdea.clips
      : currentIdea.scenePrompts && currentIdea.scenePrompts.trim()
      ? [
          {
            id: 1,
            timeRange: `0–${promptSplitSec === 'auto' ? '10' : promptSplitSec} detik`,
            title: 'Segmen 1',
            actionAndVO: currentIdea.scenePrompts.trim(),
            aiPrompt: currentIdea.scenePrompts.trim(),
          },
        ]
      : [];

  // Copy single hashtag
  const handleCopyTag = (tag: string) => {
    navigator.clipboard.writeText(tag);
    setCopiedTag(tag);
    setTimeout(() => setCopiedTag(null), 2000);
  };

  // Copy caption only
  const handleCopyCaption = () => {
    if (!currentIdea.caption) return;
    navigator.clipboard.writeText(currentIdea.caption.trim());
    setCopiedCaption(true);
    setTimeout(() => setCopiedCaption(false), 2000);
  };

  // Copy hashtags only
  const handleCopyHashtags = () => {
    if (!currentIdea.hashtags) return;
    const textToCopy = hashtagChips.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ');
    navigator.clipboard.writeText(textToCopy);
    setCopiedHashtags(true);
    setTimeout(() => setCopiedHashtags(false), 2000);
  };

  // Copy all clips prompts
  const handleCopyAllPrompts = () => {
    if (clipsToRender.length === 0) return;
    const combined = clipsToRender
      .map((clip) => {
        const p = (clip.aiPrompt || clip.actionAndVO || clip.visual || '').trim().replace(/^```(?:text)?\n?|```$/g, '');
        return p.startsWith('[') ? p : `[Klip ${clip.id} - ${clip.timeRange}]\n${p}`;
      })
      .filter(Boolean)
      .join('\n\n---\n\n');

    if (!combined) {
      alert('Tidak ada prompt klip untuk disalin.');
      return;
    }

    navigator.clipboard.writeText(combined);
    setCopiedAllPrompts(true);
    setTimeout(() => setCopiedAllPrompts(false), 2500);
  };

  // Copy individual clip prompt
  const handleCopyClipPrompt = (clipId: number, text: string) => {
    const cleanText = text.trim().replace(/^```(?:text)?\n?|```$/g, '');
    if (!cleanText || cleanText === 'Konten klip tidak tersedia') {
      alert('Prompt klip belum tersedia.');
      return;
    }
    navigator.clipboard.writeText(cleanText);
    const key = `clip_${clipId}`;
    setCopiedClipKey(key);
    setTimeout(() => setCopiedClipKey(null), 2000);
  };

  // Copy all output raw
  const handleCopyAllRaw = () => {
    navigator.clipboard.writeText(rawResult);
    setCopiedRawAll(true);
    setTimeout(() => setCopiedRawAll(false), 2000);
  };

  // Download idea as TXT
  const handleDownloadTxt = () => {
    const text = [
      `=== PRODUK TO VIDEO: ${currentIdea.title} ===`,
      `Target AI: ${targetAI.toUpperCase()}`,
      `Durasi Total: ${totalDuration} Detik\n`,
      `--- CAPTION SEO ---`,
      currentIdea.caption || '',
      `\n--- HASHTAG RELEVAN (MAX 5) ---`,
      hashtagChips.join(' '),
      `\n--- MASTER PROMPTS PER KLIP ---`,
      ...clipsToRender.map(
        (c) =>
          `\n[KLIP ${c.id} - ${c.timeRange}]\n${(c.aiPrompt || c.actionAndVO || '').trim().replace(/^```(?:text)?\n?|```$/g, '')}`
      ),
      ...(analysisData
        ? [
            `\n--- ANALISIS 5 PILAR PRODUK ---`,
            `Kategori: ${analysisData.category || '-'}`,
            `Bahan/Formula: ${analysisData.ingredients || '-'}`,
            `Pain Points: ${analysisData.problemSolved || '-'}`,
            `Benefit Claim: ${analysisData.benefit || '-'}`,
            `Target User: ${analysisData.targetUser || '-'}`,
            `USP: ${analysisData.usp || '-'}`,
          ]
        : []),
    ].join('\n');

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `produk-to-video-${currentIdea.id || 1}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Concept Selector Tabs if multiple concepts */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {parsedIdeas.length > 1 ? (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
            {parsedIdeas.map((idea, idx) => (
              <button
                key={idea.id || idx}
                type="button"
                onClick={() => setActiveIdeaIndex(idx)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 shrink-0 ${
                  activeIdeaIndex === idx
                    ? 'bg-[#005ab3] text-white shadow-xs'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                }`}
              >
                <span>Konsep #{idea.id || idx + 1}</span>
                <span className="text-[11px] opacity-80 max-w-[140px] truncate">{idea.title}</span>
              </button>
            ))}
          </div>
        ) : (
          <div />
        )}

        {/* Global Action Utility Buttons */}
        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
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
            title="Unduh seluruh script dalam file teks"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>Unduh .TXT</span>
          </button>

          <button
            type="button"
            onClick={handleCopyAllRaw}
            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
            title="Salin seluruh teks output mentah"
          >
            {copiedRawAll ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700">Tersalin</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-600" />
                <span>Salin Semua</span>
              </>
            )}
          </button>
        </div>
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
            <ReactMarkdown>{rawResult}</ReactMarkdown>
          </div>
        </div>
      ) : (
        /* Visual Cards View matching Image 1 (3).jpeg exactly */
        <div className="space-y-6">
          {/* 1. CAPTION SEO TIKTOK / REELS / SHORTS CARD */}
          {currentIdea.caption && (
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
                {currentIdea.caption}
              </p>
            </motion.div>
          )}

          {/* 2. HASHTAG RELEVAN & SEO SEARCH (MAX 5 TAG) CARD */}
          {currentIdea.hashtags && (
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
                    Dipecah per {promptSplitSec === 'auto' ? '10 detik' : `${promptSplitSec} detik`} · Target: {targetAI.toUpperCase()}
                  </p>
                </div>
              </div>

              {clipsToRender.length > 0 && (
                <div className="flex items-center gap-2.5 flex-wrap self-end sm:self-auto">
                  {onOpenBatchPhotoModal && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenBatchPhotoModal({
                          conceptTitle: currentIdea.title,
                          clips: clipsToRender.map((c) => ({
                            id: c.id,
                            title: c.title,
                            timeRange: c.timeRange,
                            actionAndVO: c.actionAndVO,
                            aiPrompt: c.aiPrompt,
                          })),
                        });
                      }}
                      className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-2xs"
                      title="Generate prompt foto untuk seluruh klip ini sekaligus"
                    >
                      <Camera className="w-4 h-4 text-slate-600" />
                      <span>Generate Semua Prompt Foto ({clipsToRender.length} Klip)</span>
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
                      {copiedAllPrompts ? 'Tersalin' : `Salin Semua ${clipsToRender.length} Prompt`}
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* Clip Cards List */}
            {clipsToRender.length === 0 ? (
              <div className="p-8 sm:p-12 rounded-2xl bg-white border border-slate-200/80 text-center space-y-2.5 shadow-xs">
                <Film className="w-10 h-10 text-slate-300 mx-auto" />
                <h5 className="text-sm sm:text-base font-semibold text-slate-800">
                  Belum ada segmen prompt
                </h5>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Belum ada segmen prompt. Generate ulang atau cek hasil raw.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {clipsToRender.map((clip, cIdx) => {
                  const clipKey = `clip_${clip.id}`;
                  const isCopied = copiedClipKey === clipKey;
                  const rawPrompt = (clip.aiPrompt || clip.actionAndVO || clip.visual || '')
                    .trim()
                    .replace(/^```(?:text)?\n?|```$/g, '');
                  const promptText = rawPrompt || 'Konten klip tidak tersedia';
                  const isPromptEmpty = !rawPrompt;

                  return (
                    <div
                      key={clip.id || cIdx}
                      className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-3.5 hover:border-slate-300 transition-all"
                    >
                      {/* Card Top Row: Header + Aksi */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                        {/* a. Baris header: nomor + judul "Segmen Prompt Klip {id}" + badge timeRange */}
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-600 font-bold text-xs border border-blue-100">
                            #{clip.id}
                          </span>
                          <span className="text-sm sm:text-base font-bold text-slate-900">
                            Segmen Prompt Klip {clip.id}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
                            {clip.timeRange}
                          </span>
                          {clip.stageLabel && (
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border shadow-2xs ${getStageBadgeStyle(
                                clip.stageLabel
                              )}`}
                            >
                              {clip.stageLabel}
                            </span>
                          )}
                          {clip.hookType && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 shadow-2xs">
                              {clip.hookType}
                            </span>
                          )}
                        </div>

                        {/* b. Baris aksi: Ke Prompt Foto + Salin Prompt Klip */}
                        <div className="flex items-center gap-2 self-end sm:self-auto">
                          {onSendToPhotoPrompt && (
                            <button
                              type="button"
                              disabled={isPromptEmpty}
                              onClick={() => {
                                if (isPromptEmpty) return;
                                let promptToPass = promptText.startsWith('[')
                                  ? promptText
                                  : `Visual adegan klip [${clip.timeRange}]: ${promptText}`;
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
                                  referenceImage: refImageFile || undefined,
                                });
                              }}
                              className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors shadow-2xs ${
                                isPromptEmpty
                                  ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                                  : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700 cursor-pointer'
                              }`}
                              title={isPromptEmpty ? 'Prompt belum tersedia' : 'Kirim ke Generator Prompt Foto'}
                            >
                              <Camera className="w-3.5 h-3.5 text-slate-500" />
                              <span>Ke Prompt Foto</span>
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={isPromptEmpty}
                            onClick={() => {
                              if (isPromptEmpty) {
                                alert('Konten prompt klip belum tersedia.');
                                return;
                              }
                              handleCopyClipPrompt(clip.id, rawPrompt);
                            }}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors shadow-2xs ${
                              isPromptEmpty
                                ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                                : 'bg-blue-50/70 hover:bg-blue-100 border-blue-200 text-blue-700 cursor-pointer'
                            }`}
                            title={isPromptEmpty ? 'Konten prompt belum tersedia' : 'Salin prompt klip ini'}
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

                      {/* c. Label kecil: MASTER PROMPT AI KLIP {id} (SIAP COPY) */}
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider pt-0.5">
                        <Sparkles className="w-3 h-3 text-slate-400" />
                        <span>MASTER PROMPT AI KLIP {clip.id} (SIAP COPY)</span>
                      </div>

                      {/* d. Kotak konten: promptText (whitespace-pre-wrap) */}
                      <div className="p-4 sm:p-5 rounded-xl bg-[#f8fafc] border border-slate-100 text-slate-800 text-sm leading-relaxed whitespace-pre-wrap select-text font-normal min-h-[90px]">
                        {promptText}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>

          {/* 4. OPTIONAL ACCORDION: DETAIL ANALISIS 5 PILAR & RISET PRODUK */}
          {(analysisData || querySections.length > 0 || currentIdea.angle) && (
            <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
              <button
                type="button"
                onClick={() => setShowStrategicDetails(!showStrategicDetails)}
                className="w-full px-6 py-4 flex items-center justify-between gap-3 text-left hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-indigo-50 text-[#5b50e5] border border-indigo-100">
                    <Sliders className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-slate-900">
                      Detail Analisis 5 Pilar Produk & Riset Kata Kunci
                    </h5>
                    <p className="text-xs text-slate-500">
                      Riset positioning produk, pain points konsumen, dan mapping query pencarian TikTok
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <span>{showStrategicDetails ? 'Tutup Detail' : 'Buka Detail'}</span>
                  {showStrategicDetails ? (
                    <ChevronUp className="w-4 h-4 text-slate-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-500" />
                  )}
                </div>
              </button>

              <AnimatePresence>
                {showStrategicDetails && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="border-t border-slate-100 p-6 space-y-6"
                  >
                    {/* 5 PILAR GRID */}
                    {analysisData && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-[#5b50e5]" />
                          <h6 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                            5 Pilar Analisis Produk
                          </h6>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {analysisData.category && (
                            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                              <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-600 block">
                                📦 Kategori & Positioning
                              </span>
                              <p className="text-xs font-medium text-slate-800">
                                {analysisData.category}
                              </p>
                            </div>
                          )}

                          {analysisData.problemSolved && (
                            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                              <span className="text-[10px] font-extrabold uppercase tracking-widest text-rose-600 block">
                                🔥 Pain Points & Masalah yang Diselesaikan
                              </span>
                              <p className="text-xs font-medium text-slate-800">
                                {analysisData.problemSolved}
                              </p>
                            </div>
                          )}

                          {analysisData.benefit && (
                            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                              <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-600 block">
                                ✨ Klaim Utama & Manfaat Produk
                              </span>
                              <p className="text-xs font-medium text-slate-800">
                                {analysisData.benefit}
                              </p>
                            </div>
                          )}

                          {analysisData.targetUser && (
                            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                              <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-600 block">
                                🎯 Target Pengguna Ideal
                              </span>
                              <p className="text-xs font-medium text-slate-800">
                                {analysisData.targetUser}
                              </p>
                            </div>
                          )}

                          {analysisData.usp && (
                            <div className="p-3.5 rounded-xl bg-purple-50/50 border border-purple-200/60 space-y-1 md:col-span-2">
                              <span className="text-[10px] font-extrabold uppercase tracking-widest text-purple-700 block">
                                💎 Unique Selling Point (USP)
                              </span>
                              <p className="text-xs font-medium text-purple-950">
                                {analysisData.usp}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* STRATEGIC METADATA CARDS */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {currentIdea.angle && (
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                          <span className="text-[10px] uppercase font-bold text-indigo-700 tracking-wider flex items-center gap-1">
                            <Target className="w-3.5 h-3.5 text-[#5b50e5]" /> TIPE & ANGLE KONTEN
                          </span>
                          <p className="text-xs font-semibold text-slate-800">
                            {currentIdea.angle}
                          </p>
                        </div>
                      )}

                      {(currentIdea.targetAudience || analysisData?.targetUser) && (
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                          <span className="text-[10px] uppercase font-bold text-emerald-700 tracking-wider flex items-center gap-1">
                            <Megaphone className="w-3.5 h-3.5 text-emerald-600" /> TARGET AUDIENCE
                          </span>
                          <p className="text-xs font-semibold text-slate-800">
                            {currentIdea.targetAudience || analysisData?.targetUser}
                          </p>
                        </div>
                      )}

                      {currentIdea.atomicAnswerSummary && (
                        <div className="p-3.5 rounded-xl bg-cyan-50/70 border border-cyan-200 space-y-1">
                          <span className="text-[10px] uppercase font-bold text-cyan-900 tracking-wider flex items-center gap-1">
                            <Cpu className="w-3.5 h-3.5 text-cyan-600" /> ATOMIC ANSWER SUMMARY
                          </span>
                          <p className="text-xs font-medium text-cyan-950">
                            {currentIdea.atomicAnswerSummary}
                          </p>
                        </div>
                      )}

                      {currentIdea.consensusTrigger && (
                        <div className="p-3.5 rounded-xl bg-purple-50/70 border border-purple-200 space-y-1">
                          <span className="text-[10px] uppercase font-bold text-purple-900 tracking-wider flex items-center gap-1">
                            <Share2 className="w-3.5 h-3.5 text-purple-600" /> CONSENSUS TRIGGER
                          </span>
                          <p className="text-xs font-medium text-purple-950">
                            {currentIdea.consensusTrigger}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* MAPPING QUERY SEO TIKTOK */}
                    {querySections.length > 0 && (
                      <div className="p-4 rounded-xl bg-slate-900 text-white space-y-3">
                        <div className="flex items-center gap-2">
                          <Search className="w-4 h-4 text-cyan-400" />
                          <h6 className="text-xs font-bold uppercase tracking-wider text-cyan-200">
                            Kata Kunci SEO Pencarian TikTok
                          </h6>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {querySections.flatMap((s) => s.queries).slice(0, 10).map((q, qIdx) => (
                            <span
                              key={qIdx}
                              className="text-xs font-mono bg-white/10 text-cyan-100 px-2.5 py-1 rounded-lg border border-white/10"
                            >
                              #{q}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
