// ponytail: Catalog page with benefit-led hero copy, URL-synced filters, category chips & skeleton/empty states
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Product, Category } from '../types';
import { ProductCard } from '../components/ProductCard';
import { ProductCardSkeleton } from '../components/Skeleton';
import { Download, Key, Smartphone, Sparkles, AlertCircle, RefreshCw } from 'lucide-react';

export const CatalogPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCategory = searchParams.get('category');
  const searchQuery = searchParams.get('q') || '';

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const fetchProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      let url = '/api/products';
      const params = new URLSearchParams();
      if (selectedCategory) params.append('category', selectedCategory);
      if (searchQuery) params.append('q', searchQuery);
      if (params.toString()) url += `?${params.toString()}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error('Gagal memuat produk dari server.');

      const data = (await res.json()) as any;
      setProducts(data.products || []);
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan jaringan');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [selectedCategory, searchQuery]);

  const handleSelectCategory = (slug: string | null) => {
    const newParams = new URLSearchParams(searchParams);
    if (slug) {
      newParams.set('category', slug);
    } else {
      newParams.delete('category');
    }
    setSearchParams(newParams);
  };

  return (
    <main className="flex-1 max-w-7xl w-full mx-auto py-6 sm:py-8 px-4 lg:px-8 space-y-8 pb-safe">
      {/* Benefit-Led Hero Section */}
      <div className="relative overflow-hidden glass-panel rounded-3xl p-6 sm:p-10 border border-slate-800/80 bg-gradient-to-br from-indigo-950/50 via-slate-900/80 to-slate-950">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-16 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 mb-3">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Platform Produk Digital Instan & Terpercaya
          </span>
          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight mb-3">
            Akses Instan <span className="bg-gradient-to-r from-indigo-400 via-white to-emerald-400 bg-clip-text text-transparent">File, Lisensi & OTP SMS</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed mb-6">
            Dapatkan source code & software dari Cloudflare R2 Storage, kode lisensi voucher otomatis, serta nomor penerima OTP HeroSMS secara online 24/7.
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
                <span className="text-[10px] text-slate-400">Aktivasi Online 24/7</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Category Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
        <button
          onClick={() => handleSelectCategory(null)}
          className={`px-4 min-h-[44px] rounded-xl text-xs font-bold whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-indigo-500 ${
            selectedCategory === null
              ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-md'
              : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          Semua Produk
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => handleSelectCategory(cat.slug)}
            className={`px-4 min-h-[44px] rounded-xl text-xs font-bold whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              selectedCategory === cat.slug
                ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-md'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Error state */}
      {error && (
        <div className="p-6 glass-panel rounded-3xl border border-rose-800/50 bg-rose-950/20 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
          <p className="text-sm font-semibold text-rose-300">{error}</p>
          <button
            onClick={fetchProducts}
            className="px-4 py-2 min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Coba Lagi
          </button>
        </div>
      )}

      {/* Catalog Grid or Skeletons */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      ) : products.length === 0 && !error ? (
        <div className="py-16 text-center glass-panel rounded-3xl border border-slate-800 max-w-md mx-auto p-8 space-y-3">
          <p className="text-slate-300 font-semibold text-sm">Tidak ada produk ditemukan.</p>
          <p className="text-slate-500 text-xs">Coba ubah kata kunci pencarian atau pilih kategori lain.</p>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </main>
  );
};
