import React, { useState } from 'react';
import { Film, Image as ImageIcon, Layers, Lock, Music } from 'lucide-react';
import type { AssetItem } from '../types';
import { formatBytes, formatCompactCount } from '../lib/format';

interface AssetCardProps {
  asset: AssetItem;
  liveDownloads: number;
  onSelect: (asset: AssetItem) => void;
}

export const AssetCard: React.FC<AssetCardProps> = ({ asset, liveDownloads, onSelect }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const downloads = Math.max(asset.downloadsCount || 0, liveDownloads || 0);

  const renderFallbackArtwork = () => {
    const Icon =
      asset.previewMediaType === 'video'
        ? Film
        : asset.previewMediaType === 'audio'
        ? Music
        : asset.categoryId === 'overlays' || asset.categoryId === 'transitions'
        ? Layers
        : ImageIcon;

    return (
      <div className="w-full h-full bg-gradient-to-br from-[#14141A] via-[#0B0B0F] to-[#20090D] flex flex-col items-center justify-center p-6 text-center">
        <Icon className="w-8 h-8 text-red-500/80 mb-2" strokeWidth={1.5} />
        <span className="font-mono text-xs text-zinc-400 uppercase tracking-wider">
          {asset.fileFormat || 'FILE'}
        </span>
      </div>
    );
  };

  return (
    <article
      onClick={() => onSelect(asset)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(asset);
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Open ${asset.title}`}
      className="group cursor-pointer bg-[#0D0D11] border border-white/[0.08] rounded-xl overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-red-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
    >
      {/* Preview Frame */}
      <div className="relative aspect-[16/10] bg-[#08080B] overflow-hidden border-b border-white/[0.06]">
        {asset.thumbnailUrl && !imgFailed ? (
          <img
            src={asset.thumbnailUrl}
            alt={asset.title}
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          renderFallbackArtwork()
        )}

        {(asset.previewMediaType === 'video' || asset.previewMediaType === 'audio') && (
          <div className="absolute bottom-2.5 right-2.5 w-8 h-8 rounded-lg bg-[#060608]/85 backdrop-blur-sm border border-white/10 flex items-center justify-center text-zinc-200">
            {asset.previewMediaType === 'video' ? (
              <Film className="w-4 h-4" />
            ) : (
              <Music className="w-4 h-4" />
            )}
          </div>
        )}
      </div>

      {/* Metadata + Title + Specs */}
      <div className="p-4 sm:p-5 space-y-2.5">
        <div className="flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-zinc-400 truncate">
            <span className="truncate">{asset.categoryName}</span>
            <span aria-hidden="true">·</span>
            <span
              className={
                asset.tier === 'free'
                  ? 'text-zinc-200 font-medium'
                  : 'text-red-400 font-semibold inline-flex items-center gap-1'
              }
            >
              {asset.tier === 'premium' && <Lock className="w-3 h-3" />}
              {asset.tier === 'free' ? 'Free' : 'Premium'}
            </span>
          </div>

          <span className="font-mono tabular-nums text-zinc-500 shrink-0">
            {formatCompactCount(downloads)}
          </span>
        </div>

        <h3 className="font-display text-base font-semibold text-zinc-100 group-hover:text-white transition-colors line-clamp-1">
          {asset.title}
        </h3>

        <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2 font-mono tabular-nums text-xs text-zinc-400">
          <span className="truncate">
            {asset.fileFormat} · {asset.resolution}
          </span>
          <span className="shrink-0 text-zinc-200">{formatBytes(asset.fileSizeBytes)}</span>
        </div>
      </div>
    </article>
  );
};
