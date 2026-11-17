import type { PreviewMediaType } from '../types';

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${value >= 100 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

export function formatCompactCount(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '0';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}

export function slugify(text: string): string {
  const cleaned = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || `asset-${Date.now()}`;
}

export function getTimestampMs(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    const seconds = Number((value as { seconds?: number }).seconds || 0);
    return seconds * 1000;
  }
  return 0;
}

export function formatDateShort(value: unknown): string {
  const ms = getTimestampMs(value);
  if (!ms) return 'Just now';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(ms));
}

export interface DetectedFileSpecs {
  fileFormat: string;
  previewMediaType: PreviewMediaType;
  resolution: string;
}

export async function detectFileSpecs(file: File): Promise<DetectedFileSpecs> {
  const nameParts = file.name.split('.');
  const ext = nameParts.length > 1 ? nameParts[nameParts.length - 1].toUpperCase().slice(0, 12) : 'BIN';
  const mime = (file.type || '').toLowerCase();

  if (mime.startsWith('image/') || ['PNG', 'JPG', 'JPEG', 'WEBP', 'GIF', 'SVG'].includes(ext)) {
    const dims = await new Promise<string>((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const res = img.naturalWidth && img.naturalHeight ? `${img.naturalWidth}x${img.naturalHeight}` : 'Vector / High-Res';
        URL.revokeObjectURL(url);
        resolve(res);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve('High Resolution');
      };
      img.src = url;
    });

    return {
      fileFormat: ext,
      previewMediaType: 'image',
      resolution: dims,
    };
  }

  if (mime.startsWith('video/') || ['MP4', 'MOV', 'WEBM', 'MKV', 'AVI'].includes(ext)) {
    const dims = await new Promise<string>((resolve) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        const res = video.videoWidth && video.videoHeight ? `${video.videoWidth}x${video.videoHeight}` : '4K / HD Video';
        URL.revokeObjectURL(url);
        resolve(res);
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        resolve('1920x1080');
      };
      video.src = url;
    });

    return {
      fileFormat: ext,
      previewMediaType: 'video',
      resolution: dims,
    };
  }

  if (mime.startsWith('audio/') || ['WAV', 'MP3', 'FLAC', 'OGG', 'AAC', 'M4A', 'AIFF'].includes(ext)) {
    const duration = await new Promise<string>((resolve) => {
      const url = URL.createObjectURL(file);
      const audio = document.createElement('audio');
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        const secs = Math.round(audio.duration || 0);
        URL.revokeObjectURL(url);
        resolve(secs > 0 ? `48kHz · ${secs}s` : '48kHz / 24-bit');
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        resolve('48kHz / 24-bit');
      };
      audio.src = url;
    });

    return {
      fileFormat: ext,
      previewMediaType: 'audio',
      resolution: duration,
    };
  }

  return {
    fileFormat: ext,
    previewMediaType: 'image',
    resolution: 'Original Source',
  };
}
