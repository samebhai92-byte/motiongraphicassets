export type AssetTier = 'free' | 'premium';
export type PreviewMediaType = 'image' | 'video' | 'audio';

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AssetItem {
  id: string;
  title: string;
  slug: string;
  description: string;
  categoryId: string;
  categoryName: string;
  tags: string[];
  tier: AssetTier;
  fileFormat: string;
  resolution: string;
  fileSizeBytes: number;
  originalFileName: string;
  mimeType: string;
  thumbnailUrl: string;
  previewMediaType: PreviewMediaType;
  previewMediaUrl: string;
  downloadsCount: number;
  published: boolean;
  authorUid: string;
  createdAt?: { seconds: number; nanoseconds: number } | Date | null;
  updatedAt?: { seconds: number; nanoseconds: number } | Date | null;
}

export interface PremiumGrant {
  id: string;
  label: string;
  grantType: 'email' | 'code';
  granteeEmail: string;
  accessCodeHash: string;
  active: boolean;
  expiresAtIso: string;
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PaymentSettings {
  priceInr: number;
  upiId: string;
  qrCodeUrl: string;
  updatedByUid?: string;
  updatedAt?: unknown;
}

export type PaymentRequestStatus = 'pending' | 'approved' | 'rejected';

export interface PaymentRequest {
  id: string;
  userUid: string;
  userEmail: string;
  userName: string;
  amountInr: number;
  utrNumber: string;
  status: PaymentRequestStatus;
  adminNote: string;
  createdAt?: { seconds: number; nanoseconds: number } | Date | null;
  updatedAt?: { seconds: number; nanoseconds: number } | Date | null;
}

export interface StorageSummary {
  driver: string;
  storageRoot: string;
  totalAssets: number;
  totalDownloads: number;
  totalStorageBytes: number;
  freeAssetsCount: number;
  premiumAssetsCount: number;
  downloadsByAsset: Record<string, number>;
}

export const DEFAULT_CATEGORIES: Omit<Category, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'motion-graphics',
    name: 'Motion Graphics',
    slug: 'motion-graphics',
    description: 'Broadcast loops, HUD elements, kinetic typography, and 3D motion plates.',
    sortOrder: 1,
  },
  {
    id: 'green-screen',
    name: 'Green Screen',
    slug: 'green-screen',
    description: 'Clean chroma-key plates, studio talent actions, and practical FX keying footage.',
    sortOrder: 2,
  },
  {
    id: 'png',
    name: 'PNG',
    slug: 'png',
    description: 'Lossless alpha-channel cutouts, UI elements, props, and editorial cutouts.',
    sortOrder: 3,
  },
  {
    id: 'overlays',
    name: 'Overlays',
    slug: 'overlays',
    description: 'Film grain, anamorphic flares, dust textures, and compositing blend layers.',
    sortOrder: 4,
  },
  {
    id: 'transitions',
    name: 'Transitions',
    slug: 'transitions',
    description: 'Matte wipes, whip pans, optical burns, and frame-accurate cut transitions.',
    sortOrder: 5,
  },
  {
    id: 'infographics',
    name: 'Infographics',
    slug: 'infographics',
    description: 'Modular charts, vector diagrams, callout templates, and data motion kits.',
    sortOrder: 6,
  },
  {
    id: 'sound-effects',
    name: 'Sound Effects',
    slug: 'sound-effects',
    description: 'Uncompressed 24-bit WAV risers, impacts, foley textures, and UI audio.',
    sortOrder: 7,
  },
  {
    id: 'backgrounds',
    name: 'Backgrounds',
    slug: 'backgrounds',
    description: 'High-resolution architectural plates, gradients, and seamless loop backdrops.',
    sortOrder: 8,
  },
];
