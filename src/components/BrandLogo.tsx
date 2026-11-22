import React from 'react';

interface BrandLogoProps {
  variant?: 'icon' | 'horizontal';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'horizontal',
  size = 'md',
  className = '',
}) => {
  const iconDim = size === 'sm' ? 36 : size === 'lg' ? 58 : 42;

  const emblem = (
    <svg
      width={iconDim}
      height={iconDim}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0 drop-shadow-[0_4px_12px_rgba(212,175,55,0.22)]"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="ramadyGoldGrad" x1="6" y1="6" x2="58" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FBF0C4" />
          <stop offset="45%" stopColor="#D4AF37" />
          <stop offset="100%" stopColor="#8F6A14" />
        </linearGradient>
        <linearGradient id="ramadyInnerBg" x1="12" y1="8" x2="52" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#121C35" />
          <stop offset="100%" stopColor="#070B14" />
        </linearGradient>
      </defs>
      {/* Royal Khatam Double Octagonal Frame */}
      <polygon
        points="20,4 44,4 60,20 60,44 44,60 20,60 4,44 4,20"
        fill="url(#ramadyInnerBg)"
        stroke="url(#ramadyGoldGrad)"
        strokeWidth="2.1"
      />
      <polygon
        points="22,8.5 42,8.5 55.5,22 55.5,42 42,55.5 22,55.5 8.5,42 8.5,22"
        fill="none"
        stroke="#EED07A"
        strokeOpacity="0.34"
        strokeWidth="0.9"
      />
      {/* Refined Crown Motif */}
      <path
        d="M19 29.5L17 19.5L25.5 24.8L32 14.5L38.5 24.8L47 19.5L45 29.5H19Z"
        fill="url(#ramadyGoldGrad)"
      />
      {/* Classical Calligraphy Nib */}
      <path
        d="M21.5 33H42.5L38.2 42L32 50.5L25.8 42L21.5 33Z"
        fill="rgba(212,175,55,0.08)"
        stroke="url(#ramadyGoldGrad)"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <line x1="32" y1="33" x2="32" y2="39" stroke="#EED07A" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="32" cy="40.5" r="2.2" fill="#FBF0C4" />
    </svg>
  );

  if (variant === 'icon') {
    return <div className={`inline-flex items-center justify-center ${className}`}>{emblem}</div>;
  }

  return (
    <div className={`inline-flex items-center gap-2.5 sm:gap-3 whitespace-nowrap shrink-0 ${className}`}>
      {emblem}
      <div className="flex flex-col leading-tight text-right">
        <span className="font-display text-base sm:text-lg font-bold tracking-wide text-[#F8FAFC]">
          أحمد الرمادي
        </span>
        <span className="text-[11px] font-medium text-[#D4AF37]">
          ملك اللغة العربية
        </span>
      </div>
    </div>
  );
};
