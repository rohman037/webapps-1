import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Trash2, 
  Edit2, 
  X, 
  Save, 
  Link as LinkIcon,
  Eye,
  EyeOff,
  Loader2,
  Globe,
  Search,
  Filter,
  RotateCcw
} from 'lucide-react';
import { 
  TrendVideo, 
  TREND_CATEGORIES, 
  TREND_COUNTRIES,
  getCountryInfo,
  subscribeTrendVideos, 
  addTrendVideo, 
  updateTrendVideo, 
  softDeleteTrendVideo,
  fetchTikTokMeta
} from '../../lib/trendVideos';

export default function TrendVideoManagementPanel() {
  const [videos, setVideos] = useState<TrendVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    tiktokUrl: '',
    category: TREND_CATEGORIES[0] as string,
    country: 'ID'
  });

  // Filter states
  const [selectedCountry, setSelectedCountry] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<'ALL' | 'active' | 'inactive'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    const unsubscribe = subscribeTrendVideos((data) => {
      setVideos(data);
      setLoading(false);
    }, false); // false = ambil semua termasuk non-aktif

    return () => unsubscribe();
  }, []);

  const resetForm = () => {
    setForm({
      tiktokUrl: '',
      category: TREND_CATEGORIES[0],
      country: 'ID'
    });
    setEditingId(null);
  };

  const validLinks = form.tiktokUrl
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l.includes('tiktok.com'));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingId) {
      const singleLink = form.tiktokUrl.trim();
      if (!singleLink) {
        alert('Link TikTok wajib diisi');
        return;
      }
      setSaving(true);
      try {
        const meta = await fetchTikTokMeta(singleLink);
        await updateTrendVideo(editingId, {
          tiktokUrl: singleLink,
          title: meta?.title || singleLink,
          category: form.category,
          country: form.country,
          thumbnailUrl: meta?.thumbnailUrl || '',
          viewCount: meta?.viewCount || '',
          likeCount: meta?.likeCount || ''
        });
        resetForm();
      } catch (err) {
        console.error(err);
        alert('Gagal mengupdate data video');
      } finally {
        setSaving(false);
      }
      return;
    }

    // Mode Bulk Insert
    const links = form.tiktokUrl
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && l.includes('tiktok.com'));

    if (links.length === 0) {
      alert('Masukkan minimal 1 link TikTok yang valid');
      return;
    }

    setSaving(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const link of links) {
        try {
          const meta = await fetchTikTokMeta(link);

          await addTrendVideo({
            tiktokUrl: link,
            title: meta?.title || link,
            category: form.category,
            country: form.country,
            thumbnailUrl: meta?.thumbnailUrl || '',
            viewCount: meta?.viewCount || '',
            likeCount: meta?.likeCount || ''
          });
          successCount++;
        } catch (err) {
          console.error('Gagal proses link:', link, err);
          failCount++;
        }
      }

      alert(`Berhasil menambahkan ${successCount} video${failCount > 0 ? `, gagal ${failCount}` : ''}`);
      resetForm();
    } catch (err) {
      console.error(err);
      alert('Terjadi kesalahan saat menyimpan');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (video: TrendVideo) => {
    setEditingId(video.id);
    setForm({
      tiktokUrl: video.tiktokUrl || '',
      category: video.category || TREND_CATEGORIES[0],
      country: video.country || 'ID'
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSoftDelete = async (id: string) => {
    if (!confirm('Nonaktifkan video ini? User tidak akan melihatnya lagi.')) return;
    try {
      await softDeleteTrendVideo(id);
    } catch (err) {
      console.error(err);
      alert('Gagal menonaktifkan');
    }
  };

  const handleToggleActive = async (video: TrendVideo) => {
    try {
      await updateTrendVideo(video.id, { isActive: !video.isActive });
    } catch (err) {
      console.error(err);
    }
  };

  // Video counts by country
  const countryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    videos.forEach((v) => {
      const c = v.country || 'ID';
      counts[c] = (counts[c] || 0) + 1;
    });
    return counts;
  }, [videos]);

  // Filtered list
  const filteredVideos = useMemo(() => {
    return videos.filter((video) => {
      const countryCode = video.country || 'ID';
      if (selectedCountry !== 'ALL' && countryCode !== selectedCountry) {
        return false;
      }
      if (selectedCategory !== 'ALL' && video.category !== selectedCategory) {
        return false;
      }
      if (selectedStatus === 'active' && !video.isActive) {
        return false;
      }
      if (selectedStatus === 'inactive' && video.isActive) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = (video.title || '').toLowerCase().includes(q);
        const matchUrl = (video.tiktokUrl || '').toLowerCase().includes(q);
        const matchCat = (video.category || '').toLowerCase().includes(q);
        if (!matchTitle && !matchUrl && !matchCat) return false;
      }
      return true;
    });
  }, [videos, selectedCountry, selectedCategory, selectedStatus, searchQuery]);

  const hasActiveFilters = selectedCountry !== 'ALL' || selectedCategory !== 'ALL' || selectedStatus !== 'ALL' || searchQuery.trim() !== '';

  const handleResetFilters = () => {
    setSelectedCountry('ALL');
    setSelectedCategory('ALL');
    setSelectedStatus('ALL');
    setSearchQuery('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-slate-800">Manajemen Trend Video Viral</h2>
        <p className="text-sm text-slate-500 mt-1">
          Tambahkan dan kelola link video TikTok viral berdasarkan negara dan kategori produk.
        </p>
      </div>

      {/* Form */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-slate-700 flex items-center gap-2">
            {editingId ? 'Edit Video' : 'Tambah Video Baru'}
          </h3>
          {editingId && (
            <button
              onClick={resetForm}
              className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1 cursor-pointer"
            >
              <X size={14} /> Batal Edit
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Link TikTok <span className="text-red-500">*</span>
            </label>
            {editingId ? (
              <input
                type="url"
                required
                value={form.tiktokUrl}
                onChange={(e) => setForm({ ...form, tiktokUrl: e.target.value })}
                placeholder="https://www.tiktok.com/@user/video/..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent font-mono"
              />
            ) : (
              <div>
                <textarea
                  rows={5}
                  required
                  value={form.tiktokUrl}
                  onChange={(e) => setForm({ ...form, tiktokUrl: e.target.value })}
                  placeholder="Paste banyak link TikTok di sini (satu link per baris)&#10;Contoh:&#10;https://www.tiktok.com/@user/video/123&#10;https://www.tiktok.com/@user/video/456"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent font-mono resize-y"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Satu link per baris. Semua link akan otomatis dikelompokkan ke kategori dan negara yang dipilih.
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Kategori Produk <span className="text-red-500">*</span>
            </label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent bg-white cursor-pointer"
            >
              {TREND_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1 flex items-center gap-1.5">
              <Globe size={14} className="text-violet-600" />
              Negara / Region Video <span className="text-red-500">*</span>
            </label>
            <select
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent bg-white cursor-pointer"
            >
              {TREND_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2 flex justify-end pt-1">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg disabled:opacity-60 transition-colors cursor-pointer shadow-sm"
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <Save size={16} />
                  {editingId 
                    ? 'Update Video' 
                    : validLinks.length > 1 
                      ? `Tambah ${validLinks.length} Video (${getCountryInfo(form.country).flag} ${getCountryInfo(form.country).name})` 
                      : 'Tambah Video'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Filter Bar & Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold text-slate-800 text-base">
                Daftar Video Trend ({filteredVideos.length}{filteredVideos.length !== videos.length ? ` dari ${videos.length}` : ''})
              </h3>
              <p className="text-xs text-slate-500">
                Filter berdasarkan negara atau kategori untuk memantau konten secara terstruktur.
              </p>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 transition-colors self-start cursor-pointer"
              >
                <RotateCcw size={12} />
                Reset Filter
              </button>
            )}
          </div>

          {/* Quick Country Tabs */}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              <Globe size={13} className="text-violet-600" />
              <span>Filter Negara:</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setSelectedCountry('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  selectedCountry === 'ALL'
                    ? 'bg-violet-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>Semua Negara</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  selectedCountry === 'ALL' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  {videos.length}
                </span>
              </button>

              {TREND_COUNTRIES.map((c) => {
                const count = countryCounts[c.code] || 0;
                const isSelected = selectedCountry === c.code;
                return (
                  <button
                    type="button"
                    key={c.code}
                    onClick={() => setSelectedCountry(c.code)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-violet-600 text-white font-semibold shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <span>{c.flag}</span>
                    <span>{c.name.split(' ')[0]}</span>
                    {count > 0 && (
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                        isSelected ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Secondary Controls: Search, Category, Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
            {/* Search Input */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari judul, link, kata kunci..."
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white"
              />
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-2">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white cursor-pointer"
              >
                <option value="ALL">Semua Kategori</option>
                {TREND_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value as any)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white cursor-pointer"
              >
                <option value="ALL">Semua Status</option>
                <option value="active">Hanya Aktif</option>
                <option value="inactive">Hanya Nonaktif</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-slate-400">
            <Loader2 className="mx-auto animate-spin mb-2" size={24} />
            Memuat data...
          </div>
        ) : filteredVideos.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">
            {hasActiveFilters 
              ? 'Tidak ada video yang cocok dengan filter yang dipilih.' 
              : 'Belum ada video. Tambahkan video pertama di form atas.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Link & Video</th>
                  <th className="text-left px-4 py-3 font-medium">Negara</th>
                  <th className="text-left px-4 py-3 font-medium">Kategori</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-4 py-3 font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredVideos.map((video) => {
                  const country = getCountryInfo(video.country);
                  return (
                    <tr key={video.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800 line-clamp-1 max-w-[320px]">
                          {video.title || video.tiktokUrl}
                        </div>
                        <a 
                          href={video.tiktokUrl} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-xs text-violet-600 hover:underline flex items-center gap-1 mt-0.5"
                        >
                          <LinkIcon size={11} />
                          Buka link
                        </a>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 border border-indigo-100 text-indigo-800">
                          <span>{country.flag}</span>
                          <span>{country.name}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">
                          {video.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {video.isActive ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                            <Eye size={12} /> Aktif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-400 font-medium">
                            <EyeOff size={12} /> Nonaktif
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleEdit(video)}
                            className="p-1.5 text-slate-500 hover:text-violet-600 hover:bg-violet-50 rounded-md transition-colors cursor-pointer"
                            title="Edit"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            onClick={() => handleToggleActive(video)}
                            className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-md transition-colors cursor-pointer"
                            title={video.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                          >
                            {video.isActive ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                          <button
                            onClick={() => handleSoftDelete(video.id)}
                            className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                            title="Hapus (soft)"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
