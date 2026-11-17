import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, type User } from 'firebase/auth';
import { auth, googleProvider } from './lib/firebase';
import {
  subscribePaymentSettings,
  subscribePublicAssets,
  subscribePublicCategories,
} from './lib/catalog';
import type { AssetItem, Category, PaymentSettings } from './types';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PublicHeader, type PublicTab } from './components/PublicHeader';
import { PublicBottomNav } from './components/PublicBottomNav';
import { PublicFooter } from './components/PublicFooter';
import { HomePage } from './pages/HomePage';
import { AssetDetailPage } from './pages/AssetDetailPage';
import { SubscriptionPage, type AccountAccessInfo } from './pages/SubscriptionPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminPage } from './pages/AdminPage';

type RouteView =
  | { name: 'home' }
  | { name: 'subscription' }
  | { name: 'profile' }
  | { name: 'asset'; assetId: string }
  | { name: 'admin' };

const CODE_STORAGE_KEY = 'assethub_access_code';
const CODE_LABEL_STORAGE_KEY = 'assethub_access_label';

function parseLocation(): RouteView {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/admin') {
    return { name: 'admin' };
  }
  if (path === '/subscription') {
    return { name: 'subscription' };
  }
  if (path === '/profile') {
    return { name: 'profile' };
  }
  if (path.startsWith('/asset/')) {
    const assetId = decodeURIComponent(path.slice('/asset/'.length));
    if (assetId) {
      return { name: 'asset', assetId };
    }
  }
  return { name: 'home' };
}

export default function App() {
  const [route, setRoute] = useState<RouteView>(() => parseLocation());
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);

  const [accountAccess, setAccountAccess] = useState<AccountAccessInfo>({
    signedIn: false,
    hasPremium: false,
    grantLabel: null,
  });

  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>({
    priceInr: 99,
    upiId: '',
    qrCodeUrl: '',
  });

  const [activeAccessCode, setActiveAccessCode] = useState<string>(() => {
    try {
      return sessionStorage.getItem(CODE_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [activeCodeLabel, setActiveCodeLabel] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(CODE_LABEL_STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const [publicAssets, setPublicAssets] = useState<AssetItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingPublic, setLoadingPublic] = useState(true);
  const [downloadsByAsset, setDownloadsByAsset] = useState<Record<string, number>>({});

  const [homeFilters, setHomeFilters] = useState<{
    search: string;
    category: string;
    sort: 'latest' | 'popular';
    key: number;
  }>({
    search: '',
    category: 'all',
    sort: 'latest',
    key: 0,
  });

  const refreshDownloadStats = useCallback(async () => {
    try {
      const res = await fetch('/api/assets/stats');
      if (res.ok) {
        const data = (await res.json()) as { downloadsByAsset?: Record<string, number> };
        if (data.downloadsByAsset) {
          setDownloadsByAsset(data.downloadsByAsset);
        }
      }
    } catch {
      // Ignore network hiccup
    }
  }, []);

  const refreshAccountAccess = useCallback(async (user: User | null) => {
    if (!user) {
      setAccountAccess({ signedIn: false, hasPremium: false, grantLabel: null });
      return;
    }
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/me/access', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as AccountAccessInfo;
        setAccountAccess(data);
      }
    } catch {
      // Ignore transient error
    }
  }, []);

  useEffect(() => {
    const onPopState = () => setRoute(parseLocation());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
      void refreshAccountAccess(user);
    });
    return () => unsubAuth();
  }, [refreshAccountAccess]);

  useEffect(() => {
    if (route.name === 'admin') return;

    setLoadingPublic(true);
    const unsubAssets = subscribePublicAssets(
      (items) => {
        setPublicAssets(items);
        setLoadingPublic(false);
      },
      () => setLoadingPublic(false)
    );
    const unsubCats = subscribePublicCategories(setCategories);
    const unsubPayment = subscribePaymentSettings(setPaymentSettings);
    void refreshDownloadStats();

    return () => {
      unsubAssets();
      unsubCats();
      unsubPayment();
    };
  }, [route.name, refreshDownloadStats]);

  // Refresh entitlement status whenever user visits Subscription or Profile
  useEffect(() => {
    if ((route.name === 'subscription' || route.name === 'profile') && currentUser) {
      void refreshAccountAccess(currentUser);
    }
  }, [route.name, currentUser, refreshAccountAccess]);

  const navigateTo = (path: string) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    setRoute(parseLocation());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNavigateTab = (tab: PublicTab) => {
    if (tab === 'home') navigateTo('/');
    else if (tab === 'subscription') navigateTo('/subscription');
    else navigateTo('/profile');
  };

  const handlePublicGoogleLogin = async () => {
    setAuthBusy(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      await refreshAccountAccess(cred.user);
    } catch {
      // Popup closed or cancelled by user
    } finally {
      setAuthBusy(false);
    }
  };

  const handleActivateAccessCode = (code: string, label: string) => {
    setActiveAccessCode(code);
    setActiveCodeLabel(label);
    try {
      sessionStorage.setItem(CODE_STORAGE_KEY, code);
      sessionStorage.setItem(CODE_LABEL_STORAGE_KEY, label);
    } catch {
      // ignore storage failure
    }
  };

  const handleClearAccessCode = () => {
    setActiveAccessCode('');
    setActiveCodeLabel(null);
    try {
      sessionStorage.removeItem(CODE_STORAGE_KEY);
      sessionStorage.removeItem(CODE_LABEL_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const handleSelectCategoryFromFooter = (categoryId: string) => {
    setHomeFilters((prev) => ({ ...prev, category: categoryId, key: prev.key + 1 }));
    if (route.name !== 'home') {
      navigateTo('/');
    }
    window.setTimeout(() => {
      const el = document.getElementById('library');
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  const handleSearchByTag = (tag: string) => {
    setHomeFilters((prev) => ({
      ...prev,
      search: tag,
      category: 'all',
      key: prev.key + 1,
    }));
    navigateTo('/');
    window.setTimeout(() => {
      const el = document.getElementById('library');
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  if (route.name === 'admin') {
    return (
      <ErrorBoundary>
        <AdminPage
          currentUser={currentUser}
          authReady={authReady}
          onNavigatePublic={() => navigateTo('/')}
        />
      </ErrorBoundary>
    );
  }

  const activeAsset =
    route.name === 'asset'
      ? publicAssets.find((a) => a.id === route.assetId || a.slug === route.assetId) || null
      : null;

  const activeTab: PublicTab =
    route.name === 'subscription'
      ? 'subscription'
      : route.name === 'profile'
      ? 'profile'
      : 'home';

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#060608] text-zinc-100 flex flex-col pb-16 lg:pb-0">
        <PublicHeader
          activeTab={activeTab}
          currentUser={currentUser}
          authBusy={authBusy}
          onNavigateTab={handleNavigateTab}
          onLoginClick={() => void handlePublicGoogleLogin()}
        />

        <div className="flex-1">
          {route.name === 'asset' ? (
            <AssetDetailPage
              asset={activeAsset}
              loading={loadingPublic}
              liveDownloads={activeAsset ? downloadsByAsset[activeAsset.id] || 0 : 0}
              currentUser={currentUser}
              savedAccessCode={activeAccessCode}
              onBack={() => navigateTo('/')}
              onSearchByTag={handleSearchByTag}
              onRefreshStats={() => void refreshDownloadStats()}
            />
          ) : route.name === 'subscription' ? (
            <SubscriptionPage
              currentUser={currentUser}
              accountAccess={accountAccess}
              paymentSettings={paymentSettings}
              activeAccessCode={activeAccessCode}
              activeCodeLabel={activeCodeLabel}
              onLoginClick={() => void handlePublicGoogleLogin()}
              onBrowseAssets={() => navigateTo('/')}
              onAccessCodeActivated={handleActivateAccessCode}
              onClearAccessCode={handleClearAccessCode}
              onRefreshAccess={() => void refreshAccountAccess(currentUser)}
            />
          ) : route.name === 'profile' ? (
            <ProfilePage
              currentUser={currentUser}
              authReady={authReady}
              authBusy={authBusy}
              accountAccess={accountAccess}
              activeAccessCode={activeAccessCode}
              activeCodeLabel={activeCodeLabel}
              onLoginClick={() => void handlePublicGoogleLogin()}
              onGoSubscription={() => navigateTo('/subscription')}
              onClearAccessCode={handleClearAccessCode}
            />
          ) : (
            <HomePage
              key={homeFilters.key}
              assets={publicAssets}
              categories={categories}
              downloadsByAsset={downloadsByAsset}
              loading={loadingPublic}
              initialSearch={homeFilters.search}
              initialCategory={homeFilters.category}
              initialSort={homeFilters.sort}
              onSelectAsset={(asset) => navigateTo(`/asset/${encodeURIComponent(asset.id)}`)}
            />
          )}
        </div>

        <PublicFooter onSelectCategory={handleSelectCategoryFromFooter} />

        <PublicBottomNav activeTab={activeTab} onSelectTab={handleNavigateTab} />
      </div>
    </ErrorBoundary>
  );
}
