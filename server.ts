import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import express from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import {
  ADMIN_EMAIL,
  isAdminUser,
  requireAdmin,
  verifyBearerToken,
  type AuthenticatedRequest,
} from './server/auth.ts';
import {
  DIRS,
  assertSafeChildPath,
  computeFileSha256,
  ensureStorageDirectories,
  getOriginalDirectory,
  getStorageSummary,
  hashAccessCode,
  readManifest,
  resolveOriginalFilePath,
  sanitizeBaseName,
  signTempDownloadToken,
  verifyTempDownloadToken,
  writeManifest,
  type AssetTier,
  type StoredAssetEntry,
  type StoredGrantEntry,
} from './server/storage.ts';

ensureStorageDirectories();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureStorageDirectories();
      cb(null, DIRS.tmp);
    },
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${sanitizeBaseName(
        file.originalname
      )}`;
      cb(null, unique);
    },
  }),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500 MB max per file
  },
});

function removeFileQuietly(filePath: string | null | undefined): void {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Ignore cleanup errors
  }
}

function streamUncompressedOriginal(
  req: Request,
  res: Response,
  filePath: string,
  originalFileName: string,
  mimeType: string,
  fileSizeBytes: number
): void {
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Original asset file could not be located on storage.' });
    return;
  }

  const stat = fs.statSync(filePath);
  const actualSize = stat.size || fileSizeBytes;
  const encodedFileName = encodeURIComponent(originalFileName).replace(/['()]/g, escape);

  res.setHeader('Content-Type', mimeType || 'application/octet-stream');
  res.setHeader('Content-Length', String(actualSize));
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${originalFileName.replace(/"/g, '')}"; filename*=UTF-8''${encodedFileName}`
  );
  // Prevent proxies from compressing or transforming original binary bytes
  res.setHeader('Cache-Control', 'no-store, no-transform');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed while streaming original file.' });
    }
  });
  req.on('close', () => {
    stream.destroy();
  });
  stream.pipe(res);
}

function streamMediaWithRanges(
  req: Request,
  res: Response,
  filePath: string,
  contentType: string
): void {
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Preview media not found.' });
    return;
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=3600, no-transform');

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= fileSize) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
      return;
    }
    const chunkSize = end - start + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', String(chunkSize));
    fs.createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.setHeader('Content-Length', String(fileSize));
  fs.createReadStream(filePath).pipe(res);
}

function guessMediaMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
    '.m4a': 'audio/mp4',
  };
  return map[ext] || 'application/octet-stream';
}

function isGrantValid(grant: StoredGrantEntry): boolean {
  if (!grant.active) return false;
  if (grant.expiresAtIso) {
    const exp = Date.parse(grant.expiresAtIso);
    if (!Number.isNaN(exp) && Date.now() > exp) {
      return false;
    }
  }
  return true;
}

async function createServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

  // Health & public stats
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      storageDriver: 'local',
      adminConfigured: Boolean(ADMIN_EMAIL),
    });
  });

  app.get('/api/assets/stats', (_req, res) => {
    const summary = getStorageSummary();
    res.json({
      downloadsByAsset: summary.downloadsByAsset,
      totalDownloads: summary.totalDownloads,
    });
  });

  app.get('/api/me/access', async (req, res) => {
    const user = await verifyBearerToken(req);
    if (!user || !user.email || !user.emailVerified) {
      res.json({ signedIn: false, hasPremium: false, grantLabel: null });
      return;
    }

    if (isAdminUser(user)) {
      res.json({
        signedIn: true,
        email: user.email,
        hasPremium: true,
        grantLabel: 'Full Studio Access',
      });
      return;
    }

    const manifest = readManifest();
    const normalizedEmail = user.email.trim().toLowerCase();
    const match = Object.values(manifest.grants).find(
      (g) =>
        g.grantType === 'email' &&
        g.granteeEmail.trim().toLowerCase() === normalizedEmail &&
        isGrantValid(g)
    );

    res.json({
      signedIn: true,
      email: user.email,
      hasPremium: Boolean(match),
      grantLabel: match ? match.label : null,
    });
  });

  app.post('/api/grants/verify-code', (req, res) => {
    const code = typeof req.body?.accessCode === 'string' ? req.body.accessCode.trim() : '';
    if (!code) {
      res.status(400).json({ valid: false, error: 'Please enter an access code.' });
      return;
    }

    const codeHash = hashAccessCode(code);
    const manifest = readManifest();
    const match = Object.values(manifest.grants).find(
      (g) => g.grantType === 'code' && g.accessCodeHash === codeHash && isGrantValid(g)
    );

    if (!match) {
      res.status(403).json({ valid: false, error: 'Invalid or expired access code.' });
      return;
    }

    res.json({
      valid: true,
      label: match.label,
      expiresAtIso: match.expiresAtIso || '',
    });
  });

  // Public payment config & UPI QR image route
  app.get('/api/payment/config', (_req, res) => {
    const manifest = readManifest();
    res.json({
      priceInr: manifest.paymentSettings.priceInr || 99,
      upiId: manifest.paymentSettings.upiId || '',
      qrCodeUrl: manifest.paymentSettings.qrCodeUrl || '',
    });
  });

  app.get('/api/media/qr/:filename', (req, res) => {
    try {
      const targetPath = assertSafeChildPath(DIRS.qr, req.params.filename);
      if (!fs.existsSync(targetPath)) {
        res.status(404).json({ error: 'QR image not found' });
        return;
      }
      res.setHeader('Content-Type', guessMediaMimeType(req.params.filename));
      res.setHeader('Cache-Control', 'public, max-age=3600, no-transform');
      fs.createReadStream(targetPath).pipe(res);
    } catch {
      res.status(400).json({ error: 'Invalid QR path' });
    }
  });

  // Public media routes (thumbnails & previews only — NEVER private original files)
  app.get('/api/media/thumbnail/:filename', (req, res) => {
    try {
      const targetPath = assertSafeChildPath(DIRS.thumbnails, req.params.filename);
      if (!fs.existsSync(targetPath)) {
        res.status(404).json({ error: 'Thumbnail not found' });
        return;
      }
      res.setHeader('Content-Type', guessMediaMimeType(req.params.filename));
      res.setHeader('Cache-Control', 'public, max-age=86400, no-transform');
      fs.createReadStream(targetPath).pipe(res);
    } catch {
      res.status(400).json({ error: 'Invalid thumbnail path' });
    }
  });

  app.get('/api/media/preview/:filename', (req, res) => {
    try {
      const targetPath = assertSafeChildPath(DIRS.previews, req.params.filename);
      streamMediaWithRanges(req, res, targetPath, guessMediaMimeType(req.params.filename));
    } catch {
      res.status(400).json({ error: 'Invalid preview path' });
    }
  });

  // Public download permission & temporary signed URL generator
  app.post('/api/assets/:id/request-download', async (req, res) => {
    const assetId = req.params.id;
    const manifest = readManifest();
    const entry = manifest.assets[assetId];

    if (!entry) {
      res.status(404).json({ error: 'Asset not found in storage manifest.' });
      return;
    }

    const user = await verifyBearerToken(req);
    const isAdmin = isAdminUser(user);

    if (!entry.published && !isAdmin) {
      res.status(403).json({ error: 'This asset is not publicly available.' });
      return;
    }

    if (entry.tier === 'free') {
      res.json({
        mode: 'direct',
        downloadUrl: `/api/assets/${encodeURIComponent(assetId)}/download`,
        fileName: entry.originalFileName,
        fileSizeBytes: entry.fileSizeBytes,
      });
      return;
    }

    // Premium file: strict server-side permission checks required
    let authorized = isAdmin;

    if (!authorized && user && user.email && user.emailVerified) {
      const normalizedEmail = user.email.trim().toLowerCase();
      const matchingEmailGrant = Object.values(manifest.grants).find(
        (g) =>
          g.grantType === 'email' &&
          g.granteeEmail.trim().toLowerCase() === normalizedEmail &&
          isGrantValid(g)
      );
      if (matchingEmailGrant) {
        authorized = true;
      }
    }

    const accessCode =
      typeof req.body?.accessCode === 'string' ? req.body.accessCode.trim() : '';
    if (!authorized && accessCode.length > 0) {
      const codeHash = hashAccessCode(accessCode);
      const matchingCodeGrant = Object.values(manifest.grants).find(
        (g) => g.grantType === 'code' && g.accessCodeHash === codeHash && isGrantValid(g)
      );
      if (matchingCodeGrant) {
        authorized = true;
      }
    }

    if (!authorized) {
      res.status(403).json({
        error:
          'Premium asset access required. Sign in with an authorized Google account or provide a valid Premium Access Code.',
        requiresPremiumAccess: true,
      });
      return;
    }

    const ttlSeconds = 180;
    const { token, expiresAt } = signTempDownloadToken(assetId, ttlSeconds);
    res.json({
      mode: 'signed_temporary',
      downloadUrl: `/api/download/temp?token=${encodeURIComponent(token)}`,
      expiresAt,
      expiresInSeconds: ttlSeconds,
      fileName: entry.originalFileName,
      fileSizeBytes: entry.fileSizeBytes,
    });
  });

  // Direct Free original file download (rejects Premium assets)
  app.get('/api/assets/:id/download', async (req, res) => {
    const assetId = req.params.id;
    const manifest = readManifest();
    const entry = manifest.assets[assetId];

    if (!entry) {
      res.status(404).json({ error: 'Asset not found.' });
      return;
    }

    if (entry.tier === 'premium') {
      res.status(403).json({
        error: 'Premium files are private and require a server-signed temporary download link.',
      });
      return;
    }

    if (!entry.published) {
      const user = await verifyBearerToken(req);
      if (!isAdminUser(user)) {
        res.status(403).json({ error: 'Asset is not published.' });
        return;
      }
    }

    let filePath: string;
    try {
      filePath = resolveOriginalFilePath(entry);
    } catch {
      res.status(400).json({ error: 'Invalid asset storage reference.' });
      return;
    }

    entry.downloadsCount = (entry.downloadsCount || 0) + 1;
    entry.updatedAtIso = new Date().toISOString();
    manifest.assets[assetId] = entry;
    writeManifest(manifest);

    streamUncompressedOriginal(
      req,
      res,
      filePath,
      entry.originalFileName,
      entry.mimeType,
      entry.fileSizeBytes
    );
  });

  // Temporary signed download route for Private Premium assets
  app.get('/api/download/temp', (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const decoded = verifyTempDownloadToken(token);
    if (!decoded) {
      res.status(403).json({
        error: 'Temporary download link is invalid or has expired.',
      });
      return;
    }

    const manifest = readManifest();
    const entry = manifest.assets[decoded.assetId];
    if (!entry) {
      res.status(404).json({ error: 'Referenced asset no longer exists.' });
      return;
    }

    let filePath: string;
    try {
      filePath = resolveOriginalFilePath(entry);
    } catch {
      res.status(400).json({ error: 'Invalid private storage key.' });
      return;
    }

    entry.downloadsCount = (entry.downloadsCount || 0) + 1;
    entry.updatedAtIso = new Date().toISOString();
    manifest.assets[decoded.assetId] = entry;
    writeManifest(manifest);

    streamUncompressedOriginal(
      req,
      res,
      filePath,
      entry.originalFileName,
      entry.mimeType,
      entry.fileSizeBytes
    );
  });

  // =========================================================================
  // ADMIN-ONLY ENDPOINTS (Server-verified single administrator account)
  // =========================================================================

  app.get('/api/admin/verify', requireAdmin, (req: AuthenticatedRequest, res) => {
    const summary = getStorageSummary();
    res.json({
      authorized: true,
      email: req.authUser?.email,
      uid: req.authUser?.uid,
      storage: summary,
    });
  });

  app.get('/api/admin/stats', requireAdmin, (_req, res) => {
    res.json(getStorageSummary());
  });

  app.post(
    '/api/admin/upload',
    requireAdmin,
    upload.fields([
      { name: 'originalFile', maxCount: 1 },
      { name: 'thumbnailFile', maxCount: 1 },
      { name: 'previewFile', maxCount: 1 },
    ]),
    async (req, res) => {
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const original = files?.originalFile?.[0];
      const thumbnail = files?.thumbnailFile?.[0];
      const preview = files?.previewFile?.[0];

      if (!original) {
        res.status(400).json({ error: 'Original asset file is required.' });
        return;
      }

      try {
        const requestedAssetId =
          typeof req.body?.assetId === 'string' && /^[a-zA-Z0-9_-]{3,128}$/.test(req.body.assetId)
            ? req.body.assetId
            : `asset_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

        const tier: AssetTier = req.body?.tier === 'premium' ? 'premium' : 'free';
        const published = req.body?.published !== 'false';

        const safeOriginalName = sanitizeBaseName(original.originalname || 'asset.bin');
        const storageKey = `${requestedAssetId}_${crypto.randomBytes(4).toString('hex')}_${safeOriginalName}`;
        const destOriginalPath = assertSafeChildPath(getOriginalDirectory(tier), storageKey);

        // Move exact unmodified original file (no compression, no re-encoding)
        fs.renameSync(original.path, destOriginalPath);
        const stat = fs.statSync(destOriginalPath);
        const sha256 = await computeFileSha256(destOriginalPath);

        let thumbnailKey: string | null = null;
        if (thumbnail) {
          const safeThumbName = sanitizeBaseName(thumbnail.originalname || 'thumb.jpg');
          thumbnailKey = `${requestedAssetId}_thumb_${crypto.randomBytes(4).toString('hex')}_${safeThumbName}`;
          const destThumbPath = assertSafeChildPath(DIRS.thumbnails, thumbnailKey);
          fs.renameSync(thumbnail.path, destThumbPath);
        }

        let previewKey: string | null = null;
        if (preview) {
          const safePreviewName = sanitizeBaseName(preview.originalname || 'preview.mp4');
          previewKey = `${requestedAssetId}_preview_${crypto.randomBytes(4).toString('hex')}_${safePreviewName}`;
          const destPreviewPath = assertSafeChildPath(DIRS.previews, previewKey);
          fs.renameSync(preview.path, destPreviewPath);
        }

        const nowIso = new Date().toISOString();
        const manifest = readManifest();
        const existingEntry = manifest.assets[requestedAssetId];

        const entry: StoredAssetEntry = {
          assetId: requestedAssetId,
          tier,
          storageKey,
          originalFileName: original.originalname || safeOriginalName,
          mimeType: original.mimetype || 'application/octet-stream',
          fileSizeBytes: stat.size,
          sha256,
          thumbnailKey,
          previewKey,
          published,
          downloadsCount: existingEntry?.downloadsCount || 0,
          createdAtIso: existingEntry?.createdAtIso || nowIso,
          updatedAtIso: nowIso,
        };

        manifest.assets[requestedAssetId] = entry;
        writeManifest(manifest);

        res.status(201).json({
          assetId: requestedAssetId,
          tier,
          storageKey,
          sha256,
          originalFileName: entry.originalFileName,
          mimeType: entry.mimeType,
          fileSizeBytes: entry.fileSizeBytes,
          thumbnailUrl: thumbnailKey ? `/api/media/thumbnail/${encodeURIComponent(thumbnailKey)}` : '',
          previewMediaUrl: previewKey ? `/api/media/preview/${encodeURIComponent(previewKey)}` : '',
        });
      } catch (err) {
        removeFileQuietly(original?.path);
        removeFileQuietly(thumbnail?.path);
        removeFileQuietly(preview?.path);
        const message = err instanceof Error ? err.message : 'Upload processing failed';
        res.status(500).json({ error: message });
      }
    }
  );

  app.put(
    '/api/admin/assets/:id/storage',
    requireAdmin,
    upload.fields([
      { name: 'originalFile', maxCount: 1 },
      { name: 'thumbnailFile', maxCount: 1 },
      { name: 'previewFile', maxCount: 1 },
    ]),
    async (req, res) => {
      const assetId = req.params.id;
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const original = files?.originalFile?.[0];
      const thumbnail = files?.thumbnailFile?.[0];
      const preview = files?.previewFile?.[0];

      const manifest = readManifest();
      const entry = manifest.assets[assetId];
      if (!entry) {
        removeFileQuietly(original?.path);
        removeFileQuietly(thumbnail?.path);
        removeFileQuietly(preview?.path);
        res.status(404).json({ error: 'Asset storage entry not found.' });
        return;
      }

      try {
        const nextTier: AssetTier =
          req.body?.tier === 'premium'
            ? 'premium'
            : req.body?.tier === 'free'
            ? 'free'
            : entry.tier;
        const nextPublished =
          typeof req.body?.published === 'string'
            ? req.body.published !== 'false'
            : typeof req.body?.published === 'boolean'
            ? req.body.published
            : entry.published;

        // If replacing original file
        if (original) {
          const oldPath = resolveOriginalFilePath(entry);
          const safeOriginalName = sanitizeBaseName(original.originalname || 'asset.bin');
          const newStorageKey = `${assetId}_${crypto.randomBytes(4).toString('hex')}_${safeOriginalName}`;
          const destPath = assertSafeChildPath(getOriginalDirectory(nextTier), newStorageKey);
          fs.renameSync(original.path, destPath);
          const stat = fs.statSync(destPath);
          const sha256 = await computeFileSha256(destPath);

          removeFileQuietly(oldPath);
          entry.storageKey = newStorageKey;
          entry.originalFileName = original.originalname || safeOriginalName;
          entry.mimeType = original.mimetype || 'application/octet-stream';
          entry.fileSizeBytes = stat.size;
          entry.sha256 = sha256;
          entry.tier = nextTier;
        } else if (nextTier !== entry.tier) {
          // Move existing original file cleanly between free and private folders
          const oldPath = resolveOriginalFilePath(entry);
          const newPath = assertSafeChildPath(getOriginalDirectory(nextTier), entry.storageKey);
          if (fs.existsSync(oldPath)) {
            fs.renameSync(oldPath, newPath);
          }
          entry.tier = nextTier;
        }

        if (thumbnail) {
          if (entry.thumbnailKey) {
            removeFileQuietly(assertSafeChildPath(DIRS.thumbnails, entry.thumbnailKey));
          }
          const safeThumbName = sanitizeBaseName(thumbnail.originalname || 'thumb.jpg');
          const thumbKey = `${assetId}_thumb_${crypto.randomBytes(4).toString('hex')}_${safeThumbName}`;
          fs.renameSync(thumbnail.path, assertSafeChildPath(DIRS.thumbnails, thumbKey));
          entry.thumbnailKey = thumbKey;
        }

        if (preview) {
          if (entry.previewKey) {
            removeFileQuietly(assertSafeChildPath(DIRS.previews, entry.previewKey));
          }
          const safePreviewName = sanitizeBaseName(preview.originalname || 'preview.mp4');
          const prevKey = `${assetId}_preview_${crypto.randomBytes(4).toString('hex')}_${safePreviewName}`;
          fs.renameSync(preview.path, assertSafeChildPath(DIRS.previews, prevKey));
          entry.previewKey = prevKey;
        }

        entry.published = nextPublished;
        entry.updatedAtIso = new Date().toISOString();
        manifest.assets[assetId] = entry;
        writeManifest(manifest);

        res.json({
          assetId,
          tier: entry.tier,
          storageKey: entry.storageKey,
          sha256: entry.sha256,
          originalFileName: entry.originalFileName,
          mimeType: entry.mimeType,
          fileSizeBytes: entry.fileSizeBytes,
          thumbnailUrl: entry.thumbnailKey
            ? `/api/media/thumbnail/${encodeURIComponent(entry.thumbnailKey)}`
            : '',
          previewMediaUrl: entry.previewKey
            ? `/api/media/preview/${encodeURIComponent(entry.previewKey)}`
            : '',
        });
      } catch (err) {
        removeFileQuietly(original?.path);
        removeFileQuietly(thumbnail?.path);
        removeFileQuietly(preview?.path);
        const message = err instanceof Error ? err.message : 'Storage update failed';
        res.status(500).json({ error: message });
      }
    }
  );

  app.delete('/api/admin/assets/:id/storage', requireAdmin, (req, res) => {
    const assetId = req.params.id;
    const manifest = readManifest();
    const entry = manifest.assets[assetId];

    if (entry) {
      try {
        removeFileQuietly(resolveOriginalFilePath(entry));
      } catch {
        // ignore
      }
      if (entry.thumbnailKey) {
        try {
          removeFileQuietly(assertSafeChildPath(DIRS.thumbnails, entry.thumbnailKey));
        } catch {
          // ignore
        }
      }
      if (entry.previewKey) {
        try {
          removeFileQuietly(assertSafeChildPath(DIRS.previews, entry.previewKey));
        } catch {
          // ignore
        }
      }
      delete manifest.assets[assetId];
      writeManifest(manifest);
    }

    res.json({ deleted: true, assetId });
  });

  // Premium Grants sync & code hashing
  app.post('/api/admin/grants', requireAdmin, (req, res) => {
    const grantType = req.body?.grantType === 'code' ? 'code' : 'email';
    const label = typeof req.body?.label === 'string' ? req.body.label.trim().slice(0, 100) : '';
    const granteeEmail =
      typeof req.body?.granteeEmail === 'string' ? req.body.granteeEmail.trim().toLowerCase() : '';
    const plainCode = typeof req.body?.accessCode === 'string' ? req.body.accessCode.trim() : '';
    const expiresAtIso =
      typeof req.body?.expiresAtIso === 'string' ? req.body.expiresAtIso.trim() : '';
    const active = req.body?.active !== false;

    if (!label) {
      res.status(400).json({ error: 'Grant label is required.' });
      return;
    }
    if (grantType === 'email' && !granteeEmail) {
      res.status(400).json({ error: 'Grantee Google email is required for email grants.' });
      return;
    }
    if (grantType === 'code' && plainCode.length < 4) {
      res.status(400).json({ error: 'Access code must be at least 4 characters.' });
      return;
    }

    const id =
      typeof req.body?.id === 'string' && /^[a-zA-Z0-9_-]{3,128}$/.test(req.body.id)
        ? req.body.id
        : `grant_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const accessCodeHash = grantType === 'code' ? hashAccessCode(plainCode) : '';

    const manifest = readManifest();
    manifest.grants[id] = {
      id,
      label,
      grantType,
      granteeEmail: grantType === 'email' ? granteeEmail : '',
      accessCodeHash,
      active,
      expiresAtIso,
    };
    writeManifest(manifest);

    res.status(201).json({
      id,
      label,
      grantType,
      granteeEmail: grantType === 'email' ? granteeEmail : '',
      accessCodeHash,
      active,
      expiresAtIso,
    });
  });

  app.patch('/api/admin/grants/:id', requireAdmin, (req, res) => {
    const manifest = readManifest();
    const existingGrant = manifest.grants[req.params.id];
    if (existingGrant && typeof req.body?.active === 'boolean') {
      existingGrant.active = req.body.active;
      manifest.grants[req.params.id] = existingGrant;
      writeManifest(manifest);
    }
    res.json({ updated: true, id: req.params.id });
  });

  app.delete('/api/admin/grants/:id', requireAdmin, (req, res) => {
    const manifest = readManifest();
    delete manifest.grants[req.params.id];
    writeManifest(manifest);
    res.json({ deleted: true, id: req.params.id });
  });

  app.post('/api/admin/sync-grants', requireAdmin, (req, res) => {
    const incomingGrants = Array.isArray(req.body?.grants) ? req.body.grants : [];
    const manifest = readManifest();
    const nextGrants: Record<string, StoredGrantEntry> = {};

    for (const g of incomingGrants) {
      if (g && typeof g.id === 'string') {
        nextGrants[g.id] = {
          id: g.id,
          label: String(g.label || ''),
          grantType: g.grantType === 'code' ? 'code' : 'email',
          granteeEmail: String(g.granteeEmail || ''),
          accessCodeHash: String(g.accessCodeHash || ''),
          active: Boolean(g.active),
          expiresAtIso: String(g.expiresAtIso || ''),
        };
      }
    }

    manifest.grants = nextGrants;
    writeManifest(manifest);
    res.json({ synced: Object.keys(nextGrants).length });
  });

  app.post(
    '/api/admin/payment-settings',
    requireAdmin,
    upload.single('qrFile'),
    (req, res) => {
      const qrFile = req.file;
      try {
        const manifest = readManifest();
        const prev = manifest.paymentSettings;

        const parsedPrice = Number(req.body?.priceInr);
        const priceInr =
          Number.isFinite(parsedPrice) && parsedPrice >= 1 && parsedPrice <= 100000
            ? Math.round(parsedPrice)
            : prev.priceInr || 99;
        const upiId =
          typeof req.body?.upiId === 'string'
            ? req.body.upiId.trim().slice(0, 120)
            : prev.upiId;
        const removeQr = req.body?.removeQr === 'true';

        let qrKey = prev.qrKey;
        let qrCodeUrl = prev.qrCodeUrl;

        if (removeQr && qrKey) {
          try {
            removeFileQuietly(assertSafeChildPath(DIRS.qr, qrKey));
          } catch {
            // ignore
          }
          qrKey = null;
          qrCodeUrl = '';
        }

        if (qrFile) {
          if (qrKey) {
            try {
              removeFileQuietly(assertSafeChildPath(DIRS.qr, qrKey));
            } catch {
              // ignore
            }
          }
          const safeQrName = sanitizeBaseName(qrFile.originalname || 'upi_qr.png');
          qrKey = `upi_qr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${safeQrName}`;
          const destQrPath = assertSafeChildPath(DIRS.qr, qrKey);
          fs.renameSync(qrFile.path, destQrPath);
          qrCodeUrl = `/api/media/qr/${encodeURIComponent(qrKey)}`;
        }

        manifest.paymentSettings = {
          priceInr,
          upiId,
          qrKey,
          qrCodeUrl,
        };
        writeManifest(manifest);

        res.json({
          priceInr,
          upiId,
          qrCodeUrl,
        });
      } catch (err) {
        removeFileQuietly(qrFile?.path);
        const msg = err instanceof Error ? err.message : 'Failed to save payment settings.';
        res.status(500).json({ error: msg });
      }
    }
  );

  // Vite dev middleware vs static production serving
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ASSET HUB server listening on http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start ASSET HUB server:', err);
  process.exit(1);
});
