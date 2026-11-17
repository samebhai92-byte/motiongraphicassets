import React from 'react';

interface PublicFooterProps {
  onSelectCategory: (categoryId: string) => void;
}

export const PublicFooter: React.FC<PublicFooterProps> = ({ onSelectCategory }) => {
  const quickCategories = [
    { id: 'motion-graphics', label: 'Motion Graphics' },
    { id: 'green-screen', label: 'Green Screen' },
    { id: 'png', label: 'PNG' },
    { id: 'overlays', label: 'Overlays' },
    { id: 'transitions', label: 'Transitions' },
    { id: 'infographics', label: 'Infographics' },
    { id: 'sound-effects', label: 'Sound Effects' },
    { id: 'backgrounds', label: 'Backgrounds' },
  ];

  return (
    <footer className="border-t border-white/[0.08] bg-[#060608] text-zinc-400 mt-14">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <p className="font-display text-base font-bold tracking-tight text-white">
            ASSET <span className="text-red-500">HUB</span>
          </p>
          <p className="text-xs text-zinc-500">
            © {new Date().getFullYear()} ASSET HUB
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
          {quickCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelectCategory(cat.id)}
              className="text-zinc-400 hover:text-red-400 transition-colors whitespace-nowrap"
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>
    </footer>
  );
};
