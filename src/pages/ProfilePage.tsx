import React from 'react';
import { signOut, type User } from 'firebase/auth';
import { Crown, KeyRound, LogIn, LogOut, ShieldCheck, User as UserIcon } from 'lucide-react';
import { auth } from '../lib/firebase';
import type { AccountAccessInfo } from './SubscriptionPage';

interface ProfilePageProps {
  currentUser: User | null;
  authReady: boolean;
  authBusy: boolean;
  accountAccess: AccountAccessInfo;
  activeAccessCode: string;
  activeCodeLabel: string | null;
  onLoginClick: () => void;
  onGoSubscription: () => void;
  onClearAccessCode: () => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({
  currentUser,
  authReady,
  authBusy,
  accountAccess,
  activeAccessCode,
  activeCodeLabel,
  onLoginClick,
  onGoSubscription,
  onClearAccessCode,
}) => {
  const isPremium = accountAccess.hasPremium || Boolean(activeAccessCode);

  if (!authReady) {
    return (
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 flex justify-center">
        <div className="w-7 h-7 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 space-y-6">
      <h1 className="font-display text-2xl sm:text-3xl font-bold text-white border-b border-white/[0.08] pb-5">
        Profile
      </h1>

      {!currentUser ? (
        <div className="bg-[#0D0D11] border border-white/[0.08] rounded-2xl p-8 text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-red-600/15 border border-red-500/30 flex items-center justify-center mx-auto text-red-500">
            <UserIcon className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 className="font-display text-lg font-semibold text-white">Not Signed In</h2>
            <p className="text-xs text-zinc-400">
              Sign in with Google to sync your account and Premium access.
            </p>
          </div>
          <button
            type="button"
            disabled={authBusy}
            onClick={onLoginClick}
            className="min-h-[46px] px-6 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
          >
            <LogIn className="w-4 h-4" />
            <span>{authBusy ? 'Signing in...' : 'Login with Google'}</span>
          </button>
        </div>
      ) : (
        <div className="bg-[#0D0D11] border border-white/[0.08] rounded-2xl p-6 space-y-6">
          {/* User Identity */}
          <div className="flex items-center gap-4">
            {currentUser.photoURL ? (
              <img
                src={currentUser.photoURL}
                alt={currentUser.displayName || 'User'}
                referrerPolicy="no-referrer"
                className="w-16 h-16 rounded-xl object-cover border border-white/10 shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
                <UserIcon className="w-7 h-7" />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold text-white truncate">
                {currentUser.displayName || 'Google User'}
              </h2>
              <p className="font-mono text-xs text-zinc-400 truncate">{currentUser.email}</p>
            </div>
          </div>

          {/* Membership Summary */}
          <div className="divide-y divide-white/[0.06] border-y border-white/[0.06] text-sm">
            <div className="py-3.5 flex items-center justify-between gap-4">
              <span className="text-zinc-400 flex items-center gap-2">
                <Crown className="w-4 h-4 text-red-500" />
                Plan
              </span>
              <span
                className={`font-semibold ${isPremium ? 'text-emerald-400' : 'text-zinc-200'}`}
              >
                {accountAccess.hasPremium
                  ? `Premium · ${accountAccess.grantLabel || 'Active'}`
                  : activeAccessCode
                  ? `Premium · ${activeCodeLabel || 'Code Active'}`
                  : 'Free'}
              </span>
            </div>

            {activeAccessCode && (
              <div className="py-3.5 flex items-center justify-between gap-4">
                <span className="text-zinc-400 flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-red-500" />
                  Access Code
                </span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-zinc-200">Active</span>
                  <button
                    type="button"
                    onClick={onClearAccessCode}
                    className="text-xs text-red-400 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            <div className="py-3.5 flex items-center justify-between gap-4">
              <span className="text-zinc-400 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-red-500" />
                Account Status
              </span>
              <span className="text-zinc-200">Verified</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            {!isPremium && (
              <button
                type="button"
                onClick={onGoSubscription}
                className="flex-1 min-h-[46px] px-5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
              >
                <Crown className="w-4 h-4" />
                <span>Manage Subscription</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => void signOut(auth)}
              className="flex-1 min-h-[46px] px-5 rounded-xl bg-[#16161C] hover:bg-[#1E1E26] border border-white/[0.1] text-zinc-200 text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </main>
  );
};
