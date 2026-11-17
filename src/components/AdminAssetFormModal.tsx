import React, { useEffect, useState } from 'react';
import { CheckCircle2, FileUp, Lock, Upload, X } from 'lucide-react';
import type { AssetItem, AssetTier, Category, PreviewMediaType } from '../types';
import {
  createAssetWithUpload,
  updateAssetWithStorage,
  type UploadProgressState,
} from '../lib/catalog';
import { detectFileSpecs, formatBytes } from '../lib/format';

interface AdminAssetFormModalProps {
  open: boolean;
  editingAsset: AssetItem | null;
  categories: Category[];
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export const AdminAssetFormModal: React.FC<AdminAssetFormModalProps> = ({
  open,
  editingAsset,
  categories,
  onClose,
  onSuccess,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [tier, setTier] = useState<AssetTier>('free');
  const [fileFormat, setFileFormat] = useState('');
  const [resolution, setResolution] = useState('');
  const [previewMediaType, setPreviewMediaType] = useState<PreviewMediaType>('image');
  const [published, setPublished] = useState(true);

  const [originalFile, setOriginalFile] = useState<File | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<UploadProgressState | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrorMsg(null);
    setProgress(null);
    setOriginalFile(null);

    if (editingAsset) {
      setTitle(editingAsset.title);
      setDescription(editingAsset.description);
      setCategoryId(editingAsset.categoryId);
      setTagsInput(editingAsset.tags.join(', '));
      setTier(editingAsset.tier);
      setFileFormat(editingAsset.fileFormat);
      setResolution(editingAsset.resolution);
      setPreviewMediaType(editingAsset.previewMediaType);
      setPublished(editingAsset.published);
    } else {
      setTitle('');
      setDescription('');
      setCategoryId(categories[0]?.id || 'motion-graphics');
      setTagsInput('');
      setTier('free');
      setFileFormat('');
      setResolution('');
      setPreviewMediaType('image');
      setPublished(true);
    }
  }, [open, editingAsset, categories]);

  if (!open) return null;

  const handleOriginalFileChange = async (file: File | null) => {
    setOriginalFile(file);
    if (!file) return;
    const detected = await detectFileSpecs(file);
    if (!title.trim()) {
      const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ');
      setTitle(cleanName);
    }
    setFileFormat(detected.fileFormat);
    setResolution(detected.resolution);
    setPreviewMediaType(detected.previewMediaType);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!title.trim()) {
      setErrorMsg('Enter an asset title.');
      return;
    }
    if (!editingAsset && !originalFile) {
      setErrorMsg('Select the main file to upload.');
      return;
    }

    const selectedCat = categories.find((c) => c.id === categoryId) || categories[0];
    if (!selectedCat) {
      setErrorMsg('Select a category.');
      return;
    }

    const parsedTags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    setSubmitting(true);
    try {
      if (editingAsset) {
        await updateAssetWithStorage({
          asset: editingAsset,
          title,
          description,
          categoryId: selectedCat.id,
          categoryName: selectedCat.name,
          tags: parsedTags,
          tier,
          fileFormat: fileFormat || editingAsset.fileFormat,
          resolution: resolution || editingAsset.resolution,
          previewMediaType,
          published,
          newOriginalFile: originalFile,
          onProgress: setProgress,
        });
        onSuccess(`Updated "${title.trim()}".`);
      } else if (originalFile) {
        await createAssetWithUpload({
          title,
          description,
          categoryId: selectedCat.id,
          categoryName: selectedCat.name,
          tags: parsedTags,
          tier,
          fileFormat: fileFormat || 'FILE',
          resolution: resolution || 'Original',
          previewMediaType,
          published,
          originalFile,
          onProgress: setProgress,
        });
        onSuccess(`Uploaded "${title.trim()}".`);
      }
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="asset-modal-title"
    >
      <div className="w-full sm:max-w-2xl max-h-[92vh] bg-[#0D0D11] border border-white/[0.12] rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between gap-4 shrink-0">
          <h2 id="asset-modal-title" className="font-display text-lg font-semibold text-white">
            {editingAsset ? 'Edit Asset' : 'Upload Asset'}
          </h2>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            aria-label="Close modal"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body — Direct Single Main File Upload Only */}
        <form onSubmit={(e) => void handleSubmit(e)} className="flex-1 overflow-y-auto p-5 space-y-5">
          <label className="block cursor-pointer rounded-xl border border-dashed border-red-500/50 bg-[#060608] hover:bg-[#121218] p-5 transition-colors">
            <input
              type="file"
              className="sr-only"
              disabled={submitting}
              onChange={(e) => void handleOriginalFileChange(e.target.files?.[0] || null)}
            />
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-red-600/20 text-red-400 flex items-center justify-center shrink-0">
                <FileUp className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-semibold text-white">
                  {editingAsset ? 'Replace Main File (Optional)' : 'Select Main File'}
                </p>
                <p className="text-xs text-zinc-400 truncate">
                  {originalFile
                    ? `${originalFile.name} · ${formatBytes(originalFile.size)}`
                    : editingAsset
                    ? `Current: ${editingAsset.originalFileName}`
                    : 'Tap to upload direct file (no compression)'}
                </p>
              </div>
            </div>
          </label>

          {/* Metadata Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 space-y-1.5">
              <label htmlFor="admin-asset-title" className="block text-xs font-medium text-zinc-300">
                Title
              </label>
              <input
                id="admin-asset-title"
                type="text"
                required
                maxLength={140}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Asset title"
                className="w-full min-h-[44px] px-3.5 rounded-lg bg-[#060608] border border-white/[0.1] focus:border-red-500 text-sm text-white placeholder:text-zinc-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="admin-asset-cat" className="block text-xs font-medium text-zinc-300">
                Category
              </label>
              <select
                id="admin-asset-cat"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-lg bg-[#060608] border border-white/[0.1] focus:border-red-500 text-sm text-white focus:outline-none"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-zinc-300">Access</span>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-[#060608] border border-white/[0.1] min-h-[44px]">
                <button
                  type="button"
                  onClick={() => setTier('free')}
                  className={`rounded-md text-xs font-semibold transition-colors ${
                    tier === 'free'
                      ? 'bg-zinc-200 text-zinc-950'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Free
                </button>
                <button
                  type="button"
                  onClick={() => setTier('premium')}
                  className={`rounded-md text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${
                    tier === 'premium'
                      ? 'bg-red-600 text-white'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Lock className="w-3 h-3" />
                  Premium
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="admin-asset-format" className="block text-xs font-medium text-zinc-300">
                Format
              </label>
              <input
                id="admin-asset-format"
                type="text"
                maxLength={20}
                value={fileFormat}
                onChange={(e) => setFileFormat(e.target.value)}
                placeholder="MP4, MOV, PNG, WAV"
                className="w-full min-h-[44px] px-3.5 rounded-lg bg-[#060608] border border-white/[0.1] focus:border-red-500 text-sm font-mono text-white placeholder:text-zinc-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="admin-asset-res" className="block text-xs font-medium text-zinc-300">
                Resolution
              </label>
              <input
                id="admin-asset-res"
                type="text"
                maxLength={60}
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                placeholder="3840x2160"
                className="w-full min-h-[44px] px-3.5 rounded-lg bg-[#060608] border border-white/[0.1] focus:border-red-500 text-sm font-mono text-white placeholder:text-zinc-500 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2 space-y-1.5">
              <label htmlFor="admin-asset-tags" className="block text-xs font-medium text-zinc-300">
                Tags
              </label>
              <input
                id="admin-asset-tags"
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="4k, transition, loop"
                className="w-full min-h-[44px] px-3.5 rounded-lg bg-[#060608] border border-white/[0.1] focus:border-red-500 text-sm text-white placeholder:text-zinc-500 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2 space-y-1.5">
              <label htmlFor="admin-asset-desc" className="block text-xs font-medium text-zinc-300">
                Description
              </label>
              <textarea
                id="admin-asset-desc"
                rows={2}
                maxLength={2000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Notes (optional)"
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#060608] border border-white/[0.1] focus:border-red-500 text-sm text-white placeholder:text-zinc-500 focus:outline-none"
              />
            </div>
          </div>

          <label className="flex items-center gap-3 min-h-[44px] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
              className="w-5 h-5 rounded border-white/20 bg-[#060608] accent-red-600 focus:ring-red-500"
            />
            <span className="text-sm text-zinc-200">Publish asset</span>
          </label>

          {progress && (
            <div className="p-4 rounded-xl bg-[#060608] border border-red-500/35 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-red-400 font-medium inline-flex items-center gap-1.5">
                  {progress.stage === 'complete' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  {progress.stage === 'uploading'
                    ? 'Uploading file...'
                    : progress.stage === 'saving_metadata'
                    ? 'Saving...'
                    : 'Complete'}
                </span>
                <span className="font-mono tabular-nums text-white font-semibold">
                  {progress.percent}%
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-[#16161C] overflow-hidden">
                <div
                  className="h-full bg-red-600 transition-all duration-150"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <p className="font-mono tabular-nums text-[11px] text-zinc-400">
                {formatBytes(progress.loadedBytes)} / {formatBytes(progress.totalBytes)}
              </p>
            </div>
          )}

          {errorMsg && (
            <p className="text-xs text-red-400 bg-red-950/35 border border-red-500/30 rounded-lg p-3">
              {errorMsg}
            </p>
          )}

          <div className="pt-2 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="min-h-[48px] px-5 rounded-lg border border-white/[0.1] text-sm font-medium text-zinc-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[48px] px-6 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span>
                {submitting
                  ? 'Uploading...'
                  : editingAsset
                  ? 'Save Changes'
                  : 'Upload Asset'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
