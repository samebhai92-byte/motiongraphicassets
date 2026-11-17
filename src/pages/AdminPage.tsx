import React, { useEffect, useMemo, useState } from 'react';
import { signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  Check,
  CheckCircle2,
  Copy,
  Edit3,
  FolderKanban,
  HardDrive,
  KeyRound,
  Layers,
  Lock,
  LogOut,
  Plus,
  QrCode,
  Search,
  ShieldAlert,
  ShieldCheck,
  Tag,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { ADMIN_EMAIL, auth, googleProvider } from '../lib/firebase';
import {
  createPremiumGrant,
  deleteAssetCompletely,
  deleteCategoryById,
  deletePremiumGrant,
  ensureDefaultCategoriesInFirestore,
  renameTagAcrossAssets,
  reviewPaymentRequest,
  saveCategory,
  savePaymentSettingsWithQr,
  subscribeAdminAssets,
  subscribeAdminGrants,
  subscribeAdminPaymentRequests,
  subscribePaymentSettings,
  subscribePublicCategories,
  syncAllGrantsToServer,
  togglePremiumGrantActive,
} from '../lib/catalog';
import { formatBytes } from '../lib/format';
import type {
  AssetItem,
  Category,
  PaymentRequest,
  PremiumGrant,
  StorageSummary,
} from '../types';
import { AdminAssetFormModal } from '../components/AdminAssetFormModal';

interface AdminPageProps {
  currentUser: User | null;
  authReady: boolean;
  onNavigatePublic: () => void;
}

type AdminTab = 'assets' | 'payments' | 'categories' | 'access' | 'storage';

export const AdminPage: React.FC<AdminPageProps> = ({
  currentUser,
  authReady,
  onNavigatePublic,
}) => {
  const [serverVerified, setServerVerified] = useState<
    'idle' | 'checking' | 'authorized' | 'denied'
  >('idle');
  const [serverError, setServerError] = useState<string | null>(null);
  const [storageSummary, setStorageSummary] = useState<StorageSummary | null>(null);

  const [activeTab, setActiveTab] = useState<AdminTab>('assets');
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [grants, setGrants] = useState<PremiumGrant[]>([]);
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([]);

  // UPI & QR Settings State
  const [priceInr, setPriceInr] = useState('99');
  const [upiId, setUpiId] = useState('');
  const [currentQrUrl, setCurrentQrUrl] = useState('');
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrPreviewUrl, setQrPreviewUrl] = useState('');
  const [removeQr, setRemoveQr] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const [assetSearch, setAssetSearch] = useState('');
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<AssetItem | null>(null);
  const [confirmDeleteAsset, setConfirmDeleteAsset] = useState<AssetItem | null>(null);

  const [toast, setToast] = useState<string | null>(null);

  // Category Form State
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catOrder, setCatOrder] = useState('9');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [savingCat, setSavingCat] = useState(false);

  // Tag Rename State
  const [renamingTag, setRenamingTag] = useState<string | null>(null);
  const [newTagValue, setNewTagValue] = useState('');

  // Grant Form State
  const [grantType, setGrantType] = useState<'email' | 'code'>('code');
  const [grantLabel, setGrantLabel] = useState('');
  const [grantEmail, setGrantEmail] = useState('');
  const [grantCode, setGrantCode] = useState('');
  const [grantExpiry, setGrantExpiry] = useState('');
  const [lastCreatedCode, setLastCreatedCode] = useState<string | null>(null);
  const [savingGrant, setSavingGrant] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 4000);
  };

  const refreshServerStats = async () => {
    if (!auth.currentUser) return;
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/stats', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as StorageSummary;
        setStorageSummary(data);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!authReady) return;
    if (!currentUser) {
      setServerVerified('idle');
      setServerError(null);
      return;
    }

    let cancelled = false;
    const verify = async () => {
      setServerVerified('checking');
      setServerError(null);
      try {
        const token = await currentUser.getIdToken(true);
        const res = await fetch('/api/admin/verify', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = (await res.json().catch(() => ({}))) as {
          authorized?: boolean;
          storage?: StorageSummary;
          error?: string;
        };
        if (cancelled) return;
        if (res.ok && body.authorized) {
          setServerVerified('authorized');
          if (body.storage) setStorageSummary(body.storage);
          void ensureDefaultCategoriesInFirestore();
        } else {
          setServerVerified('denied');
          setServerError(body.error || 'Access denied.');
        }
      } catch (err) {
        if (!cancelled) {
          setServerVerified('denied');
          setServerError(err instanceof Error ? err.message : 'Verification failed.');
        }
      }
    };

    void verify();
    return () => {
      cancelled = true;
    };
  }, [authReady, currentUser]);

  useEffect(() => {
    if (serverVerified !== 'authorized') return;
    const unsubAssets = subscribeAdminAssets(setAssets);
    const unsubCats = subscribePublicCategories(setCategories);
    const unsubGrants = subscribeAdminGrants((list) => {
      setGrants(list);
      void syncAllGrantsToServer(list);
    });
    const unsubPaymentSettings = subscribePaymentSettings((settings) => {
      setPriceInr(String(settings.priceInr || 99));
      setUpiId(settings.upiId || '');
      setCurrentQrUrl(settings.qrCodeUrl || '');
    });
    const unsubPaymentRequests = subscribeAdminPaymentRequests(setPaymentRequests);
    return () => {
      unsubAssets();
      unsubCats();
      unsubGrants();
      unsubPaymentSettings();
      unsubPaymentRequests();
    };
  }, [serverVerified]);

  useEffect(() => {
    if (!qrFile) {
      setQrPreviewUrl('');
      return;
    }
    const objUrl = URL.createObjectURL(qrFile);
    setQrPreviewUrl(objUrl);
    return () => URL.revokeObjectURL(objUrl);
  }, [qrFile]);

  const filteredAssets = useMemo(() => {
    const q = assetSearch.trim().toLowerCase();
    return assets
      .filter((a) => {
        if (!q) return true;
        return (
          a.title.toLowerCase().includes(q) ||
          a.categoryName.toLowerCase().includes(q) ||
          a.fileFormat.toLowerCase().includes(q) ||
          a.tags.some((t) => t.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => b.id.localeCompare(a.id));
  }, [assets, assetSearch]);

  const tagCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const asset of assets) {
      for (const tag of asset.tags) {
        map[tag] = (map[tag] || 0) + 1;
      }
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [assets]);

  const pendingPaymentsCount = useMemo(
    () => paymentRequests.filter((r) => r.status === 'pending').length,
    [paymentRequests]
  );

  const stats = useMemo(() => {
    const downloadsMap = storageSummary?.downloadsByAsset || {};
    const totalDownloads = assets.reduce(
      (sum, a) => sum + Math.max(a.downloadsCount || 0, downloadsMap[a.id] || 0),
      0
    );
    const totalBytes = assets.reduce((sum, a) => sum + (a.fileSizeBytes || 0), 0);
    const freeCount = assets.filter((a) => a.tier === 'free').length;
    const premiumCount = assets.filter((a) => a.tier === 'premium').length;
    return {
      totalAssets: assets.length,
      totalDownloads,
      totalBytes,
      freeCount,
      premiumCount,
    };
  }, [assets, storageSummary]);

  const handleSignIn = async () => {
    setServerError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Google sign-in failed.');
    }
  };

  const handleSavePaymentSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPayment(true);
    try {
      const saved = await savePaymentSettingsWithQr({
        priceInr: Number(priceInr) || 99,
        upiId,
        qrFile,
        removeQr,
      });
      setCurrentQrUrl(saved.qrCodeUrl);
      setQrFile(null);
      setRemoveQr(false);
      showToast('UPI & QR settings saved.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save UPI settings.');
    } finally {
      setSavingPayment(false);
    }
  };

  const handleReviewPayment = async (
    reqItem: PaymentRequest,
    decision: 'approved' | 'rejected'
  ) => {
    setReviewingId(reqItem.id);
    try {
      await reviewPaymentRequest(reqItem, decision);
      showToast(
        decision === 'approved'
          ? `Approved & unlocked ${reqItem.userEmail}.`
          : `Rejected UTR ${reqItem.utrNumber}.`
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update payment status.');
    } finally {
      setReviewingId(null);
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    setSavingCat(true);
    try {
      await saveCategory({
        id: editingCatId || undefined,
        name: catName,
        description: catDesc,
        sortOrder: Number(catOrder) || 10,
      });
      setCatName('');
      setCatDesc('');
      setCatOrder(String(categories.length + 1));
      setEditingCatId(null);
      showToast(editingCatId ? 'Category updated.' : 'Category created.');
    } finally {
      setSavingCat(false);
    }
  };

  const handleCreateGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGrant(true);
    setLastCreatedCode(null);
    try {
      const code = grantType === 'code' ? grantCode.trim() : undefined;
      await createPremiumGrant({
        label: grantLabel,
        grantType,
        granteeEmail: grantType === 'email' ? grantEmail : undefined,
        accessCode: code,
        expiresAtIso: grantExpiry ? new Date(grantExpiry).toISOString() : '',
      });
      if (grantType === 'code' && code) {
        setLastCreatedCode(code);
      }
      setGrantLabel('');
      setGrantEmail('');
      setGrantCode('');
      setGrantExpiry('');
      showToast('Access grant created.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create grant.');
    } finally {
      setSavingGrant(false);
    }
  };

  if (!authReady || serverVerified === 'checking') {
    return (
      <div className="min-h-screen bg-[#060608] flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-zinc-400">Verifying admin...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#060608] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#0D0D11] border border-white/[0.1] rounded-2xl p-7 sm:p-8 space-y-6 shadow-2xl">
          <div className="space-y-2">
            <div className="w-11 h-11 rounded-xl bg-red-600/15 border border-red-500/30 flex items-center justify-center text-red-500">
              <Lock className="w-5 h-5" />
            </div>
            <h1 className="font-display text-2xl font-bold text-white">
              ASSET <span className="text-red-500">HUB</span> Admin
            </h1>
            <p className="text-sm text-zinc-400">Administrator sign-in required.</p>
          </div>

          {serverError && (
            <p className="text-xs text-red-400 bg-red-950/35 border border-red-500/30 rounded-lg p-3">
              {serverError}
            </p>
          )}

          <button
            type="button"
            onClick={() => void handleSignIn()}
            className="w-full min-h-[48px] px-5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Sign in with Google</span>
          </button>

          <button
            type="button"
            onClick={onNavigatePublic}
            className="w-full min-h-[44px] text-xs text-zinc-400 hover:text-white transition-colors"
          >
            Back to Website
          </button>
        </div>
      </div>
    );
  }

  if (serverVerified === 'denied') {
    return (
      <div className="min-h-screen bg-[#060608] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#0D0D11] border border-red-500/35 rounded-2xl p-7 sm:p-8 space-y-6">
          <div className="space-y-2">
            <div className="w-11 h-11 rounded-xl bg-red-600/15 border border-red-500/35 flex items-center justify-center text-red-500">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <h1 className="font-display text-2xl font-bold text-white">Access Denied</h1>
            <p className="text-sm text-zinc-300 leading-relaxed">
              <span className="font-mono text-white">{currentUser.email || 'Unknown'}</span> is not
              authorized for the admin panel.
            </p>
            <p className="text-xs text-zinc-400">
              {serverError || 'Only the configured administrator account is allowed.'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => void signOut(auth)}
              className="flex-1 min-h-[48px] px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
            <button
              type="button"
              onClick={onNavigatePublic}
              className="flex-1 min-h-[48px] px-4 rounded-xl border border-white/[0.12] text-zinc-200 hover:text-white text-sm font-medium transition-colors"
            >
              Public Website
            </button>
          </div>
        </div>
      </div>
    );
  }

  const displayedQr = removeQr ? '' : qrPreviewUrl || currentQrUrl;

  return (
    <div className="min-h-screen bg-[#060608] text-zinc-100 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-[#0D0D11] border-r border-white/[0.08] p-5 justify-between">
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <span className="font-display text-lg font-bold tracking-tight text-white">
              ASSET <span className="text-red-500">HUB</span>
            </span>
            <span className="text-xs font-medium text-red-400">Admin</span>
          </div>

          <button
            type="button"
            onClick={() => {
              setEditingAsset(null);
              setAssetModalOpen(true);
            }}
            className="w-full min-h-[48px] px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span>Upload Asset</span>
          </button>

          <nav className="space-y-1.5" aria-label="Admin Navigation">
            {(
              [
                { id: 'assets', label: 'Assets', icon: Layers, badge: 0 },
                { id: 'payments', label: 'UPI & Payments', icon: QrCode, badge: pendingPaymentsCount },
                { id: 'categories', label: 'Categories & Tags', icon: FolderKanban, badge: 0 },
                { id: 'access', label: 'Premium Access', icon: KeyRound, badge: 0 },
                { id: 'storage', label: 'Storage Info', icon: HardDrive, badge: 0 },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full min-h-[44px] px-3.5 rounded-lg text-sm font-medium flex items-center justify-between gap-2 transition-colors ${
                    active
                      ? 'bg-[#1B1B22] text-white'
                      : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${active ? 'text-red-500' : ''}`} />
                    <span>{item.label}</span>
                  </span>
                  {item.badge > 0 && (
                    <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-red-600 text-white">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="pt-4 border-t border-white/[0.08] space-y-3">
          <p className="text-xs text-zinc-400 truncate">{currentUser.email}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onNavigatePublic}
              className="flex-1 min-h-[40px] px-3 rounded-lg border border-white/[0.1] text-xs text-zinc-300 hover:text-white transition-colors"
            >
              Public Site
            </button>
            <button
              type="button"
              onClick={() => void signOut(auth)}
              aria-label="Sign out"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-white/[0.1] text-zinc-400 hover:text-red-400 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Sticky Top Bar */}
      <header className="lg:hidden sticky top-0 z-30 h-14 px-4 bg-[#0D0D11]/95 backdrop-blur-md border-b border-white/[0.08] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-display text-base font-bold text-white whitespace-nowrap">
            ASSET <span className="text-red-500">HUB</span>
          </span>
          <span className="text-xs text-red-400">Admin</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onNavigatePublic}
            className="min-h-[40px] px-3 rounded-lg border border-white/[0.1] text-xs font-medium text-zinc-300"
          >
            Site
          </button>
          <button
            type="button"
            onClick={() => void signOut(auth)}
            aria-label="Sign out"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-white/[0.1] text-zinc-300"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 lg:pl-64 pb-24 lg:pb-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-white">
                {activeTab === 'assets'
                  ? 'Assets'
                  : activeTab === 'payments'
                  ? 'UPI & Payments'
                  : activeTab === 'categories'
                  ? 'Categories & Tags'
                  : activeTab === 'access'
                  ? 'Premium Access'
                  : 'Storage Info'}
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5">{ADMIN_EMAIL}</p>
            </div>

            <button
              type="button"
              onClick={() => {
                setEditingAsset(null);
                setAssetModalOpen(true);
              }}
              className="min-h-[48px] px-5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Upload Asset</span>
            </button>
          </div>

          {/* KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-[#0D0D11] border border-white/[0.08] rounded-xl p-4 sm:p-5">
              <p className="text-xs text-zinc-400">Assets</p>
              <p className="font-display text-2xl font-bold tabular-nums text-white mt-1">
                {stats.totalAssets}
              </p>
              <p className="text-[11px] font-mono text-zinc-400 mt-1">
                {stats.freeCount} Free · {stats.premiumCount} Premium
              </p>
            </div>

            <div className="bg-[#0D0D11] border border-white/[0.08] rounded-xl p-4 sm:p-5">
              <p className="text-xs text-zinc-400">Downloads</p>
              <p className="font-display text-2xl font-bold tabular-nums text-red-400 mt-1">
                {stats.totalDownloads}
              </p>
              <p className="text-[11px] text-zinc-500 mt-1">Total</p>
            </div>

            <div className="bg-[#0D0D11] border border-white/[0.08] rounded-xl p-4 sm:p-5">
              <p className="text-xs text-zinc-400">Storage</p>
              <p className="font-display text-2xl font-bold tabular-nums text-white mt-1">
                {formatBytes(stats.totalBytes)}
              </p>
              <p className="text-[11px] text-zinc-500 mt-1">Originals</p>
            </div>

            <div className="bg-[#0D0D11] border border-white/[0.08] rounded-xl p-4 sm:p-5">
              <p className="text-xs text-zinc-400">Pending UTR</p>
              <p className="font-display text-2xl font-bold tabular-nums text-white mt-1">
                {pendingPaymentsCount}
              </p>
              <p className="text-[11px] text-zinc-500 mt-1">
                {paymentRequests.length} total requests
              </p>
            </div>
          </div>

          {toast && (
            <div className="p-3.5 rounded-xl bg-[#16161C] border border-red-500/35 text-zinc-100 text-xs font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{toast}</span>
            </div>
          )}

          {/* TAB 1: ASSETS */}
          {activeTab === 'assets' && (
            <section className="space-y-4">
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={assetSearch}
                  onChange={(e) => setAssetSearch(e.target.value)}
                  placeholder="Search uploaded assets..."
                  className="w-full min-h-[44px] pl-10 pr-4 rounded-xl bg-[#0D0D11] border border-white/[0.08] focus:border-red-500 text-sm text-white placeholder:text-zinc-500 focus:outline-none"
                />
              </div>

              {filteredAssets.length === 0 ? (
                <div className="bg-[#0D0D11] border border-white/[0.08] rounded-xl p-10 text-center">
                  <p className="font-display text-base font-semibold text-white">
                    No assets uploaded yet
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredAssets.map((asset) => {
                    const dl = Math.max(
                      asset.downloadsCount || 0,
                      storageSummary?.downloadsByAsset?.[asset.id] || 0
                    );
                    return (
                      <div
                        key={asset.id}
                        className="bg-[#0D0D11] border border-white/[0.08] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="w-16 h-12 rounded-lg bg-[#060608] border border-white/[0.08] overflow-hidden shrink-0 flex items-center justify-center">
                            {asset.thumbnailUrl ? (
                              <img
                                src={asset.thumbnailUrl}
                                alt={asset.title}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="font-mono text-[10px] text-zinc-300 uppercase">
                                {asset.fileFormat || 'FILE'}
                              </span>
                            )}
                          </div>

                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-zinc-400 truncate">{asset.categoryName}</span>
                              <span aria-hidden="true">·</span>
                              <span
                                className={
                                  asset.tier === 'free'
                                    ? 'text-zinc-200 font-medium'
                                    : 'text-red-400 font-semibold'
                                }
                              >
                                {asset.tier === 'free' ? 'Free' : 'Premium'}
                              </span>
                              {!asset.published && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-zinc-500">Draft</span>
                                </>
                              )}
                            </div>
                            <h3 className="font-display text-sm sm:text-base font-semibold text-white truncate">
                              {asset.title}
                            </h3>
                            <p className="font-mono tabular-nums text-xs text-zinc-400 truncate">
                              {asset.fileFormat} · {asset.resolution} ·{' '}
                              {formatBytes(asset.fileSizeBytes)} · {dl} downloads
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAsset(asset);
                              setAssetModalOpen(true);
                            }}
                            className="flex-1 sm:flex-none min-h-[44px] px-4 rounded-lg bg-[#16161C] hover:bg-[#22222B] text-zinc-200 text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteAsset(asset)}
                            aria-label={`Delete ${asset.title}`}
                            className="min-h-[44px] min-w-[44px] px-3 rounded-lg border border-red-500/25 hover:bg-red-950/40 text-red-400 inline-flex items-center justify-center transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* TAB 2: UPI & PAYMENTS */}
          {activeTab === 'payments' && (
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Custom UPI ID, Price & QR Code Upload */}
              <form
                onSubmit={(e) => void handleSavePaymentSettings(e)}
                className="lg:col-span-5 bg-[#0D0D11] border border-white/[0.08] rounded-xl p-5 space-y-4 h-fit"
              >
                <h2 className="font-display text-base font-semibold text-white">
                  UPI ID &amp; QR Code
                </h2>

                <div className="space-y-1.5">
                  <label htmlFor="admin-price-inr" className="block text-xs text-zinc-300">
                    Subscription Price (₹)
                  </label>
                  <input
                    id="admin-price-inr"
                    type="number"
                    min={1}
                    max={100000}
                    required
                    value={priceInr}
                    onChange={(e) => setPriceInr(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-lg bg-[#060608] border border-white/[0.1] focus:border-red-500 font-mono text-sm text-white focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="admin-upi-id" className="block text-xs text-zinc-300">
                    Custom UPI ID
                  </label>
                  <input
                    id="admin-upi-id"
                    type="text"
                    maxLength={120}
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    placeholder="yourname@okaxis"
                    className="w-full min-h-[44px] px-3.5 rounded-lg bg-[#060608] border border-white/[0.1] focus:border-red-500 font-mono text-sm text-white placeholder:text-zinc-500 focus:outline-none"
                  />
                </div>

                {/* QR Code Upload */}
                <div className="space-y-2">
                  <span className="block text-xs text-zinc-300">UPI QR Code Image</span>

                  {displayedQr && (
                    <div className="relative bg-white rounded-xl p-3 w-44 h-44 flex items-center justify-center">
                      <img
                        src={displayedQr}
                        alt="Uploaded UPI QR Code"
                        className="w-full h-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setQrFile(null);
                          setRemoveQr(true);
                        }}
                        aria-label="Remove QR image"
                        className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  <label className="block cursor-pointer rounded-xl border border-dashed border-red-500/45 bg-[#060608] hover:bg-[#121218] p-4 transition-colors">
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        setQrFile(file);
                        if (file) setRemoveQr(false);
                      }}
                    />
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-red-600/20 text-red-400 flex items-center justify-center shrink-0">
                        <QrCode className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white">
                          {qrFile ? qrFile.name : 'Upload QR Code Image'}
                        </p>
                        <p className="text-[11px] text-zinc-400">PNG, JPG, WebP</p>
                      </div>
                    </div>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={savingPayment}
                  className="w-full min-h-[48px] rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
                >
                  {savingPayment ? 'Saving...' : 'Save Payment Settings'}
                </button>
              </form>

              {/* UTR Payment Requests */}
              <div className="lg:col-span-7 bg-[#0D0D11] border border-white/[0.08] rounded-xl divide-y divide-white/[0.06]">
                <div className="p-4 flex items-center justify-between">
                  <h2 className="font-display text-base font-semibold text-white">
                    UTR Requests ({paymentRequests.length})
                  </h2>
                </div>

                {paymentRequests.length === 0 ? (
                  <div className="p-8 text-center text-xs text-zinc-400">
                    No UTR payment requests yet.
                  </div>
                ) : (
                  paymentRequests.map((req) => (
                    <div
                      key={req.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-mono font-semibold text-white">
                            UTR: {req.utrNumber}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-red-400">₹{req.amountInr}</span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={
                              req.status === 'approved'
                                ? 'text-emerald-400 font-semibold'
                                : req.status === 'rejected'
                                ? 'text-red-400 font-semibold'
                                : 'text-amber-400 font-semibold'
                            }
                          >
                            {req.status}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 truncate">
                          {req.userName ? `${req.userName} · ` : ''}
                          {req.userEmail}
                        </p>
                      </div>

                      {req.status === 'pending' && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={reviewingId === req.id}
                            onClick={() => void handleReviewPayment(req, 'approved')}
                            className="min-h-[42px] px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Approve</span>
                          </button>
                          <button
                            type="button"
                            disabled={reviewingId === req.id}
                            onClick={() => void handleReviewPayment(req, 'rejected')}
                            className="min-h-[42px] px-3.5 rounded-lg border border-red-500/35 hover:bg-red-950/40 text-red-400 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          {/* TAB 3: CATEGORIES & TAGS */}
          {activeTab === 'categories' && (
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-4">
                <form
                  onSubmit={(e) => void handleSaveCategory(e)}
                  className="bg-[#0D0D11] border border-white/[0.08] rounded-xl p-5 space-y-4"
                >
                  <h2 className="font-display text-base font-semibold text-white">
                    {editingCatId ? 'Edit Category' : 'Add Category'}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={catName}
                      onChange={(e) => setCatName(e.target.value)}
                      placeholder="Category name"
                      className="sm:col-span-2 min-h-[44px] px-3.5 rounded-lg bg-[#060608] border border-white/[0.1] text-sm text-white focus:border-red-500 focus:outline-none"
                    />
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      value={catOrder}
                      onChange={(e) => setCatOrder(e.target.value)}
                      placeholder="Order"
                      className="min-h-[44px] px-3.5 rounded-lg bg-[#060608] border border-white/[0.1] text-sm font-mono text-white focus:border-red-500 focus:outline-none"
                    />
                  </div>
                  <input
                    type="text"
                    maxLength={300}
                    value={catDesc}
                    onChange={(e) => setCatDesc(e.target.value)}
                    placeholder="Short note (optional)"
                    className="w-full min-h-[44px] px-3.5 rounded-lg bg-[#060608] border border-white/[0.1] text-sm text-white focus:border-red-500 focus:outline-none"
                  />
                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={savingCat}
                      className="min-h-[44px] px-5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors"
                    >
                      {editingCatId ? 'Update' : 'Create'}
                    </button>
                    {editingCatId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCatId(null);
                          setCatName('');
                          setCatDesc('');
                        }}
                        className="min-h-[44px] px-4 rounded-lg text-xs text-zinc-400 hover:text-white"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </form>

                <div className="bg-[#0D0D11] border border-white/[0.08] rounded-xl divide-y divide-white/[0.06]">
                  {categories.map((cat) => (
                    <div key={cat.id} className="p-4 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">
                          {cat.sortOrder}. {cat.name}
                        </p>
                        {cat.description && (
                          <p className="text-xs text-zinc-400 truncate">{cat.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCatId(cat.id);
                            setCatName(cat.name);
                            setCatDesc(cat.description);
                            setCatOrder(String(cat.sortOrder));
                          }}
                          aria-label={`Edit ${cat.name}`}
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-zinc-300 hover:text-white hover:bg-white/[0.05]"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void deleteCategoryById(cat.id).then(() =>
                              showToast(`Deleted "${cat.name}".`)
                            );
                          }}
                          aria-label={`Delete ${cat.name}`}
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-red-400 hover:bg-red-950/35"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tag Organizer */}
              <div className="lg:col-span-5 bg-[#0D0D11] border border-white/[0.08] rounded-xl p-5 space-y-4 h-fit">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-red-500" />
                  <h2 className="font-display text-base font-semibold text-white">
                    Tags ({tagCounts.length})
                  </h2>
                </div>

                {tagCounts.length === 0 ? (
                  <p className="text-xs text-zinc-400">No tags yet.</p>
                ) : (
                  <div className="divide-y divide-white/[0.06]">
                    {tagCounts.map(([tagName, count]) => (
                      <div key={tagName} className="py-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs text-zinc-200">
                            #{tagName} <span className="text-zinc-500">({count})</span>
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setRenamingTag(tagName);
                                setNewTagValue(tagName);
                              }}
                              className="text-xs text-red-400 hover:underline py-1"
                            >
                              Rename
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void renameTagAcrossAssets(tagName, '', assets).then((n) =>
                                  showToast(`Removed #${tagName} from ${n} assets.`)
                                );
                              }}
                              className="text-xs text-zinc-400 hover:text-red-400 hover:underline py-1"
                            >
                              Remove
                            </button>
                          </div>
                        </div>

                        {renamingTag === tagName && (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={newTagValue}
                              onChange={(e) => setNewTagValue(e.target.value)}
                              className="flex-1 min-h-[40px] px-3 rounded-lg bg-[#060608] border border-white/[0.1] text-xs text-white"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                void renameTagAcrossAssets(tagName, newTagValue, assets).then(
                                  (n) => {
                                    setRenamingTag(null);
                                    showToast(`Updated tag across ${n} assets.`);
                                  }
                                );
                              }}
                              className="min-h-[40px] px-3 rounded-lg bg-red-600 text-white text-xs font-medium"
                            >
                              Save
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* TAB 4: PREMIUM ACCESS */}
          {activeTab === 'access' && (
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <form
                onSubmit={(e) => void handleCreateGrant(e)}
                className="lg:col-span-5 bg-[#0D0D11] border border-white/[0.08] rounded-xl p-5 space-y-4 h-fit"
              >
                <h2 className="font-display text-base font-semibold text-white">
                  Add Premium Access
                </h2>

                <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-[#060608] border border-white/[0.1] min-h-[44px]">
                  <button
                    type="button"
                    onClick={() => setGrantType('code')}
                    className={`rounded-md text-xs font-semibold transition-colors ${
                      grantType === 'code' ? 'bg-red-600 text-white' : 'text-zinc-400'
                    }`}
                  >
                    Access Code
                  </button>
                  <button
                    type="button"
                    onClick={() => setGrantType('email')}
                    className={`rounded-md text-xs font-semibold transition-colors ${
                      grantType === 'email' ? 'bg-red-600 text-white' : 'text-zinc-400'
                    }`}
                  >
                    Google Email
                  </button>
                </div>

                <input
                  type="text"
                  required
                  maxLength={100}
                  value={grantLabel}
                  onChange={(e) => setGrantLabel(e.target.value)}
                  placeholder="Label (e.g. Client Pass)"
                  className="w-full min-h-[44px] px-3.5 rounded-lg bg-[#060608] border border-white/[0.1] text-sm text-white focus:border-red-500 focus:outline-none"
                />

                {grantType === 'email' ? (
                  <input
                    type="email"
                    required
                    value={grantEmail}
                    onChange={(e) => setGrantEmail(e.target.value)}
                    placeholder="user@gmail.com"
                    className="w-full min-h-[44px] px-3.5 rounded-lg bg-[#060608] border border-white/[0.1] text-sm text-white focus:border-red-500 focus:outline-none"
                  />
                ) : (
                  <input
                    type="text"
                    required
                    minLength={4}
                    value={grantCode}
                    onChange={(e) => setGrantCode(e.target.value)}
                    placeholder="Access code (min 4 chars)"
                    className="w-full min-h-[44px] px-3.5 rounded-lg bg-[#060608] border border-white/[0.1] font-mono text-sm text-white focus:border-red-500 focus:outline-none"
                  />
                )}

                <div className="space-y-1">
                  <label htmlFor="grant-expiry" className="block text-xs text-zinc-400">
                    Expiration Date (Optional)
                  </label>
                  <input
                    id="grant-expiry"
                    type="date"
                    value={grantExpiry}
                    onChange={(e) => setGrantExpiry(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-lg bg-[#060608] border border-white/[0.1] text-sm text-white focus:border-red-500 focus:outline-none"
                  />
                </div>

                {lastCreatedCode && (
                  <div className="p-3 rounded-lg bg-[#16161C] border border-red-500/35 flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono text-white">Code: {lastCreatedCode}</span>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(lastCreatedCode);
                        showToast('Code copied.');
                      }}
                      className="inline-flex items-center gap-1 text-red-400 hover:text-white"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy
                    </button>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={savingGrant}
                  className="w-full min-h-[48px] rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors"
                >
                  {savingGrant ? 'Saving...' : 'Create Access'}
                </button>
              </form>

              <div className="lg:col-span-7 bg-[#0D0D11] border border-white/[0.08] rounded-xl divide-y divide-white/[0.06]">
                {grants.length === 0 ? (
                  <div className="p-8 text-center text-xs text-zinc-400">
                    No active grants yet.
                  </div>
                ) : (
                  grants.map((grant) => (
                    <div
                      key={grant.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-semibold text-white">{grant.label}</span>
                          <span aria-hidden="true">·</span>
                          <span className={grant.active ? 'text-emerald-400' : 'text-zinc-500'}>
                            {grant.active ? 'Active' : 'Paused'}
                          </span>
                        </div>
                        <p className="font-mono text-xs text-zinc-400 truncate">
                          {grant.grantType === 'email'
                            ? `Email: ${grant.granteeEmail}`
                            : 'Access Code'}
                          {grant.expiresAtIso
                            ? ` · Expires ${new Date(grant.expiresAtIso).toLocaleDateString()}`
                            : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => void togglePremiumGrantActive(grant)}
                          className="min-h-[40px] px-3 rounded-lg border border-white/[0.1] text-xs text-zinc-200 hover:text-white"
                        >
                          {grant.active ? 'Pause' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void deletePremiumGrant(grant.id).then(() =>
                              showToast('Access removed.')
                            )
                          }
                          aria-label={`Remove ${grant.label}`}
                          className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-red-400 hover:bg-red-950/35"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          {/* TAB 5: STORAGE INFO */}
          {activeTab === 'storage' && (
            <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-[#0D0D11] border border-white/[0.08] rounded-xl p-6 space-y-3">
                <h2 className="font-display text-base font-semibold text-white">
                  File Storage Paths
                </h2>
                <ul className="text-xs font-mono text-zinc-300 space-y-2">
                  <li>Free: storage/originals/free/</li>
                  <li>Premium: storage/originals/private/</li>
                  <li>QR Images: storage/qr/</li>
                  <li>Temp Link TTL: 180s</li>
                </ul>
              </div>

              <div className="bg-[#0D0D11] border border-white/[0.08] rounded-xl p-6 space-y-3">
                <h2 className="font-display text-base font-semibold text-white">
                  Free-Tier Disk Notice
                </h2>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Local container storage is active with no paid cloud storage enabled. Container
                  restarts reset local files unless backed by persistent object storage.
                </p>
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Mobile Fixed Bottom Tab Bar */}
      <nav
        aria-label="Mobile Admin Navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-[#0D0D11]/95 backdrop-blur-md border-t border-white/[0.1] grid grid-cols-5 items-center px-1"
      >
        <button
          type="button"
          onClick={() => setActiveTab('assets')}
          className={`flex flex-col items-center justify-center min-h-[48px] ${
            activeTab === 'assets' ? 'text-red-500' : 'text-zinc-400'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span className="text-[10px] font-medium mt-0.5">Assets</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setEditingAsset(null);
            setAssetModalOpen(true);
          }}
          className="flex flex-col items-center justify-center min-h-[48px] text-red-500"
        >
          <Upload className="w-4 h-4" />
          <span className="text-[10px] font-semibold mt-0.5">Upload</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('payments')}
          className={`relative flex flex-col items-center justify-center min-h-[48px] ${
            activeTab === 'payments' ? 'text-red-500' : 'text-zinc-400'
          }`}
        >
          <QrCode className="w-4 h-4" />
          <span className="text-[10px] font-medium mt-0.5">UPI</span>
          {pendingPaymentsCount > 0 && (
            <span className="absolute top-1.5 right-3 w-2 h-2 rounded-full bg-red-500" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('categories')}
          className={`flex flex-col items-center justify-center min-h-[48px] ${
            activeTab === 'categories' ? 'text-red-500' : 'text-zinc-400'
          }`}
        >
          <FolderKanban className="w-4 h-4" />
          <span className="text-[10px] font-medium mt-0.5">Categories</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('access')}
          className={`flex flex-col items-center justify-center min-h-[48px] ${
            activeTab === 'access' ? 'text-red-500' : 'text-zinc-400'
          }`}
        >
          <KeyRound className="w-4 h-4" />
          <span className="text-[10px] font-medium mt-0.5">Access</span>
        </button>
      </nav>

      {/* Upload & Edit Asset Modal */}
      <AdminAssetFormModal
        open={assetModalOpen}
        editingAsset={editingAsset}
        categories={categories}
        onClose={() => setAssetModalOpen(false)}
        onSuccess={(msg) => {
          showToast(msg);
          void refreshServerStats();
        }}
      />

      {/* Delete Confirmation Modal */}
      {confirmDeleteAsset && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-w-md w-full bg-[#0D0D11] border border-white/[0.12] rounded-2xl p-6 space-y-5">
            <div className="space-y-2">
              <h2 className="font-display text-lg font-semibold text-white">Delete Asset?</h2>
              <p className="text-sm text-zinc-400">
                Permanently remove{' '}
                <span className="text-white font-medium">{confirmDeleteAsset.title}</span>?
              </p>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDeleteAsset(null)}
                className="min-h-[44px] px-4 rounded-lg border border-white/[0.1] text-xs font-medium text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = confirmDeleteAsset;
                  setConfirmDeleteAsset(null);
                  void deleteAssetCompletely(target.id).then(() => {
                    showToast(`Deleted "${target.title}".`);
                    void refreshServerStats();
                  });
                }}
                className="min-h-[44px] px-4 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
