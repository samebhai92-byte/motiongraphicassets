import React from 'react';
import { LogIn, User as UserIcon } from 'lucide-react';
import type { User } from 'firebase/auth';

export type PublicTab = 'home' | 'subscription' | 'profile';

interface PublicHeaderProps {
  activeTab: PublicTab;
  currentUser: User | null;
  authBusy: boolean;
  onNavigateTab: (tab: PublicTab) => void;
  onLoginClick: () => void;
}

export const PublicHeader: React.FC<PublicHeaderProps> = ({
  activeTab,
  currentUser,
  authBusy,
  onNavigateTab,
  onLoginClick,
}) => {
  const navItems: { id: PublicTab; label: string }[] = [
    { id: 'home', label: 'Home' },
    { id: 'subscription', label: 'Subscription' },
    { id: 'profile', label: 'Profile' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#060608]/92 backdrop-blur-md border-b border-white/[0.08]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
        {/* Zone 1: Brand Wordmark */}
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            onNavigateTab('home');
          }}
          className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded-sm"
        >
          ASSET <span className="text-red-500">HUB</span>
        </a>

        {/* Zone 2: Desktop Navigation (3 Core Sections) */}
        <nav
          aria-label="Primary Navigation"
          className="hidden lg:flex items-center gap-8 text-sm font-medium"
        >
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigateTab(item.id)}
                className={`py-1.5 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  active
                    ? 'text-white border-red-500'
                    : 'text-zinc-400 border-transparent hover:text-white'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Login / Account Action */}
        <div className="flex items-center shrink-0">
          {currentUser ? (
            <button
              type="button"
              onClick={() => onNavigateTab('profile')}
              className="min-h-[40px] pl-1.5 pr-3.5 py-1.5 rounded-lg bg-[#121217] hover:bg-[#1A1A22] border border-white/[0.1] hover:border-red-500/40 flex items-center gap-2.5 transition-colors whitespace-nowrap shrink-0"
            >
              {currentUser.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.displayName || 'Account'}
                  referrerPolicy="no-referrer"
                  className="w-7 h-7 rounded-md object-cover"
                />
              ) : (
                <span className="w-7 h-7 rounded-md bg-red-600/20 text-red-400 flex items-center justify-center">
                  <UserIcon className="w-4 h-4" />
                </span>
              )}
              <span className="text-xs font-semibold text-zinc-100 max-w-[110px] truncate">
                {currentUser.displayName?.split(' ')[0] || 'Account'}
              </span>
            </button>
          ) : (
            <button
              type="button"
              disabled={authBusy}
              onClick={onLoginClick}
              className="min-h-[40px] px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>{authBusy ? 'Signing in...' : 'Login'}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
