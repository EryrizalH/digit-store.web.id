import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Product, Category } from '../types';
import { ProductCard } from '../components/ProductCard';
import { CatalogFilterValues, FilterSheet } from '../components/FilterSheet';
import { ProductCardSkeleton } from '../components/Skeleton';
import { Download, Key, Smartphone, AlertCircle, RefreshCw, Filter, ChevronLeft, ChevronRight } from 'lucide-react';

export const CatalogPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCategory = searchParams.get('category');
  const searchQuery = searchParams.get('q') || '';
  const selectedType = searchParams.get('type') || '';
  const selectedSort = searchParams.get('sort') || 'newest';
  const currentPage = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1);
  const minPrice = searchParams.get('min_price') || '';
  const maxPrice = searchParams.get('max_price') || '';
  const service = searchParams.get('service') || '';
  const country = searchParams.get('country') || '';
  const inStock = searchParams.get('in_stock') === '1';
  const instantOnly = searchParams.get('instant') === '1';

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1, hasNext: false, hasPrevious: false });

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/products/categories');
      if (res.ok) {
        const data = (await res.json()) as any;
        setCategories(data.categories || []);
      }
    } catch {
      // ignore
    }
  };

  // ponytail: native AbortController cancels stale in-flight product queries
  const fetchProducts = async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      let url = '/api/products';
      const params = new URLSearchParams();
      if (selectedCategory) params.append('category', selectedCategory);
      if (searchQuery) params.append('q', searchQuery);
      if (selectedType) params.append('type', selectedType);
      if (selectedSort) params.append('sort', selectedSort);
      if (minPrice) params.append('min_price', minPrice);
      if (maxPrice) params.append('max_price', maxPrice);
      if (service) params.append('service', service);
      if (country) params.append('country', country);
      if (inStock) params.append('in_stock', '1');
      if (instantOnly) params.append('instant', '1');
      params.append('page', String(currentPage));
      params.append('limit', '24');
      if (params.toString()) url += `?${params.toString()}`;

      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error('Gagal memuat produk dari server.');

      const data = (await res.json()) as any;
      const rawProducts: Product[] = data.products || [];
      setProducts(rawProducts);
      if (data.pagination) {
        setPagination({
          page: Number(data.pagination.page || currentPage),
          total: Number(data.pagination.total || 0),
          totalPages: Math.max(1, Number(data.pagination.totalPages || 1)),
          hasNext: Boolean(data.pagination.hasNext),
          hasPrevious: Boolean(data.pagination.hasPrevious)
        });
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'Terjadi kesalahan jaringan');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchProducts(controller.signal);
    return () => controller.abort();
  }, [selectedCategory, searchQuery, selectedType, selectedSort, minPrice, maxPrice, service, country, inStock, instantOnly, currentPage]);

  const updateParam = (key: string, value: string, resetPage = true) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (resetPage && key !== 'page') next.delete('page');
    setSearchParams(next, { replace: true });
  };

  const handleSelectCategory = (slug: string | null) => {
    const newParams = new URLSearchParams(searchParams);
    if (slug) {
      newParams.set('category', slug);
    } else {
      newParams.delete('category');
    }
    newParams.delete('page');
    setSearchParams(newParams);
  };

  const goToPage = (page: number) => {
    const next = new URLSearchParams(searchParams);
    if (page <= 1) next.delete('page');
    else next.set('page', String(page));
    setSearchParams(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetFilters = () => {
    const next = new URLSearchParams();
    if (searchQuery) next.set('q', searchQuery);
    if (selectedCategory) next.set('category', selectedCategory);
    setSearchParams(next);
    setFilterSheetOpen(false);
  };

  const visibleCategories = categories.filter((cat) => cat.slug !== 'herosms-activation');
  const filterValues: CatalogFilterValues = { type: selectedType, sort: selectedSort, minPrice, maxPrice, service, country, inStock, instantOnly };
  const activeFilterCount = [selectedType, selectedSort !== 'newest' ? selectedSort : '', minPrice, maxPrice, service, country, inStock ? '1' : '', instantOnly ? '1' : ''].filter(Boolean).length;

  const applyFilters = (values: CatalogFilterValues) => {
    const next = new URLSearchParams(searchParams);
    const entries: Array<[string, string]> = [
      ['type', values.type],
      ['sort', values.sort === 'newest' ? '' : values.sort],
      ['min_price', values.minPrice],
      ['max_price', values.maxPrice],
      ['service', values.service.trim()],
      ['country', values.country.trim()],
      ['in_stock', values.inStock ? '1' : ''],
      ['instant', values.instantOnly ? '1' : '']
    ];
    entries.forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    next.delete('page');
    setSearchParams(next, { replace: true });
    setFilterSheetOpen(false);
  };

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col space-y-6 px-4 py-6 pb-safe sm:space-y-8 sm:py-8 lg:px-8">
      {/* Benefit-Led Hero Section */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 p-5 sm:p-10">
        <div className="relative z-10 max-w-2xl">
          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight mb-3">
            Akses Instan <span className="text-indigo-300">File, Lisensi & OTP SMS</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed mb-6">
            Dapatkan source code & software dari Cloudflare R2 Storage, kode lisensi voucher otomatis, serta nomor penerima OTP HeroSMS langsung dari dashboard Anda.
          </p>

          {/* Benefit Pills */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-2xl bg-slate-900/70 border border-slate-800 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 shrink-0">
                <Download className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-white block">File Digital Privat</span>
                <span className="text-[10px] text-slate-400">Unduh Aman dari R2</span>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-slate-900/70 border border-slate-800 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 shrink-0">
                <Key className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-white block">Lisensi Atomik</span>
                <span className="text-[10px] text-slate-400">Kode Kirim Otomatis</span>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-slate-900/70 border border-slate-800 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 shrink-0">
                <Smartphone className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-white block">HeroSMS Live OTP</span>
                <span className="text-[10px] text-slate-400">Aktivasi Langsung</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Category Chips */}
      <div role="tablist" aria-label="Kategori Produk" className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
        <button
          type="button"
          role="tab"
          aria-selected={selectedCategory === null}
          onClick={() => handleSelectCategory(null)}
          className={`px-4 min-h-[44px] rounded-xl text-xs font-bold whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-indigo-500 ${
            selectedCategory === null
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          Semua Produk
        </button>
        {visibleCategories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            role="tab"
            aria-selected={selectedCategory === cat.slug}
            onClick={() => handleSelectCategory(cat.slug)}
            className={`px-4 min-h-[44px] rounded-xl text-xs font-bold whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              selectedCategory === cat.slug
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-3 lg:hidden">
        <div>
          <p className="text-xs font-extrabold text-white">Temukan produk</p>
          {!loading && <p className="mt-1 text-[11px] text-slate-400">{pagination.total} produk{activeFilterCount > 0 ? ` · ${activeFilterCount} filter aktif` : ''}</p>}
        </div>
        <button type="button" onClick={() => setFilterSheetOpen(true)} aria-expanded={filterSheetOpen} aria-controls="catalog-filter-sheet" className="flex min-h-[44px] items-center gap-2 rounded-xl border border-indigo-500/50 bg-indigo-500/10 px-3 text-xs font-bold text-indigo-200 focus-visible:ring-2 focus-visible:ring-indigo-400"><Filter className="h-4 w-4" /> Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</button>
      </div>

      <section aria-label="Filter dan urutan katalog" className="hidden space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5 lg:block">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-indigo-400" aria-hidden="true" />
            <h2 className="text-sm font-extrabold text-white">Temukan produk</h2>
            {!loading && <span className="text-[11px] text-slate-400">{pagination.total} produk</span>}
          </div>
          <button
            type="button"
            onClick={resetFilters}
            className="min-h-[40px] px-3 rounded-xl border border-slate-700 text-xs font-bold text-slate-300 hover:text-white hover:border-slate-500 focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Reset filter
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="space-y-1.5 text-xs font-semibold text-slate-300">
            <span>Tipe produk</span>
            <select
              value={selectedType}
              onChange={(e) => updateParam('type', e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-white focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <option value="">Semua tipe</option>
              <option value="file">File digital</option>
              <option value="code">Kode / voucher</option>
              <option value="herosms">OTP SMS</option>
            </select>
          </label>

          <label className="space-y-1.5 text-xs font-semibold text-slate-300">
            <span>Urutkan</span>
            <select
              value={selectedSort}
              onChange={(e) => updateParam('sort', e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-white focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <option value="newest">Terbaru</option>
              <option value="best_selling">Paling laku</option>
              <option value="price_asc">Harga terendah</option>
              <option value="price_desc">Harga tertinggi</option>
            </select>
          </label>

          <label className="space-y-1.5 text-xs font-semibold text-slate-300">
            <span>Harga minimum</span>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={minPrice}
              onChange={(e) => updateParam('min_price', e.target.value)}
              placeholder="Rp 0"
              className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-400"
            />
          </label>

          <label className="space-y-1.5 text-xs font-semibold text-slate-300">
            <span>Harga maksimum</span>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={maxPrice}
              onChange={(e) => updateParam('max_price', e.target.value)}
              placeholder="Tanpa batas"
              className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-400"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="space-y-1.5 text-xs font-semibold text-slate-300">
            <span>Layanan</span>
            <input
              type="search"
              value={service}
              onChange={(e) => updateParam('service', e.target.value.trim())}
              placeholder="Contoh: Telegram"
              className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-400"
            />
          </label>

          <label className="space-y-1.5 text-xs font-semibold text-slate-300">
            <span>Negara</span>
            <input
              type="search"
              value={country}
              onChange={(e) => updateParam('country', e.target.value.trim())}
              placeholder="Kode negara"
              className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-400"
            />
          </label>

          <label className="flex items-center gap-3 min-h-[44px] rounded-xl border border-slate-800 bg-slate-900/60 px-3 text-xs font-semibold text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={inStock}
              onChange={(e) => updateParam('in_stock', e.target.checked ? '1' : '')}
              className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-2 focus:ring-indigo-500"
            />
            Tersedia sekarang
          </label>

          <label className="flex items-center gap-3 min-h-[44px] rounded-xl border border-slate-800 bg-slate-900/60 px-3 text-xs font-semibold text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={instantOnly}
              onChange={(e) => updateParam('instant', e.target.checked ? '1' : '')}
              className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-2 focus:ring-indigo-500"
            />
            Pengiriman instan
          </label>
        </div>
      </section>

      <FilterSheet open={filterSheetOpen} values={filterValues} activeCount={activeFilterCount} onApply={applyFilters} onReset={resetFilters} onClose={() => setFilterSheetOpen(false)} />

      {/* Error state */}
      {error && (
        <div className="p-6 glass-panel rounded-3xl border border-rose-800/50 bg-rose-950/20 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
          <p className="text-sm font-semibold text-rose-300">{error}</p>
          <button
            type="button"
            onClick={() => fetchProducts()}
            className="px-4 py-2 min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Coba Lagi
          </button>
        </div>
      )}

      {/* Catalog Grid or Skeletons */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      ) : products.length === 0 && !error ? (
        <div className="py-16 text-center glass-panel rounded-3xl border border-slate-800 max-w-md mx-auto p-8 space-y-3">
          <p className="text-slate-300 font-semibold text-sm">Tidak ada produk ditemukan.</p>
          <p className="text-slate-400 text-xs">Coba ubah kata kunci pencarian atau pilih kategori lain.</p>
          <button
            onClick={() => {
              setSearchParams({});
            }}
            className="px-4 py-2 min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all"
          >
            Reset Filter
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>

          {pagination.totalPages > 1 && (
            <nav aria-label="Pagination katalog" className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => goToPage(currentPage - 1)}
                disabled={!pagination.hasPrevious}
                className="min-h-[44px] px-3 rounded-xl border border-slate-700 bg-slate-900 text-slate-300 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-indigo-500"
                aria-label="Halaman sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              </button>
              <span className="text-xs font-bold text-slate-300" aria-live="polite">
                Halaman {pagination.page} dari {pagination.totalPages}
              </span>
              <button
                type="button"
                onClick={() => goToPage(currentPage + 1)}
                disabled={!pagination.hasNext}
                className="min-h-[44px] px-3 rounded-xl border border-slate-700 bg-slate-900 text-slate-300 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-indigo-500"
                aria-label="Halaman berikutnya"
              >
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </nav>
          )}
        </>
      )}
    </main>
  );
};
