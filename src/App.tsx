import React, { useState, useEffect } from 'react';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { Navbar } from './components/Navbar';
import { ProductCard } from './components/ProductCard';
import { ProductDetailModal } from './components/ProductDetailModal';
import { CartDrawer } from './components/CartDrawer';
import { AuthModal } from './components/AuthModal';
import { OrdersView } from './components/OrdersView';
import { AdminPanel } from './components/AdminPanel';
import { Product, Category } from './types';
import { Download, Key, Smartphone, Sparkles, Shield, Zap } from 'lucide-react';

export const MainContent: React.FC = () => {
  const [currentView, setCurrentView] = useState<'catalog' | 'orders' | 'admin'>('catalog');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProducts = async () => {
    try {
      let url = '/api/products';
      const params = new URLSearchParams();
      if (selectedCategory) params.append('category', selectedCategory);
      if (searchQuery) params.append('q', searchQuery);
      if (params.toString()) url += `?${params.toString()}`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/products/categories');
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [selectedCategory, searchQuery]);

  return (
    <div className="min-h-screen flex flex-col bg-[#090d16] text-slate-100">
      <Navbar
        currentView={currentView}
        setCurrentView={(v: any) => setCurrentView(v)}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />

      {currentView === 'catalog' && (
        <main className="flex-1 max-w-7xl w-full mx-auto py-8 px-4 lg:px-8 space-y-8">
          {/* Hero Section */}
          <div className="relative overflow-hidden glass-panel rounded-3xl p-8 sm:p-12 border border-slate-800/80 bg-gradient-to-br from-indigo-950/40 via-slate-900/60 to-slate-950">
            <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute bottom-0 left-1/3 -mb-16 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

            <div className="relative z-10 max-w-2xl">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 mb-4">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Cloudflare Workers Full-Stack MVP
              </span>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight mb-4">
                Toko Produk Digital & <span className="bg-gradient-to-r from-indigo-400 via-white to-emerald-400 bg-clip-text text-transparent">Aktivasi HeroSMS OTP</span>
              </h1>
              <p className="text-sm sm:text-base text-slate-400 leading-relaxed mb-6">
                Unduh file privat instan dari R2 Storage, dapatkan kode lisensi voucher otomatis, dan kelola nomor OTP HeroSMS secara online dan real-time.
              </p>

              {/* Feature Pills */}
              <div className="grid grid-cols-3 gap-3 pt-2">
                <div className="p-3 rounded-2xl bg-slate-900/70 border border-slate-800 flex items-center gap-2.5">
                  <Download className="w-5 h-5 text-blue-400 shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-white block">File Privat</span>
                    <span className="text-[10px] text-slate-400">Unduh R2</span>
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-slate-900/70 border border-slate-800 flex items-center gap-2.5">
                  <Key className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-white block">Stok Atomik</span>
                    <span className="text-[10px] text-slate-400">Voucher Kode</span>
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-slate-900/70 border border-slate-800 flex items-center gap-2.5">
                  <Smartphone className="w-5 h-5 text-purple-400 shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-white block">HeroSMS</span>
                    <span className="text-[10px] text-slate-400">Live OTP</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Category Filter Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
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
                onClick={() => setSelectedCategory(cat.slug)}
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  selectedCategory === cat.slug
                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-md'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Product Grid */}
          {loading ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              Memuat katalog produk...
            </div>
          ) : products.length === 0 ? (
            <div className="py-16 text-center glass-panel rounded-3xl border border-slate-800 max-w-md mx-auto p-8">
              <p className="text-slate-400 text-sm">Tidak ada produk ditemukan.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onSelectProduct={(p) => setSelectedProduct(p)}
                />
              ))}
            </div>
          )}
        </main>
      )}

      {currentView === 'orders' && <OrdersView />}
      {currentView === 'admin' && <AdminPanel />}

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-800/80 py-6 px-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>© 2026 DigitStore — Digital Store Cloudflare Workers Free Tier</span>
          <span className="flex items-center gap-2 text-[11px]">
            <span>D1 DB</span> • <span>R2 Storage</span> • <span>KV Rate-Limit</span> • <span>Hono + React</span>
          </span>
        </div>
      </footer>

      {/* Modals & Drawers */}
      <ProductDetailModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />

      <CartDrawer
        onSuccessOrder={(orderId) => {
          setCurrentView('orders');
        }}
      />

      <AuthModal />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <CartProvider>
        <MainContent />
      </CartProvider>
    </AuthProvider>
  );
};
