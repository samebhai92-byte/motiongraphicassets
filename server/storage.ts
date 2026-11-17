import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export type AssetTier = 'free' | 'premium';

export interface StoredAssetEntry {
  assetId: string;
  tier: AssetTier;
  storageKey: string;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  sha256: string;
  thumbnailKey: string | null;
  previewKey: string | null;
  published: boolean;
  downloadsCount: number;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface StoredGrantEntry {
  id: string;
  label: string;
  grantType: 'email' | 'code';
  granteeEmail: string;
  accessCodeHash: string;
  active: boolean;
  expiresAtIso: string;
}

export interface PaymentSettingsData {
  priceInr: number;
  upiId: string;
  qrKey: string | null;
  qrCodeUrl: string;
}

export interface ManifestData {
  assets: Record<string, StoredAssetEntry>;
  grants: Record<string, StoredGrantEntry>;
  paymentSettings: PaymentSettingsData;
}

const STORAGE_ROOT = path.resolve(process.cwd(), process.env.STORAGE_ROOT || './storage');
export const DIRS = {
  root: STORAGE_ROOT,
  freeOriginals: path.join(STORAGE_ROOT, 'originals', 'free'),
  privateOriginals: path.join(STORAGE_ROOT, 'originals', 'private'),
  thumbnails: path.join(STORAGE_ROOT, 'thumbnails'),
  previews: path.join(STORAGE_ROOT, 'previews'),
  qr: path.join(STORAGE_ROOT, 'qr'),
  tmp: path.join(STORAGE_ROOT, 'tmp'),
};

const MANIFEST_PATH = path.join(STORAGE_ROOT, 'manifest.json');
const SECRET_PATH = path.join(STORAGE_ROOT, '.signing-secret');

export function ensureStorageDirectories(): void {
  Object.values(DIRS).forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

function getSigningSecret(): string {
  if (process.env.DOWNLOAD_SIGNING_SECRET && process.env.DOWNLOAD_SIGNING_SECRET.length >= 16) {
    return process.env.DOWNLOAD_SIGNING_SECRET;
  }
  ensureStorageDirectories();
  if (fs.existsSync(SECRET_PATH)) {
    return fs.readFileSync(SECRET_PATH, 'utf-8').trim();
  }
  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_PATH, generated, { mode: 0o600 });
  return generated;
}

const DEFAULT_PAYMENT_SETTINGS: PaymentSettingsData = {
  priceInr: 99,
  upiId: '',
  qrKey: null,
  qrCodeUrl: '',
};

export function readManifest(): ManifestData {
  ensureStorageDirectories();
  if (!fs.existsSync(MANIFEST_PATH)) {
    const empty: ManifestData = {
      assets: {},
      grants: {},
      paymentSettings: { ...DEFAULT_PAYMENT_SETTINGS },
    };
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(empty, null, 2));
    return empty;
  }
  try {
    const raw = fs.readFileSync(MANIFEST_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<ManifestData>;
    const ps = parsed.paymentSettings;
    return {
      assets: parsed.assets && typeof parsed.assets === 'object' ? parsed.assets : {},
      grants: parsed.grants && typeof parsed.grants === 'object' ? parsed.grants : {},
      paymentSettings:
        ps && typeof ps === 'object'
          ? {
              priceInr:
                typeof ps.priceInr === 'number' && ps.priceInr >= 1 ? ps.priceInr : 99,
              upiId: typeof ps.upiId === 'string' ? ps.upiId : '',
              qrKey: typeof ps.qrKey === 'string' ? ps.qrKey : null,
              qrCodeUrl: typeof ps.qrCodeUrl === 'string' ? ps.qrCodeUrl : '',
            }
          : { ...DEFAULT_PAYMENT_SETTINGS },
    };
  } catch {
    return {
      assets: {},
      grants: {},
      paymentSettings: { ...DEFAULT_PAYMENT_SETTINGS },
    };
  }
}

export function writeManifest(data: ManifestData): void {
  ensureStorageDirectories();
  const tempFile = `${MANIFEST_PATH}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
  fs.renameSync(tempFile, MANIFEST_PATH);
}

export function sanitizeBaseName(input: string): string {
  return path
    .basename(input)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 120);
}

export function assertSafeChildPath(baseDir: string, childKey: string): string {
  const safeName = path.basename(childKey);
  if (!safeName || safeName !== childKey || safeName.includes('..')) {
    throw new Error('Invalid storage key');
  }
  const resolved = path.resolve(baseDir, safeName);
  if (!resolved.startsWith(path.resolve(baseDir) + path.sep)) {
    throw new Error('Path traversal blocked');
  }
  return resolved;
}

export function getOriginalDirectory(tier: AssetTier): string {
  return tier === 'premium' ? DIRS.privateOriginals : DIRS.freeOriginals;
}

export function resolveOriginalFilePath(entry: StoredAssetEntry): string {
  return assertSafeChildPath(getOriginalDirectory(entry.tier), entry.storageKey);
}

export function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

export function hashAccessCode(code: string): string {
  return crypto.createHash('sha256').update(code.trim()).digest('hex');
}

export interface TempDownloadTokenPayload {
  assetId: string;
  exp: number;
  nonce: string;
}

export function signTempDownloadToken(
  assetId: string,
  ttlSeconds = 180
): { token: string; expiresAt: number } {
  const secret = getSigningSecret();
  const expiresAt = Date.now() + ttlSeconds * 1000;
  const payload: TempDownloadTokenPayload = {
    assetId,
    exp: expiresAt,
    nonce: crypto.randomBytes(8).toString('hex'),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url');

  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt,
  };
}

export function verifyTempDownloadToken(token: string): TempDownloadTokenPayload | null {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [encodedPayload, providedSig] = parts;
  if (!encodedPayload || !providedSig) {
    return null;
  }

  const secret = getSigningSecret();
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url');

  const providedBuf = Buffer.from(providedSig);
  const expectedBuf = Buffer.from(expectedSig);
  if (providedBuf.length !== expectedBuf.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf-8')
    ) as TempDownloadTokenPayload;

    if (
      typeof decoded.assetId !== 'string' ||
      typeof decoded.exp !== 'number' ||
      Date.now() > decoded.exp
    ) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

export function getStorageSummary() {
  const manifest = readManifest();
  const entries = Object.values(manifest.assets);
  const totalBytes = entries.reduce((acc, item) => acc + (item.fileSizeBytes || 0), 0);
  const totalDownloads = entries.reduce((acc, item) => acc + (item.downloadsCount || 0), 0);
  const freeCount = entries.filter((item) => item.tier === 'free').length;
  const premiumCount = entries.filter((item) => item.tier === 'premium').length;
  const downloadsByAsset: Record<string, number> = {};
  for (const entry of entries) {
    downloadsByAsset[entry.assetId] = entry.downloadsCount || 0;
  }

  return {
    driver: 'local',
    storageRoot: STORAGE_ROOT,
    totalAssets: entries.length,
    totalDownloads,
    totalStorageBytes: totalBytes,
    freeAssetsCount: freeCount,
    premiumAssetsCount: premiumCount,
    downloadsByAsset,
  };
}
