import React, { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Check,
  Clock,
  Copy,
  Crown,
  ExternalLink,
  KeyRound,
  LogIn,
  QrCode,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { PaymentRequest, PaymentSettings } from '../types';
import { submitUtrPaymentRequest, subscribeUserPaymentRequests } from '../lib/catalog';

export interface AccountAccessInfo {
  signedIn: boolean;
  email?: string;
  hasPremium: boolean;
  grantLabel: string | null;
}

interface SubscriptionPageProps {
  currentUser: User | null;
  accountAccess: AccountAccessInfo;
  paymentSettings: PaymentSettings;
  activeAccessCode: string;
  activeCodeLabel: string | null;
  onLoginClick: () => void;
  onBrowseAssets: () => void;
  onAccessCodeActivated: (code: string, label: string) => void;
  onClearAccessCode: () => void;
  onRefreshAccess: () => void;
}

export const SubscriptionPage: React.FC<SubscriptionPageProps> = ({
  currentUser,
  accountAccess,
  paymentSettings,
  activeAccessCode,
  activeCodeLabel,
  onLoginClick,
  onBrowseAssets,
  onAccessCodeActivated,
  onClearAccessCode,
  onRefreshAccess,
}) => {
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [utrInput, setUtrInput] = useState('');
  const [submittingUtr, setSubmittingUtr] = useState(false);
  const [utrError, setUtrError] = useState<string | null>(null);
  const [utrSuccess, setUtrSuccess] = useState<string | null>(null);
  const [copiedUpi, setCopiedUpi] = useState(false);

  const [userRequests, setUserRequests] = useState<PaymentRequest[]>([]);

  const [codeInput, setCodeInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const price = paymentSettings.priceInr || 99;
  const isUnlocked = accountAccess.hasPremium || Boolean(activeAccessCode);

  useEffect(() => {
    if (!currentUser) {
      setUserRequests([]);
      return;
    }
    const unsub = subscribeUserPaymentRequests(currentUser.uid, (items) => {
      setUserRequests(items);
      if (items.some((r) => r.status === 'approved') && !accountAccess.hasPremium) {
        onRefreshAccess();
      }
    });
    return () => unsub();
  }, [currentUser, accountAccess.hasPremium, onRefreshAccess]);

  const handleCopyUpi = () => {
    if (!paymentSettings.upiId) return;
    void navigator.clipboard.writeText(paymentSettings.upiId);
    setCopiedUpi(true);
    window.setTimeout(() => setCopiedUpi(false), 2000);
  };

  const handleUtrSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUtrError(null);
    setUtrSuccess(null);

    if (!currentUser) {
      setUtrError('Please login with Google first.');
      return;
    }

    setSubmittingUtr(true);
    try {
      await submitUtrPaymentRequest({
        utrNumber: utrInput,
        amountInr: price,
      });
      setUtrInput('');
      setUtrSuccess('UTR submitted. Verification pending.');
    } catch (err) {
      setUtrError(err instanceof Error ? err.message : 'Failed to submit UTR.');
    } finally {
      setSubmittingUtr(false);
    }
  };

  const handleActivateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = codeInput.trim();
    if (!code) return;

    setVerifying(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/grants/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode: code }),
      });
      const data = (await res.json()) as {
        valid?: boolean;
        label?: string;
        error?: string;
      };
      if (!res.ok || !data.valid) {
        setErrorMsg(data.error || 'Invalid or expired access code.');
        return;
      }
      onAccessCodeActivated(code, data.label || 'Premium Pass');
      setCodeInput('');
      setSuccessMsg(`Activated: ${data.label || 'Premium Access'}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setVerifying(false);
    }
  };

  const upiDeepLink = paymentSettings.upiId
    ? `upi://pay?pa=${encodeURIComponent(paymentSettings.upiId)}&pn=${encodeURIComponent(
        'ASSET HUB'
      )}&am=${encodeURIComponent(String(price))}&cu=INR&tn=${encodeURIComponent(
        'ASSET HUB Premium'
      )}`
    : '';

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">Subscription</h1>
        <div className="inline-flex items-center gap-2 text-xs font-medium">
          <ShieldCheck
            className={`w-4 h-4 ${isUnlocked ? 'text-emerald-400' : 'text-zinc-500'}`}
          />
          <span className={isUnlocked ? 'text-emerald-400' : 'text-zinc-400'}>
            {accountAccess.hasPremium
              ? `Premium Active (${accountAccess.grantLabel || 'Account'})`
              : activeAccessCode
              ? `Premium Active (${activeCodeLabel || 'Code'})`
              : 'Free Plan'}
          </span>
        </div>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Free Tier */}
        <div className="bg-[#0D0D11] border border-white/[0.08] rounded-2xl p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-white">Free</h2>
              <span className="font-mono text-2xl font-bold text-zinc-200">₹0</span>
            </div>
            <ul className="space-y-2.5 text-sm text-zinc-300">
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-zinc-400 shrink-0" />
                <span>All Free assets</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-zinc-400 shrink-0" />
                <span>Original uncompressed downloads</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-zinc-400 shrink-0" />
                <span>Instant direct links</span>
              </li>
            </ul>
          </div>

          <button
            type="button"
            onClick={onBrowseAssets}
            className="w-full min-h-[46px] rounded-xl bg-[#16161C] hover:bg-[#1E1E26] border border-white/[0.1] text-white text-sm font-semibold transition-colors"
          >
            Browse Free Assets
          </button>
        </div>

        {/* Premium ₹99 Tier */}
        <div className="bg-gradient-to-b from-[#1A090D] to-[#0D0D11] border border-red-500/50 rounded-2xl p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-red-500" />
                <h2 className="font-display text-xl font-bold text-white">Premium</h2>
              </div>
              <div className="text-right">
                <span className="font-mono text-2xl font-bold text-white">₹{price}</span>
              </div>
            </div>
            <ul className="space-y-2.5 text-sm text-zinc-200">
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-red-500 shrink-0" />
                <span>All Free &amp; Premium assets</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-red-500 shrink-0" />
                <span>Uncompressed master files</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-red-500 shrink-0" />
                <span>Private vault download access</span>
              </li>
            </ul>
          </div>

          {isUnlocked ? (
            <button
              type="button"
              onClick={onBrowseAssets}
              className="w-full min-h-[46px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors"
            >
              Premium Unlocked · Browse Assets
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCheckoutOpen((prev) => !prev)}
              className="w-full min-h-[46px] rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors"
            >
              {checkoutOpen ? 'Hide Payment Details' : `Buy Premium · ₹${price}`}
            </button>
          )}
        </div>
      </div>

      {/* UPI Payment & UTR Verification Panel */}
      {checkoutOpen && !isUnlocked && (
        <section className="bg-[#0D0D11] border border-red-500/40 rounded-2xl p-6 space-y-6">
          <div className="flex items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
            <div className="flex items-center gap-2.5">
              <QrCode className="w-5 h-5 text-red-500" />
              <h2 className="font-display text-lg font-bold text-white">
                Pay ₹{price} via UPI
              </h2>
            </div>
            <span className="font-mono text-sm font-bold text-red-400">₹{price}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            {/* QR Code & UPI ID */}
            <div className="md:col-span-5 space-y-4">
              {paymentSettings.qrCodeUrl ? (
                <div className="bg-white rounded-xl p-3 w-52 h-52 mx-auto md:mx-0 flex items-center justify-center">
                  <img
                    src={paymentSettings.qrCodeUrl}
                    alt="UPI QR Code"
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div className="w-52 h-52 mx-auto md:mx-0 rounded-xl bg-[#060608] border border-white/[0.1] flex flex-col items-center justify-center text-center p-4 space-y-2">
                  <QrCode className="w-8 h-8 text-zinc-600" />
                  <p className="text-xs text-zinc-500">
                    {paymentSettings.upiId ? 'Use UPI ID below' : 'UPI QR not configured yet'}
                  </p>
                </div>
              )}

              {paymentSettings.upiId && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-[#060608] border border-white/[0.1]">
                    <span className="font-mono text-xs text-white truncate">
                      {paymentSettings.upiId}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyUpi}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-red-400 hover:text-white shrink-0"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{copiedUpi ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>

                  {upiDeepLink && (
                    <a
                      href={upiDeepLink}
                      className="w-full min-h-[44px] px-4 rounded-xl border border-red-500/40 bg-red-600/15 hover:bg-red-600/25 text-red-300 text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                    >
                      <span>Open UPI App · ₹{price}</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* UTR Submission Form */}
            <div className="md:col-span-7 space-y-4">
              {!currentUser ? (
                <div className="p-5 rounded-xl bg-[#060608] border border-white/[0.1] space-y-3">
                  <p className="text-sm font-semibold text-white">Login Required</p>
                  <p className="text-xs text-zinc-400">
                    Login with Google to submit your UTR number and activate Premium on your account.
                  </p>
                  <button
                    type="button"
                    onClick={onLoginClick}
                    className="min-h-[44px] px-5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>Login with Google</span>
                  </button>
                </div>
              ) : (
                <form onSubmit={(e) => void handleUtrSubmit(e)} className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="utr-input" className="block text-xs font-medium text-zinc-300">
                      Enter UTR / Transaction Reference Number
                    </label>
                    <input
                      id="utr-input"
                      type="text"
                      required
                      minLength={6}
                      maxLength={60}
                      value={utrInput}
                      onChange={(e) => setUtrInput(e.target.value)}
                      placeholder="12-digit UTR number (e.g. 432198765432)"
                      className="w-full min-h-[46px] px-4 rounded-xl bg-[#060608] border border-white/[0.12] focus:border-red-500 font-mono text-sm text-white placeholder:text-zinc-500 focus:outline-none"
                    />
                  </div>

                  <p className="text-xs text-zinc-400">
                    Account: <span className="font-mono text-zinc-200">{currentUser.email}</span>
                  </p>

                  {utrError && (
                    <p className="text-xs text-red-400" role="alert">
                      {utrError}
                    </p>
                  )}
                  {utrSuccess && (
                    <p className="text-xs text-emerald-400" role="status">
                      {utrSuccess}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submittingUtr || utrInput.trim().length < 6}
                    className="w-full min-h-[46px] px-6 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                  >
                    {submittingUtr ? 'Submitting...' : 'Submit UTR'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </section>
      )}

      {/* User's Payment Verification Status */}
      {currentUser && userRequests.length > 0 && (
        <section className="bg-[#0D0D11] border border-white/[0.08] rounded-2xl p-6 space-y-3">
          <h2 className="font-display text-base font-semibold text-white">Payment Status</h2>
          <div className="divide-y divide-white/[0.06]">
            {userRequests.map((req) => (
              <div
                key={req.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="space-y-0.5">
                  <p className="font-mono text-white">
                    UTR: {req.utrNumber} · ₹{req.amountInr}
                  </p>
                  {req.adminNote && <p className="text-zinc-400">{req.adminNote}</p>}
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 font-semibold ${
                    req.status === 'approved'
                      ? 'text-emerald-400'
                      : req.status === 'rejected'
                      ? 'text-red-400'
                      : 'text-amber-400'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  {req.status === 'approved'
                    ? 'Approved'
                    : req.status === 'rejected'
                    ? 'Rejected'
                    : 'Pending Verification'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Access Code Activation */}
      <section className="bg-[#0D0D11] border border-white/[0.08] rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-base font-semibold text-white">Access Code</h2>
          {activeAccessCode && (
            <button
              type="button"
              onClick={onClearAccessCode}
              className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-red-400"
            >
              <X className="w-3.5 h-3.5" />
              <span>Remove Code</span>
            </button>
          )}
        </div>

        <form onSubmit={(e) => void handleActivateCode(e)} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <KeyRound className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="Enter access code"
              className="w-full min-h-[46px] pl-10 pr-4 rounded-xl bg-[#060608] border border-white/[0.1] focus:border-red-500 text-sm font-mono text-white placeholder:text-zinc-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={verifying || !codeInput.trim()}
            className="min-h-[46px] px-6 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors whitespace-nowrap"
          >
            {verifying ? 'Checking...' : 'Activate'}
          </button>
        </form>

        {errorMsg && (
          <p className="text-xs text-red-400" role="alert">
            {errorMsg}
          </p>
        )}
        {successMsg && (
          <p className="text-xs text-emerald-400" role="status">
            {successMsg}
          </p>
        )}
      </section>
    </main>
  );
};
