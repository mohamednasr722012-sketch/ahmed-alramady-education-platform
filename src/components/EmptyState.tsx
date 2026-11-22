import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}) => {
  return (
    <div className="relative overflow-hidden flex flex-col items-center justify-center text-center py-14 px-6 rounded-2xl surface-card-gold">
      <div className="bg-arabesque-lattice absolute inset-0 pointer-events-none opacity-60" />
      <div className="relative w-13 h-13 rounded-2xl bg-[#0A101E] border border-[#D4AF37]/35 flex items-center justify-center text-[#EED07A] mb-4 shadow-inner">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="relative font-display text-lg font-bold text-[#F8FAFC] mb-1.5">{title}</h3>
      <p className="relative text-sm text-[#94A3B8] max-w-md leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="relative mt-5 px-5 py-2.5 rounded-xl btn-gold-royal text-sm font-bold whitespace-nowrap shrink-0"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

export const LoadingSkeleton: React.FC<{ rows?: number }> = ({ rows = 3 }) => (
  <div className="space-y-3" aria-busy="true" aria-label="جاري التحميل">
    {Array.from({ length: rows }).map((_, i) => (
      <div
        key={i}
        className="h-16 rounded-2xl skeleton-shimmer border border-white/[0.06]"
      />
    ))}
  </div>
);
