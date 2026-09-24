import React from 'react';

export const AtlasLogo: React.FC<{ className?: string; size?: 'sm' | 'md' | 'lg' | 'xl' }> = ({
  className = '',
  size = 'md',
}) => {
  const sizeClasses = {
    sm: 'text-2xl tracking-widest',
    md: 'text-3xl tracking-[0.2em]',
    lg: 'text-4xl tracking-[0.25em]',
    xl: 'text-5xl sm:text-6xl tracking-[0.3em]',
  };

  return (
    <div className={`flex items-center select-none ${className}`}>
      {/* Bold, blocky modern Atlas wordmark replacing Roblox */}
      <span
        className={`font-black uppercase text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)] font-sans ${sizeClasses[size]}`}
        style={{ letterSpacing: '0.18em' }}
      >
        ATLAS
      </span>
    </div>
  );
};
