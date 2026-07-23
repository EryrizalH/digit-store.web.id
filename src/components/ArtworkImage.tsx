// ponytail: Artwork image component with reserved aspect ratio, lazy loading, and SVG fallback
import React, { useState } from 'react';
import { Download, Key, Smartphone, Package } from 'lucide-react';
import { ProductType } from '../types';

interface ArtworkImageProps {
  src?: string | null;
  alt: string;
  type: ProductType;
  className?: string;
  aspectRatio?: string;
}

export const ArtworkImage: React.FC<ArtworkImageProps> = ({
  src,
  alt,
  type,
  className = '',
  aspectRatio = 'aspect-[16/9]',
}) => {
  const [hasError, setHasError] = useState(false);

  const getTypeFallback = () => {
    switch (type) {
      case 'file':
        return (
          <div className="w-full h-full bg-gradient-to-br from-blue-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center p-4 text-blue-400">
            <Download className="w-8 h-8 mb-2 animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-blue-300/80">Digital File</span>
          </div>
        );
      case 'code':
        return (
          <div className="w-full h-full bg-gradient-to-br from-emerald-950 via-slate-900 to-teal-950 flex flex-col items-center justify-center p-4 text-emerald-400">
            <Key className="w-8 h-8 mb-2 animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-300/80">License Code</span>
          </div>
        );
      case 'herosms':
        return (
          <div className="w-full h-full bg-gradient-to-br from-purple-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center p-4 text-purple-400">
            <Smartphone className="w-8 h-8 mb-2 animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-purple-300/80">HeroSMS OTP</span>
          </div>
        );
      default:
        return (
          <div className="w-full h-full bg-slate-900 flex items-center justify-center text-slate-600">
            <Package className="w-8 h-8" />
          </div>
        );
    }
  };

  return (
    <div className={`relative overflow-hidden rounded-xl bg-slate-900 ${aspectRatio} ${className}`}>
      {src && !hasError ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => setHasError(true)}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        getTypeFallback()
      )}
    </div>
  );
};
