import React, { useEffect, useState } from 'react';
import { signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  Film,
  Grid,
  Image as ImageIcon,
  KeyRound,
  Lock,
  Music,
} from 'lucide-react';
import type { AssetItem } from '../types';
import { auth, googleProvider } from '../lib/firebase';
import { formatBytes, formatDateShort } from '../lib/format';

interface AssetDetailPageProps {
  asset: AssetItem | null;
  loading: boolean;
  liveDownloads: number;
  currentUser: User | null;
  savedAccessCode?: string;
  onBack: () => void;
  onSearchByTag: (tag: string) => void;
  onRefreshStats: () => void;
}

export const AssetDetailPage: React.FC<AssetDetailPageProps> = ({
  asset,
  loading,
  liveDownloads,
  currentUser,
  savedAccessCode = '',
  onBack,
  onSearchByTag,
  onRefreshStats,
}) => {
  const [checkerboard, setCheckerboard] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [accessCode, setAccessCode] = useState(savedAccessCode);
  const [requesting, setRequesting] = useState(false);
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [signedLink, setSignedLink] = useState<{
    url: string;
    expiresAt: number;
    fileName: string;
  } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    setImgFailed(false);
    setSignedLink(null);
    setErrorMsg(null);
    setNeedsUnlock(false);
    setAccessCode(savedAccessCode || '');
  }, [asset?.id, savedAccessCode]);

  useEffect(() => {
    if (!signedLink) {
      setSecondsLeft(0);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.floor((signedLink.expiresAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) {
        setSignedLink(null);
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [signedLink]);

  if (loading) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="h-8 w-40 bg-[#0D0D11] rounded animate-pulse mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 aspect-video bg-[#0D0D11] rounded-xl animate-pulse" />
          <div className="lg:col-span-5 h-96 bg-[#0D0D11] rounded-xl animate-pulse" />
        </div>
      </main>
    );
  }

  if (!asset) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center space-y-4">
        <h1 className="font-display text-2xl font-semibold text-white">Asset not found</h1>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      </main>
    );
  }

  const totalDownloads = Math.max(asset.downloadsCount || 0, liveDownloads || 0);
  const previewSrc = asset.previewMediaUrl || asset.thumbnailUrl;

  const triggerBrowserDownload = (url: string, fileName: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => {
      onRefreshStats();
    }, 900);
  };

  const handleRequestDownload = async (overrideCode?: string) => {
    setRequesting(true);
    setErrorMsg(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (auth.currentUser) {
        const token = await auth.currentUser.getIdToken();
        headers.Authorization = `Bearer ${token}`;
      }

      const codeToUse =
        typeof overrideCode === 'string' ? overrideCode : accessCode || savedAccessCode;

      const res = await fetch(`/api/assets/${encodeURIComponent(asset.id)}/request-download`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          accessCode: codeToUse,
        }),
      });

      const payload = (await res.json()) as {
        mode?: 'direct' | 'signed_temporary';
        downloadUrl?: string;
        expiresAt?: number;
        fileName?: string;
        requiresPremiumAccess?: boolean;
        error?: string;
      };

      if (!res.ok || !payload.downloadUrl) {
        if (res.status === 403 && payload.requiresPremiumAccess) {
          setNeedsUnlock(true);
        }
        setErrorMsg(payload.error || 'Access denied.');
        return;
      }

      if (payload.mode === 'direct') {
        triggerBrowserDownload(payload.downloadUrl, payload.fileName || asset.originalFileName);
      } else {
        setNeedsUnlock(false);
        setSignedLink({
          url: payload.downloadUrl,
          expiresAt: payload.expiresAt || Date.now() + 180_000,
          fileName: payload.fileName || asset.originalFileName,
        });
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Download request failed.');
    } finally {
      setRequesting(false);
    }
  };

  const handleGoogleVerify = async () => {
    setErrorMsg(null);
    try {
      await signInWithPopup(auth, googleProvider);
      await handleRequestDownload();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Google sign-in failed.');
    }
  };

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <span className="text-xs font-mono text-zinc-400">
          {asset.categoryName} · {asset.fileFormat}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Media Preview Stage */}
        <div className="lg:col-span-7 space-y-4">
          <div
            className={`relative rounded-xl border border-white/[0.08] overflow-hidden ${
              checkerboard ? 'checkerboard-surface' : 'bg-[#0D0D11]'
            }`}
          >
            {asset.previewMediaType === 'video' && asset.previewMediaUrl ? (
              <video
                src={asset.previewMediaUrl}
                poster={asset.thumbnailUrl || undefined}
                controls
                playsInline
                preload="metadata"
                className="w-full max-h-[540px] object-contain bg-black"
              />
            ) : asset.previewMediaType === 'audio' ? (
              <div className="p-8 sm:p-10 space-y-6 bg-gradient-to-br from-[#121217] via-[#0D0D11] to-[#20090D]">
                <div className="flex flex-col sm:flex-row items-center gap-5">
                  {asset.thumbnailUrl && !imgFailed ? (
                    <img
                      src={asset.thumbnailUrl}
                      alt={asset.title}
                      referrerPolicy="no-referrer"
                      onError={() => setImgFailed(true)}
                      className="w-24 h-24 rounded-xl object-cover border border-white/10 shrink-0"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-xl bg-[#16161C] border border-white/10 flex items-center justify-center text-red-500 shrink-0">
                      <Music className="w-9 h-9" />
                    </div>
                  )}
                  <div className="space-y-1 text-center sm:text-left">
                    <h2 className="font-display text-xl font-semibold text-white">
                      {asset.title}
                    </h2>
                    <p className="font-mono text-xs text-zinc-400">
                      {asset.fileFormat} · {asset.resolution}
                    </p>
                  </div>
                </div>

                {asset.previewMediaUrl && (
                  <audio
                    src={asset.previewMediaUrl}
                    controls
                    preload="metadata"
                    className="w-full"
                  />
                )}
              </div>
            ) : previewSrc && !imgFailed ? (
              <img
                src={previewSrc}
                alt={asset.title}
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="w-full max-h-[540px] object-contain mx-auto"
              />
            ) : (
              <div className="aspect-[16/10] flex flex-col items-center justify-center p-12 text-center bg-gradient-to-br from-[#14141A] via-[#0B0B0F] to-[#20090D]">
                {asset.previewMediaType === 'video' ? (
                  <Film className="w-11 h-11 text-red-500/80 mb-3" strokeWidth={1.5} />
                ) : (
                  <ImageIcon className="w-11 h-11 text-red-500/80 mb-3" strokeWidth={1.5} />
                )}
                <p className="font-mono text-xs text-zinc-300 uppercase tracking-wider">
                  {asset.fileFormat} · {asset.resolution}
                </p>
              </div>
            )}
          </div>

          {asset.previewMediaType === 'image' && (
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => setCheckerboard((prev) => !prev)}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-colors ${
                  checkerboard
                    ? 'bg-[#16161C] border-red-500/50 text-red-300'
                    : 'bg-[#0D0D11] border-white/[0.08] text-zinc-300 hover:text-white'
                }`}
              >
                <Grid className="w-3.5 h-3.5" />
                <span>{checkerboard ? 'Solid Black' : 'Checkerboard'}</span>
              </button>
            </div>
          )}

          {(asset.description || asset.tags.length > 0) && (
            <div className="bg-[#0D0D11] border border-white/[0.08] rounded-xl p-5 sm:p-6 space-y-4">
              {asset.description && (
                <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line">
                  {asset.description}
                </p>
              )}

              {asset.tags.length > 0 && (
                <div
                  className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm ${
                    asset.description ? 'pt-4 border-t border-white/[0.06]' : ''
                  }`}
                >
                  {asset.tags.map((tag, idx) => (
                    <React.Fragment key={tag}>
                      <button
                        type="button"
                        onClick={() => onSearchByTag(tag)}
                        className="text-zinc-300 hover:text-red-400 transition-colors font-mono text-xs"
                      >
                        #{tag}
                      </button>
                      {idx < asset.tags.length - 1 && (
                        <span aria-hidden="true" className="text-zinc-600">
                          ·
                        </span>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Spec & Download Module */}
        <aside className="lg:col-span-5 bg-[#0D0D11] border border-white/[0.08] rounded-xl p-6 space-y-6 lg:sticky lg:top-24">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-zinc-400">{asset.categoryName}</span>
              <span aria-hidden="true" className="text-zinc-600">
                ·
              </span>
              <span
                className={
                  asset.tier === 'free'
                    ? 'text-zinc-200 font-semibold'
                    : 'text-red-400 font-semibold inline-flex items-center gap-1'
                }
              >
                {asset.tier === 'premium' && <Lock className="w-3 h-3" />}
                {asset.tier === 'free' ? 'Free' : 'Premium'}
              </span>
            </div>

            <h1 className="font-display text-2xl font-bold text-white leading-tight">
              {asset.title}
            </h1>
          </div>

          <dl className="divide-y divide-white/[0.06] border-y border-white/[0.06] text-sm">
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-zinc-400">Format</dt>
              <dd className="font-mono text-white font-medium">{asset.fileFormat}</dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-zinc-400">Resolution</dt>
              <dd className="font-mono tabular-nums text-white">{asset.resolution}</dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-zinc-400">Size</dt>
              <dd className="font-mono tabular-nums text-red-400 font-medium">
                {formatBytes(asset.fileSizeBytes)}
              </dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-zinc-400">File</dt>
              <dd className="font-mono text-xs text-zinc-300 truncate max-w-[200px]">
                {asset.originalFileName}
              </dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-zinc-400">Downloads</dt>
              <dd className="font-mono tabular-nums text-zinc-200">{totalDownloads}</dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-zinc-400">Uploaded</dt>
              <dd className="text-zinc-300">{formatDateShort(asset.createdAt)}</dd>
            </div>
          </dl>

          <div className="space-y-4">
            {signedLink ? (
              <div className="p-4 rounded-xl bg-red-950/30 border border-red-500/35 space-y-3">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    Ready
                  </span>
                  <span className="font-mono tabular-nums text-red-300 inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {formatCountdown(secondsLeft)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => triggerBrowserDownload(signedLink.url, signedLink.fileName)}
                  className="w-full min-h-[48px] px-5 py-3 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Original</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={requesting}
                onClick={() => void handleRequestDownload()}
                className="w-full min-h-[48px] px-5 py-3 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
              >
                {asset.tier === 'premium' ? (
                  <Lock className="w-4 h-4" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>
                  {requesting
                    ? 'Verifying...'
                    : asset.tier === 'premium'
                    ? `Unlock & Download (${formatBytes(asset.fileSizeBytes)})`
                    : `Download Original (${formatBytes(asset.fileSizeBytes)})`}
                </span>
              </button>
            )}

            {asset.tier === 'premium' && needsUnlock && !signedLink && (
              <div className="p-4 rounded-xl bg-[#08080B] border border-white/[0.08] space-y-3.5">
                <p className="text-xs font-semibold text-white">Premium Access Required</p>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleRequestDownload(accessCode);
                  }}
                  className="flex items-center gap-2"
                >
                  <div className="relative flex-1">
                    <KeyRound className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={accessCode}
                      onChange={(e) => setAccessCode(e.target.value)}
                      placeholder="Access code"
                      className="w-full min-h-[44px] pl-9 pr-3 rounded-lg bg-[#0D0D11] border border-white/[0.1] focus:border-red-500 text-sm text-white placeholder:text-zinc-500 focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={requesting || !accessCode.trim()}
                    className="min-h-[44px] px-4 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                  >
                    Unlock
                  </button>
                </form>

                <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-3">
                  {currentUser ? (
                    <div className="flex items-center justify-between w-full text-xs">
                      <span className="text-zinc-400 truncate">{currentUser.email}</span>
                      <button
                        type="button"
                        onClick={() => void signOut(auth)}
                        className="text-zinc-300 hover:text-white underline shrink-0 ml-2"
                      >
                        Switch Account
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleGoogleVerify()}
                      className="w-full min-h-[44px] px-4 rounded-lg border border-white/[0.12] hover:border-white/25 bg-[#0D0D11] text-zinc-200 text-xs font-medium transition-colors"
                    >
                      Verify with Google
                    </button>
                  )}
                </div>
              </div>
            )}

            {errorMsg && (
              <p className="text-xs text-red-400 leading-relaxed" role="alert">
                {errorMsg}
              </p>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
};
