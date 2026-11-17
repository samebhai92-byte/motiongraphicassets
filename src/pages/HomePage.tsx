import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, FolderOpen, Search, X } from 'lucide-react';
import type { AssetItem, AssetTier, Category } from '../types';
import { DEFAULT_CATEGORIES } from '../types';
import { getTimestampMs } from '../lib/format';
import { AssetCard } from '../components/AssetCard';

interface HomePageProps {
  assets: AssetItem[];
  categories: Category[];
  downloadsByAsset: Record<string, number>;
  loading: boolean;
  initialSearch?: string;
  initialCategory?: string;
  initialSort?: 'latest' | 'popular';
  onSelectAsset: (asset: AssetItem) => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  assets,
  categories,
  downloadsByAsset,
  loading,
  initialSearch = '',
  initialCategory = 'all',
  initialSort = 'latest',
  onSelectAsset,
}) => {
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory);
  const [selectedTier, setSelectedTier] = useState<'all' | AssetTier>('all');
  const [sortMode, setSortMode] = useState<'latest' | 'popular'>(initialSort);

  const effectiveCategories = useMemo(() => {
    if (categories.length > 0) return categories;
    return DEFAULT_CATEGORIES;
  }, [categories]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of assets) {
      counts[a.categoryId] = (counts[a.categoryId] || 0) + 1;
    }
    return counts;
  }, [assets]);

  const filteredAssets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = assets.filter((asset) => {
      if (selectedCategory !== 'all' && asset.categoryId !== selectedCategory) {
        return false;
      }
      if (selectedTier !== 'all' && asset.tier !== selectedTier) {
        return false;
      }
      if (!q) return true;

      const inTitle = asset.title.toLowerCase().includes(q);
      const inCategory = asset.categoryName.toLowerCase().includes(q);
      const inFormat = asset.fileFormat.toLowerCase().includes(q);
      const inTags = asset.tags.some((t) => t.toLowerCase().includes(q));
      const inDescription = asset.description.toLowerCase().includes(q);
      return inTitle || inCategory || inFormat || inTags || inDescription;
    });

    return filtered.sort((a, b) => {
      if (sortMode === 'popular') {
        const dlA = Math.max(a.downloadsCount || 0, downloadsByAsset[a.id] || 0);
        const dlB = Math.max(b.downloadsCount || 0, downloadsByAsset[b.id] || 0);
        if (dlB !== dlA) return dlB - dlA;
      }
      return getTimestampMs(b.createdAt) - getTimestampMs(a.createdAt);
    });
  }, [assets, searchQuery, selectedCategory, selectedTier, sortMode, downloadsByAsset]);

  const handleCategoryClick = (categoryId: string) => {
    setSelectedCategory(categoryId);
    const el = document.getElementById('library');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <main id="top" className="bg-[#060608]">
      {/* Compact Hero + Search Bar */}
      <section className="relative overflow-hidden border-b border-white/[0.08]">
        <div className="absolute inset-0 pointer-events-none">
          <img
            src="/src/assets/images/hero_crimson_studio_1794950989571.jpg"
            alt=""
            aria-hidden="true"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover opacity-55"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#060608]/75 via-[#060608]/85 to-[#060608]" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-14 lg:pt-16 lg:pb-18">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-3xl space-y-6"
          >
            <h1
              className="font-display font-bold text-white tracking-tight leading-[1.06]"
              style={{ fontSize: 'clamp(2.2rem, 4.5vw, 3.5rem)', textWrap: 'balance' }}
            >
              Digital Assets
            </h1>

            {/* Search Input */}
            <div>
              <label htmlFor="asset-search-input" className="sr-only">
                Search assets
              </label>
              <div className="relative flex items-center bg-[#0D0D11]/95 border border-white/[0.14] focus-within:border-red-500 rounded-xl shadow-2xl shadow-black/70 transition-colors">
                <Search className="w-5 h-5 text-zinc-400 ml-4 shrink-0" />
                <input
                  id="asset-search-input"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search assets, categories, or tags..."
                  className="w-full bg-transparent px-3.5 py-3.5 sm:py-4 text-sm sm:text-base text-white placeholder:text-zinc-500 focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => setSearchQuery('')}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById('library');
                    el?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="mr-2 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 hidden sm:inline-flex items-center gap-1.5"
                >
                  <span>Search</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Category Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  selectedCategory === 'all'
                    ? 'bg-red-600 text-white'
                    : 'bg-[#0D0D11]/90 text-zinc-300 border border-white/[0.08] hover:border-white/25 hover:text-white'
                }`}
              >
                All
              </button>
              {effectiveCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleCategoryClick(cat.id)}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    selectedCategory === cat.id
                      ? 'bg-red-600 text-white'
                      : 'bg-[#0D0D11]/90 text-zinc-300 border border-white/[0.08] hover:border-white/25 hover:text-white'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Catalog Grid */}
      <section id="library" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
          <div className="flex items-baseline gap-3">
            <h2 className="font-display text-xl sm:text-2xl font-semibold text-white">
              {selectedCategory === 'all'
                ? sortMode === 'latest'
                  ? 'Latest Uploads'
                  : 'Popular Assets'
                : effectiveCategories.find((c) => c.id === selectedCategory)?.name || 'Library'}
            </h2>
            <span className="font-mono tabular-nums text-xs text-zinc-500">
              {filteredAssets.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex items-center p-1 bg-[#0D0D11] border border-white/[0.08] rounded-lg">
              <button
                type="button"
                onClick={() => setSortMode('latest')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  sortMode === 'latest'
                    ? 'bg-[#1B1B22] text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Latest
              </button>
              <button
                type="button"
                onClick={() => setSortMode('popular')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  sortMode === 'popular'
                    ? 'bg-[#1B1B22] text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Popular
              </button>
            </div>

            <div className="inline-flex items-center p-1 bg-[#0D0D11] border border-white/[0.08] rounded-lg">
              {(['all', 'free', 'premium'] as const).map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setSelectedTier(tier)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    selectedTier === tier
                      ? 'bg-red-600 text-white'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {tier === 'all' ? 'All' : tier === 'free' ? 'Free' : 'Premium'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="bg-[#0D0D11] border border-white/[0.08] rounded-xl overflow-hidden animate-pulse"
              >
                <div className="aspect-[16/10] bg-[#16161C]" />
                <div className="p-5 space-y-3">
                  <div className="h-3 w-28 bg-[#16161C] rounded" />
                  <div className="h-5 w-3/4 bg-[#16161C] rounded" />
                  <div className="h-3 w-1/2 bg-[#16161C] rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredAssets.length === 0 ? (
          <div className="bg-[#0D0D11] border border-white/[0.08] rounded-xl p-10 text-center space-y-4">
            <div className="w-11 h-11 rounded-xl bg-[#16161C] border border-white/[0.08] flex items-center justify-center mx-auto text-red-500">
              <FolderOpen className="w-5 h-5" />
            </div>
            <h3 className="font-display text-base font-semibold text-white">
              {assets.length === 0 ? 'No assets uploaded yet' : 'No matching assets'}
            </h3>
            {(searchQuery || selectedCategory !== 'all' || selectedTier !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                  setSelectedTier('all');
                }}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredAssets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                liveDownloads={downloadsByAsset[asset.id] || 0}
                onSelect={onSelectAsset}
              />
            ))}
          </div>
        )}
      </section>

      {/* Compact Categories Index */}
      <section
        id="categories"
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 border-t border-white/[0.08]"
      >
        <h2 className="font-display text-lg font-semibold text-white mb-5">Categories</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {effectiveCategories.map((cat) => {
            const count = categoryCounts[cat.id] || 0;
            const active = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleCategoryClick(cat.id)}
                className={`text-left px-4 py-3.5 rounded-xl border flex items-center justify-between gap-2 transition-colors ${
                  active
                    ? 'bg-[#16161C] border-red-500/60 text-white'
                    : 'bg-[#0D0D11] border-white/[0.08] hover:border-white/20 text-zinc-200'
                }`}
              >
                <span className="text-sm font-medium truncate">{cat.name}</span>
                <span className="font-mono tabular-nums text-xs text-red-400 shrink-0">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
};
