import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { slugify } from './format';
import {
  DEFAULT_CATEGORIES,
  type AssetItem,
  type AssetTier,
  type Category,
  type PaymentRequest,
  type PaymentRequestStatus,
  type PaymentSettings,
  type PremiumGrant,
  type PreviewMediaType,
} from '../types';

export function subscribePublicCategories(
  onData: (categories: Category[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'categories';
  const q = query(collection(db, path), orderBy('sortOrder', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      const items: Category[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: String(data.name || ''),
          slug: String(data.slug || d.id),
          description: String(data.description || ''),
          sortOrder: Number(data.sortOrder || 0),
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };
      });
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribePublicAssets(
  onData: (assets: AssetItem[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'assets';
  const q = query(collection(db, path), where('published', '==', true));
  return onSnapshot(
    q,
    (snap) => {
      const items: AssetItem[] = snap.docs.map((d) => mapAssetDoc(d.id, d.data()));
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeSinglePublicAsset(
  assetId: string,
  onData: (asset: AssetItem | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = `assets/${assetId}`;
  return onSnapshot(
    doc(db, 'assets', assetId),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(mapAssetDoc(snap.id, snap.data()));
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export function subscribeAdminAssets(
  onData: (assets: AssetItem[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'assets';
  return onSnapshot(
    collection(db, path),
    (snap) => {
      const items: AssetItem[] = snap.docs.map((d) => mapAssetDoc(d.id, d.data()));
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeAdminGrants(
  onData: (grants: PremiumGrant[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'premium_grants';
  return onSnapshot(
    collection(db, path),
    (snap) => {
      const items: PremiumGrant[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          label: String(data.label || ''),
          grantType: data.grantType === 'code' ? 'code' : 'email',
          granteeEmail: String(data.granteeEmail || ''),
          accessCodeHash: String(data.accessCodeHash || ''),
          active: Boolean(data.active),
          expiresAtIso: String(data.expiresAtIso || ''),
          createdByUid: String(data.createdByUid || ''),
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };
      });
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

function mapAssetDoc(id: string, data: Record<string, unknown>): AssetItem {
  return {
    id,
    title: String(data.title || ''),
    slug: String(data.slug || id),
    description: String(data.description || ''),
    categoryId: String(data.categoryId || ''),
    categoryName: String(data.categoryName || ''),
    tags: Array.isArray(data.tags) ? data.tags.map((t) => String(t)).slice(0, 15) : [],
    tier: data.tier === 'premium' ? 'premium' : 'free',
    fileFormat: String(data.fileFormat || ''),
    resolution: String(data.resolution || ''),
    fileSizeBytes: Number(data.fileSizeBytes || 0),
    originalFileName: String(data.originalFileName || ''),
    mimeType: String(data.mimeType || 'application/octet-stream'),
    thumbnailUrl: String(data.thumbnailUrl || ''),
    previewMediaType:
      data.previewMediaType === 'video' || data.previewMediaType === 'audio'
        ? data.previewMediaType
        : 'image',
    previewMediaUrl: String(data.previewMediaUrl || ''),
    downloadsCount: Number(data.downloadsCount || 0),
    published: Boolean(data.published),
    authorUid: String(data.authorUid || ''),
    createdAt: (data.createdAt as AssetItem['createdAt']) || null,
    updatedAt: (data.updatedAt as AssetItem['updatedAt']) || null,
  };
}

export async function ensureDefaultCategoriesInFirestore(): Promise<void> {
  const path = 'categories';
  try {
    const snap = await getDocs(collection(db, path));
    if (!snap.empty) return;

    for (const cat of DEFAULT_CATEGORIES) {
      await setDoc(doc(db, path, cat.id), {
        name: cat.name.slice(0, 80),
        slug: cat.slug.slice(0, 80),
        description: cat.description.slice(0, 300),
        sortOrder: cat.sortOrder,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveCategory(input: {
  id?: string;
  name: string;
  description: string;
  sortOrder: number;
}): Promise<string> {
  const cleanName = input.name.trim().slice(0, 80);
  const cleanSlug = slugify(cleanName).slice(0, 80);
  const id = input.id || cleanSlug;
  const path = `categories/${id}`;

  try {
    if (input.id) {
      await updateDoc(doc(db, 'categories', id), {
        name: cleanName,
        slug: cleanSlug,
        description: input.description.trim().slice(0, 300),
        sortOrder: Math.max(0, Math.min(10000, Math.round(input.sortOrder))),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'categories', id), {
        name: cleanName,
        slug: cleanSlug,
        description: input.description.trim().slice(0, 300),
        sortOrder: Math.max(0, Math.min(10000, Math.round(input.sortOrder))),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteCategoryById(id: string): Promise<void> {
  const path = `categories/${id}`;
  try {
    await deleteDoc(doc(db, 'categories', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export interface UploadProgressState {
  percent: number;
  loadedBytes: number;
  totalBytes: number;
  stage: 'uploading' | 'saving_metadata' | 'complete';
}

export interface CreateAssetInput {
  title: string;
  description: string;
  categoryId: string;
  categoryName: string;
  tags: string[];
  tier: AssetTier;
  fileFormat: string;
  resolution: string;
  previewMediaType: PreviewMediaType;
  published: boolean;
  originalFile: File;
  thumbnailFile?: File | null;
  previewFile?: File | null;
  onProgress?: (state: UploadProgressState) => void;
}

interface UploadServerResponse {
  assetId: string;
  tier: AssetTier;
  storageKey: string;
  sha256: string;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  thumbnailUrl: string;
  previewMediaUrl: string;
}

function uploadFormDataWithProgress(
  url: string,
  method: 'POST' | 'PUT',
  formData: FormData,
  token: string,
  onProgress?: (state: UploadProgressState) => void
): Promise<UploadServerResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
        onProgress({
          percent,
          loadedBytes: event.loaded,
          totalBytes: event.total,
          stage: 'uploading',
        });
      }
    };

    xhr.onload = () => {
      try {
        const parsed = JSON.parse(xhr.responseText || '{}') as UploadServerResponse & {
          error?: string;
        };
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(parsed);
        } else {
          reject(new Error(parsed.error || `Upload failed (${xhr.status})`));
        }
      } catch {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error occurred during file upload.'));
    xhr.onabort = () => reject(new Error('Upload was aborted.'));
    xhr.send(formData);
  });
}

function normalizeTags(tags: string[]): string[] {
  return Array.from(
    new Set(
      tags
        .map((t) => t.trim().slice(0, 40))
        .filter((t) => t.length > 0)
    )
  ).slice(0, 15);
}

export async function createAssetWithUpload(input: CreateAssetInput): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Administrator authentication required.');
  const token = await user.getIdToken();

  const assetId = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const formData = new FormData();
  formData.append('assetId', assetId);
  formData.append('tier', input.tier);
  formData.append('published', String(input.published));
  formData.append('originalFile', input.originalFile);
  if (input.thumbnailFile) {
    formData.append('thumbnailFile', input.thumbnailFile);
  }
  if (input.previewFile) {
    formData.append('previewFile', input.previewFile);
  }

  const uploaded = await uploadFormDataWithProgress(
    '/api/admin/upload',
    'POST',
    formData,
    token,
    input.onProgress
  );

  input.onProgress?.({
    percent: 100,
    loadedBytes: uploaded.fileSizeBytes,
    totalBytes: uploaded.fileSizeBytes,
    stage: 'saving_metadata',
  });

  const cleanTitle = input.title.trim().slice(0, 140);
  const cleanSlug = slugify(cleanTitle).slice(0, 160);
  const cleanTags = normalizeTags(input.tags);

  try {
    await setDoc(doc(db, 'assets', assetId), {
      title: cleanTitle,
      slug: cleanSlug,
      description: input.description.trim().slice(0, 2000),
      categoryId: input.categoryId,
      categoryName: input.categoryName.trim().slice(0, 80),
      tags: cleanTags,
      tier: input.tier,
      fileFormat: input.fileFormat.trim().toUpperCase().slice(0, 20) || 'FILE',
      resolution: input.resolution.trim().slice(0, 60) || 'Original',
      fileSizeBytes: uploaded.fileSizeBytes,
      originalFileName: uploaded.originalFileName.slice(0, 255),
      mimeType: uploaded.mimeType.slice(0, 120),
      thumbnailUrl: uploaded.thumbnailUrl.slice(0, 500),
      previewMediaType: input.previewMediaType,
      previewMediaUrl: uploaded.previewMediaUrl.slice(0, 500),
      downloadsCount: 0,
      published: input.published,
      authorUid: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `assets/${assetId}`);
  }

  try {
    await setDoc(doc(db, 'asset_sources', assetId), {
      assetId,
      storageKey: uploaded.storageKey.slice(0, 300),
      tier: input.tier,
      sha256: uploaded.sha256.slice(0, 128),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `asset_sources/${assetId}`);
  }

  input.onProgress?.({
    percent: 100,
    loadedBytes: uploaded.fileSizeBytes,
    totalBytes: uploaded.fileSizeBytes,
    stage: 'complete',
  });

  return assetId;
}

export interface UpdateAssetInput {
  asset: AssetItem;
  title: string;
  description: string;
  categoryId: string;
  categoryName: string;
  tags: string[];
  tier: AssetTier;
  fileFormat: string;
  resolution: string;
  previewMediaType: PreviewMediaType;
  published: boolean;
  newOriginalFile?: File | null;
  newThumbnailFile?: File | null;
  newPreviewFile?: File | null;
  onProgress?: (state: UploadProgressState) => void;
}

export async function updateAssetWithStorage(input: UpdateAssetInput): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Administrator authentication required.');
  const token = await user.getIdToken();

  const formData = new FormData();
  formData.append('tier', input.tier);
  formData.append('published', String(input.published));
  if (input.newOriginalFile) {
    formData.append('originalFile', input.newOriginalFile);
  }
  if (input.newThumbnailFile) {
    formData.append('thumbnailFile', input.newThumbnailFile);
  }
  if (input.newPreviewFile) {
    formData.append('previewFile', input.newPreviewFile);
  }

  const storageRes = await uploadFormDataWithProgress(
    `/api/admin/assets/${encodeURIComponent(input.asset.id)}/storage`,
    'PUT',
    formData,
    token,
    input.onProgress
  );

  const cleanTitle = input.title.trim().slice(0, 140);
  const cleanSlug = slugify(cleanTitle).slice(0, 160);
  const cleanTags = normalizeTags(input.tags);

  try {
    await updateDoc(doc(db, 'assets', input.asset.id), {
      title: cleanTitle,
      slug: cleanSlug,
      description: input.description.trim().slice(0, 2000),
      categoryId: input.categoryId,
      categoryName: input.categoryName.trim().slice(0, 80),
      tags: cleanTags,
      tier: input.tier,
      fileFormat: input.fileFormat.trim().toUpperCase().slice(0, 20) || 'FILE',
      resolution: input.resolution.trim().slice(0, 60) || 'Original',
      fileSizeBytes: storageRes.fileSizeBytes,
      originalFileName: storageRes.originalFileName.slice(0, 255),
      mimeType: storageRes.mimeType.slice(0, 120),
      thumbnailUrl: storageRes.thumbnailUrl.slice(0, 500),
      previewMediaType: input.previewMediaType,
      previewMediaUrl: storageRes.previewMediaUrl.slice(0, 500),
      downloadsCount: input.asset.downloadsCount,
      published: input.published,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `assets/${input.asset.id}`);
  }

  try {
    await updateDoc(doc(db, 'asset_sources', input.asset.id), {
      storageKey: storageRes.storageKey.slice(0, 300),
      tier: input.tier,
      sha256: storageRes.sha256.slice(0, 128),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `asset_sources/${input.asset.id}`);
  }
}

export async function deleteAssetCompletely(assetId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Administrator authentication required.');
  const token = await user.getIdToken();

  const res = await fetch(`/api/admin/assets/${encodeURIComponent(assetId)}/storage`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'Failed to delete server storage files.');
  }

  try {
    await deleteDoc(doc(db, 'asset_sources', assetId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `asset_sources/${assetId}`);
  }

  try {
    await deleteDoc(doc(db, 'assets', assetId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `assets/${assetId}`);
  }
}

export async function renameTagAcrossAssets(
  oldTag: string,
  newTag: string,
  assets: AssetItem[]
): Promise<number> {
  const trimmedOld = oldTag.trim();
  const trimmedNew = newTag.trim().slice(0, 40);
  if (!trimmedOld) return 0;

  let updated = 0;
  for (const asset of assets) {
    if (!asset.tags.includes(trimmedOld)) continue;
    const nextTags = normalizeTags(
      trimmedNew
        ? asset.tags.map((t) => (t === trimmedOld ? trimmedNew : t))
        : asset.tags.filter((t) => t !== trimmedOld)
    );
    try {
      await updateDoc(doc(db, 'assets', asset.id), {
        tags: nextTags,
        updatedAt: serverTimestamp(),
      });
      updated += 1;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `assets/${asset.id}`);
    }
  }
  return updated;
}

export async function createPremiumGrant(input: {
  label: string;
  grantType: 'email' | 'code';
  granteeEmail?: string;
  accessCode?: string;
  expiresAtIso?: string;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Administrator authentication required.');
  const token = await user.getIdToken();

  const res = await fetch('/api/admin/grants', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

  const payload = (await res.json()) as {
    id?: string;
    label?: string;
    grantType?: 'email' | 'code';
    granteeEmail?: string;
    accessCodeHash?: string;
    active?: boolean;
    expiresAtIso?: string;
    error?: string;
  };

  if (!res.ok || !payload.id) {
    throw new Error(payload.error || 'Failed to create premium access grant.');
  }

  try {
    await setDoc(doc(db, 'premium_grants', payload.id), {
      label: String(payload.label || '').slice(0, 100),
      grantType: payload.grantType === 'code' ? 'code' : 'email',
      granteeEmail: String(payload.granteeEmail || '').slice(0, 200),
      accessCodeHash: String(payload.accessCodeHash || '').slice(0, 128),
      active: Boolean(payload.active),
      expiresAtIso: String(payload.expiresAtIso || '').slice(0, 40),
      createdByUid: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `premium_grants/${payload.id}`);
  }

  return payload.id;
}

export async function togglePremiumGrantActive(grant: PremiumGrant): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Administrator authentication required.');
  const token = await user.getIdToken();

  try {
    await updateDoc(doc(db, 'premium_grants', grant.id), {
      active: !grant.active,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `premium_grants/${grant.id}`);
  }

  await fetch(`/api/admin/grants/${encodeURIComponent(grant.id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      active: !grant.active,
    }),
  });
}

export async function syncAllGrantsToServer(grants: PremiumGrant[]): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const token = await user.getIdToken();
  await fetch('/api/admin/sync-grants', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ grants }),
  });
}

export async function deletePremiumGrant(grantId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Administrator authentication required.');
  const token = await user.getIdToken();

  await fetch(`/api/admin/grants/${encodeURIComponent(grantId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  try {
    await deleteDoc(doc(db, 'premium_grants', grantId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `premium_grants/${grantId}`);
  }
}

export function subscribePaymentSettings(
  onData: (settings: PaymentSettings) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'app_settings/payment';
  return onSnapshot(
    doc(db, 'app_settings', 'payment'),
    async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        onData({
          priceInr: Number(data.priceInr || 99),
          upiId: String(data.upiId || ''),
          qrCodeUrl: String(data.qrCodeUrl || ''),
          updatedByUid: String(data.updatedByUid || ''),
          updatedAt: data.updatedAt,
        });
        return;
      }
      try {
        const res = await fetch('/api/payment/config');
        if (res.ok) {
          const fallback = (await res.json()) as Partial<PaymentSettings>;
          onData({
            priceInr: Number(fallback.priceInr || 99),
            upiId: String(fallback.upiId || ''),
            qrCodeUrl: String(fallback.qrCodeUrl || ''),
          });
          return;
        }
      } catch {
        // ignore
      }
      onData({ priceInr: 99, upiId: '', qrCodeUrl: '' });
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export async function savePaymentSettingsWithQr(input: {
  priceInr: number;
  upiId: string;
  qrFile?: File | null;
  removeQr?: boolean;
}): Promise<PaymentSettings> {
  const user = auth.currentUser;
  if (!user) throw new Error('Administrator authentication required.');
  const token = await user.getIdToken();

  const formData = new FormData();
  formData.append('priceInr', String(Math.max(1, Math.min(100000, Math.round(input.priceInr || 99)))));
  formData.append('upiId', input.upiId.trim().slice(0, 120));
  formData.append('removeQr', String(Boolean(input.removeQr)));
  if (input.qrFile) {
    formData.append('qrFile', input.qrFile);
  }

  const res = await fetch('/api/admin/payment-settings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  const payload = (await res.json()) as {
    priceInr?: number;
    upiId?: string;
    qrCodeUrl?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(payload.error || 'Failed to save payment settings.');
  }

  const nextSettings: PaymentSettings = {
    priceInr: Number(payload.priceInr || 99),
    upiId: String(payload.upiId || '').slice(0, 120),
    qrCodeUrl: String(payload.qrCodeUrl || '').slice(0, 500),
  };

  try {
    await setDoc(doc(db, 'app_settings', 'payment'), {
      priceInr: nextSettings.priceInr,
      upiId: nextSettings.upiId,
      qrCodeUrl: nextSettings.qrCodeUrl,
      updatedByUid: user.uid,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'app_settings/payment');
  }

  return nextSettings;
}

export async function submitUtrPaymentRequest(input: {
  utrNumber: string;
  amountInr: number;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error('Please login with Google first.');
  }

  const cleanUtr = input.utrNumber.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);
  if (cleanUtr.length < 6) {
    throw new Error('Enter a valid UTR / transaction reference number (min 6 characters).');
  }

  const requestId = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const path = `payment_requests/${requestId}`;

  try {
    await setDoc(doc(db, 'payment_requests', requestId), {
      userUid: user.uid,
      userEmail: user.email.trim().slice(0, 200),
      userName: (user.displayName || '').trim().slice(0, 120),
      amountInr: Math.max(1, Math.min(100000, Math.round(input.amountInr || 99))),
      utrNumber: cleanUtr,
      status: 'pending',
      adminNote: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  return requestId;
}

function mapPaymentRequestDoc(id: string, data: Record<string, unknown>): PaymentRequest {
  const rawStatus = data.status;
  const status: PaymentRequestStatus =
    rawStatus === 'approved' || rawStatus === 'rejected' ? rawStatus : 'pending';
  return {
    id,
    userUid: String(data.userUid || ''),
    userEmail: String(data.userEmail || ''),
    userName: String(data.userName || ''),
    amountInr: Number(data.amountInr || 99),
    utrNumber: String(data.utrNumber || ''),
    status,
    adminNote: String(data.adminNote || ''),
    createdAt: (data.createdAt as PaymentRequest['createdAt']) || null,
    updatedAt: (data.updatedAt as PaymentRequest['updatedAt']) || null,
  };
}

export function subscribeUserPaymentRequests(
  userUid: string,
  onData: (requests: PaymentRequest[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'payment_requests';
  const q = query(collection(db, path), where('userUid', '==', userUid));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => mapPaymentRequestDoc(d.id, d.data()))
        .sort((a, b) => b.id.localeCompare(a.id));
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeAdminPaymentRequests(
  onData: (requests: PaymentRequest[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'payment_requests';
  return onSnapshot(
    collection(db, path),
    (snap) => {
      const items = snap.docs
        .map((d) => mapPaymentRequestDoc(d.id, d.data()))
        .sort((a, b) => b.id.localeCompare(a.id));
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function reviewPaymentRequest(
  reqItem: PaymentRequest,
  status: 'approved' | 'rejected',
  adminNote = ''
): Promise<void> {
  const path = `payment_requests/${reqItem.id}`;
  try {
    await updateDoc(doc(db, 'payment_requests', reqItem.id), {
      status,
      adminNote: adminNote.trim().slice(0, 300),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }

  if (status === 'approved' && reqItem.userEmail) {
    await createPremiumGrant({
      label: `UPI ₹${reqItem.amountInr} (${reqItem.utrNumber})`.slice(0, 100),
      grantType: 'email',
      granteeEmail: reqItem.userEmail,
    });
  }
}
