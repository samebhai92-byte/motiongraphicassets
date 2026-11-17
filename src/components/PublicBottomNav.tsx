import React from 'react';
import { Crown, Home, User as UserIcon } from 'lucide-react';
import type { PublicTab } from './PublicHeader';

interface PublicBottomNavProps {
  activeTab: PublicTab;
  onSelectTab: (tab: PublicTab) => void;
}

export const PublicBottomNav: React.FC<PublicBottomNavProps> = ({
  activeTab,
  onSelectTab,
}) => {
  const items: { id: PublicTab; label: string; icon: typeof Home }[] = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'subscription', label: 'Subscription', icon: Crown },
    { id: 'profile', label: 'Profile', icon: UserIcon },
  ];

  return (
    <nav
      aria-label="Bottom Navigation"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 h-14 bg-[#0A0A0E]/95 backdrop-blur-md border-t border-white/[0.1] grid grid-cols-3 items-center"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = activeTab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectTab(item.id)}
            aria-current={active ? 'page' : undefined}
            className={`relative h-full min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
              active ? 'text-red-500' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {active && (
              <span
                aria-hidden="true"
                className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-red-500 rounded-full"
              />
            )}
            <Icon className="w-4 h-4" strokeWidth={active ? 2.25 : 1.75} />
            <span className="text-[11px] font-medium leading-none">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
