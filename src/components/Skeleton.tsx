// ponytail: Skeleton loader components for catalog cards and detail views
import React from 'react';

export const ProductCardSkeleton: React.FC = () => (
  <div className="glass-card rounded-2xl p-4 flex flex-col justify-between space-y-4 animate-pulse">
    <div className="w-full aspect-[16/9] bg-slate-800/60 rounded-xl" />
    <div className="space-y-2">
      <div className="h-4 bg-slate-800/80 rounded-lg w-3/4" />
      <div className="h-3 bg-slate-800/40 rounded-lg w-full" />
      <div className="h-3 bg-slate-800/40 rounded-lg w-2/3" />
    </div>
    <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
      <div className="h-5 bg-slate-800/80 rounded-lg w-20" />
      <div className="h-9 bg-slate-800/80 rounded-xl w-24" />
    </div>
  </div>
);

export const ProductDetailSkeleton: React.FC = () => (
  <div className="max-w-4xl mx-auto py-8 px-4 space-y-6 animate-pulse">
    <div className="w-full aspect-video bg-slate-800/60 rounded-3xl" />
    <div className="space-y-3">
      <div className="h-8 bg-slate-800/80 rounded-xl w-1/2" />
      <div className="h-4 bg-slate-800/50 rounded-lg w-full" />
      <div className="h-4 bg-slate-800/50 rounded-lg w-4/5" />
    </div>
  </div>
);
