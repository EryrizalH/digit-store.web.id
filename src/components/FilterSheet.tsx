import React, { useEffect, useState } from 'react';
import { Filter, RotateCcw, X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';

export interface CatalogFilterValues {
  type: string;
  sort: string;
  minPrice: string;
  maxPrice: string;
  service: string;
  country: string;
  inStock: boolean;
  instantOnly: boolean;
}

interface FilterSheetProps {
  open: boolean;
  values: CatalogFilterValues;
  activeCount: number;
  onApply: (values: CatalogFilterValues) => void;
  onReset: () => void;
  onClose: () => void;
}

export const FilterSheet: React.FC<FilterSheetProps> = ({ open, values, activeCount, onApply, onReset, onClose }) => {
  const [draft, setDraft] = useState(values);
  const sheetRef = useFocusTrap<HTMLDivElement>(open, onClose);

  useEffect(() => {
    if (open) setDraft(values);
  }, [open, values]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  const update = <K extends keyof CatalogFilterValues>(key: K, value: CatalogFilterValues[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  return (
    <div
      ref={sheetRef}
      id="catalog-filter-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="catalog-filter-title"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-end bg-black/65 lg:hidden"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="max-h-[min(92dvh,48rem)] w-full overflow-y-auto rounded-t-3xl border border-slate-700 bg-[#0b101c] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-300"><Filter className="h-4 w-4" /> Katalog</p>
            <h2 id="catalog-filter-title" className="mt-1 text-lg font-extrabold text-white">Filter produk</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup filter" className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-300 focus-visible:ring-2 focus-visible:ring-indigo-400"><X className="h-5 w-5" /></button>
        </header>

        <div className="space-y-4 py-4">
          <label className="block space-y-1.5 text-xs font-semibold text-slate-300">
            <span>Tipe produk</span>
            <select value={draft.type} onChange={(event) => update('type', event.target.value)} className="min-h-[48px] w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-white focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-400">
              <option value="">Semua tipe</option><option value="file">File digital</option><option value="code">Kode / voucher</option><option value="herosms">OTP SMS</option>
            </select>
          </label>

          <label className="block space-y-1.5 text-xs font-semibold text-slate-300">
            <span>Urutkan</span>
            <select value={draft.sort} onChange={(event) => update('sort', event.target.value)} className="min-h-[48px] w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-white focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-400">
              <option value="newest">Terbaru</option><option value="best_selling">Paling laku</option><option value="price_asc">Harga terendah</option><option value="price_desc">Harga tertinggi</option>
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5 text-xs font-semibold text-slate-300"><span>Harga minimum</span><input type="number" min="0" inputMode="numeric" value={draft.minPrice} onChange={(event) => update('minPrice', event.target.value)} placeholder="Rp 0" className="min-h-[48px] w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-400" /></label>
            <label className="block space-y-1.5 text-xs font-semibold text-slate-300"><span>Harga maksimum</span><input type="number" min="0" inputMode="numeric" value={draft.maxPrice} onChange={(event) => update('maxPrice', event.target.value)} placeholder="Tanpa batas" className="min-h-[48px] w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-400" /></label>
          </div>

          <label className="block space-y-1.5 text-xs font-semibold text-slate-300"><span>Layanan</span><input type="search" value={draft.service} onChange={(event) => update('service', event.target.value)} placeholder="Contoh: Telegram" className="min-h-[48px] w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-400" /></label>
          <label className="block space-y-1.5 text-xs font-semibold text-slate-300"><span>Negara</span><input type="search" value={draft.country} onChange={(event) => update('country', event.target.value)} placeholder="Kode negara" className="min-h-[48px] w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-400" /></label>

          <label className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/70 px-3 text-xs font-semibold text-slate-300"><input type="checkbox" checked={draft.inStock} onChange={(event) => update('inStock', event.target.checked)} className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-2 focus:ring-indigo-500" /> Tersedia sekarang</label>
          <label className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/70 px-3 text-xs font-semibold text-slate-300"><input type="checkbox" checked={draft.instantOnly} onChange={(event) => update('instantOnly', event.target.checked)} className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-2 focus:ring-indigo-500" /> Pengiriman instan</label>
        </div>

        <footer className="flex gap-3 border-t border-slate-800 pt-3">
          <button type="button" onClick={onReset} className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-slate-700 px-3 text-xs font-bold text-slate-300 focus-visible:ring-2 focus-visible:ring-indigo-400"><RotateCcw className="h-4 w-4" /> Reset</button>
          <button type="button" onClick={() => onApply(draft)} className="flex min-h-[48px] flex-[1.4] items-center justify-center rounded-xl bg-indigo-600 px-3 text-xs font-bold text-white hover:bg-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-400">Terapkan{activeCount > 0 ? ` (${activeCount})` : ''}</button>
        </footer>
      </section>
    </div>
  );
};
