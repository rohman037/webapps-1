import React, { useState, useEffect, useMemo } from 'react';
import { 
  Copy, 
  Check, 
  Link as LinkIcon, 
  Filter,
  Loader2,
  TrendingUp,
  ExternalLink,
  Flame,
  Sparkles,
  Globe
} from 'lucide-react';
import { 
  TrendVideo, 
  TREND_CATEGORIES, 
  getCountryInfo,
  subscribeTrendVideos 
} from '../../lib/trendVideos';

export default function TrendVideoTool() {
  const [videos, setVideos] = useState<TrendVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua');
  const [selectedCountry, setSelectedCountry] = useState<string>('Semua');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeTrendVideos((data) => {
      setVideos(data);
      setLoading(false);
    }, true); // true = hanya yang aktif

    return () => unsubscribe();
  }, []);

  // Hanya tampilkan negara yang benar-benar memiliki video aktif yang ditambahkan oleh admin
  const availableCountries = useMemo(() => {
    const map = new Map<string, { code: string; name: string; flag: string; count: number }>();
    videos.forEach((v) => {
      const code = (v.country || 'ID').toUpperCase();
      const existing = map.get(code);
      if (existing) {
        existing.count += 1;
      } else {
        const info = getCountryInfo(code);
        map.set(code, {
          code: info.code,
          name: info.name,
          flag: info.flag,
          count: 1
        });
      }
    });
    return Array.from(map.values());
  }, [videos]);

  // Jika negara yang sedang dipilih tidak ada lagi di daftar negara aktif, reset ke 'Semua'
  useEffect(() => {
    if (selectedCountry !== 'Semua' && !availableCountries.some((c) => c.code === selectedCountry)) {
      setSelectedCountry('Semua');
    }
  }, [availableCountries, selectedCountry]);

  const filteredVideos = videos.filter((v) => {
    const matchCat = selectedCategory === 'Semua' || v.category === selectedCategory;
    const vCountry = (v.country || 'ID').toUpperCase();
    const matchCountry = selectedCountry === 'Semua' || vCountry === selectedCountry;
    return matchCat && matchCountry;
  });

  const handleCopy = async (video: TrendVideo) => {
    try {
      await navigator.clipboard.writeText(video.tiktokUrl);
      setCopiedId(video.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Gagal copy:', err);
      alert('Gagal menyalin link');
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp size={20} className="text-violet-600" />
          <h2 className="text-lg font-semibold text-slate-800">Trend Video Viral</h2>
        </div>
        <p className="text-sm text-slate-500">
          Kumpulan video TikTok viral per negara & kategori. Salin link lalu tempel ke tool lain (Replika Video, Ekstrak Prompt, dll).
        </p>
      </div>

      {/* Filters */}
      <div className="mb-5 flex items-center gap-3 flex-wrap bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
        {/* Country Filter - Hanya tampil jika ada negara yang ditambahkan oleh admin */}
        {availableCountries.length > 0 && (
          <>
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <Globe size={15} className="text-violet-600" />
              <span className="font-semibold text-xs">Negara:</span>
              <select
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500 cursor-pointer"
              >
                {availableCountries.length > 1 && (
                  <option value="Semua">Semua Negara ({videos.length})</option>
                )}
                {availableCountries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.name} ({c.count})
                  </option>
                ))}
              </select>
            </div>

            <div className="h-4 w-[1px] bg-slate-200 hidden sm:block" />
          </>
        )}

        {/* Category Filter */}
        <div className="flex items-center gap-2 text-sm text-slate-700">
          <Filter size={15} className="text-slate-500" />
          <span className="font-semibold text-xs">Kategori:</span>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500 cursor-pointer"
          >
            <option value="Semua">Semua Kategori</option>
            {TREND_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <div className="ml-auto text-xs text-slate-500 font-medium">
          Menampilkan <span className="font-bold text-slate-800">{filteredVideos.length}</span> video
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#5b50e5] flex items-center justify-center text-white shadow-xs">
                <Flame className="w-4 h-4 animate-pulse" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800">Menyinkronkan Video Trend TikTok Terkini</p>
                <p className="text-[11px] text-slate-500">Mengambil referensi konten viral, audio sound, dan kategori FYP...</p>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#5b50e5] animate-ping" />
              <span className="text-xs font-bold text-[#5b50e5]">Live Sync</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <div
                key={n}
                className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs flex flex-col"
              >
                <div className="aspect-[9/12] bg-slate-100 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-200/50 to-transparent -translate-x-full animate-[shimmer_1.6s_infinite]" />
                  <div className="absolute top-2.5 right-2.5 w-14 h-5 rounded-full bg-slate-200/80" />
                  <div className="absolute bottom-2.5 left-2.5 right-2.5 space-y-1.5">
                    <div className="w-3/4 h-3 rounded bg-slate-200/80" />
                    <div className="w-1/2 h-2.5 rounded bg-slate-200/80" />
                  </div>
                </div>
                <div className="p-3 space-y-2">
                  <div className="w-full h-3 bg-slate-100 rounded" />
                  <div className="w-2/3 h-2.5 bg-slate-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : filteredVideos.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <div className="text-center">
            <TrendingUp size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">Belum ada video trend yang sesuai.</p>
            <p className="text-xs mt-1">Coba ubah filter negara atau kategori di atas.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto pb-6">
          {filteredVideos.map((video) => {
            const country = getCountryInfo(video.country);
            return (
              <div
                key={video.id}
                className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col"
              >
                {/* Thumbnail */}
                <div className="aspect-[9/12] bg-slate-100 relative overflow-hidden">
                  {video.thumbnailUrl ? (
                    <img
                      src={video.thumbnailUrl}
                      alt={video.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                      <TrendingUp size={40} />
                    </div>
                  )}

                  {/* Badges: Kategori & Negara */}
                  <div className="absolute top-2 left-2 flex items-center gap-1 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-black/70 text-white backdrop-blur-sm">
                      <span>{country.flag}</span>
                      <span>{country.code}</span>
                    </span>
                    <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-medium bg-black/60 text-white backdrop-blur-sm">
                      {video.category}
                    </span>
                  </div>
                </div>

                {/* Info */}
                <div className="p-3 flex flex-col flex-1">
                  <h3 className="text-sm font-medium text-slate-800 line-clamp-2 mb-2 leading-snug">
                    {video.title}
                  </h3>

                  <div className="flex items-center gap-3 text-xs text-slate-500 mb-3">
                    {video.viewCount && (
                      <span>{video.viewCount} views</span>
                    )}
                    {video.likeCount && (
                      <span>{video.likeCount} likes</span>
                    )}
                  </div>

                  <div className="mt-auto flex gap-2">
                    <button
                      onClick={() => handleCopy(video)}
                      className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        copiedId === video.id
                          ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                          : 'bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-100'
                      }`}
                    >
                      {copiedId === video.id ? (
                        <>
                          <Check size={13} />
                          Tersalin
                        </>
                      ) : (
                        <>
                          <Copy size={13} />
                          Salin Link
                        </>
                      )}
                    </button>

                    <a
                      href={video.tiktokUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center px-2.5 py-2 rounded-lg text-xs text-slate-500 hover:text-violet-600 hover:bg-slate-50 border border-slate-200 transition-colors"
                      title="Buka di TikTok"
                    >
                      <ExternalLink size={13} />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
