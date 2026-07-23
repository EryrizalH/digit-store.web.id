// ponytail: Mobile-first Navbar with strict 44x44px touch targets down to 320px viewport, text compacting & aria-labels
import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { ShoppingBag, User, LogOut, ShieldCheck, KeyRound, Search, X, Smartphone } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

export const Navbar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, logout } = useAuth();
  const { totalItemsCount } = useCart();

  const [searchInput, setSearchInput] = useState(searchParams.get('q') || '');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  // Sync search input state when URL searchParam changes
  useEffect(() => {
    setSearchInput(searchParams.get('q') || '');
  }, [searchParams]);

  // Debounced update to URL q query param (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      if (location.pathname === '/' || location.pathname === '') {
        const currentQ = searchParams.get('q') || '';
        if (searchInput !== currentQ) {
          const newParams = new URLSearchParams(searchParams);
          if (searchInput.trim()) {
            newParams.set('q', searchInput.trim());
          } else {
            newParams.delete('q');
          }
          setSearchParams(newParams, { replace: true });
        }
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [searchInput, location.pathname, searchParams, setSearchParams]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (location.pathname !== '/') {
      navigate(`/?q=${encodeURIComponent(searchInput.trim())}`);
    }
  };

  return (
    <nav className="sticky top-0 z-40 glass-panel border-b border-slate-800/80 px-2 sm:px-4 lg:px-8 py-2.5 sm:py-3 pt-safe">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-1.5 sm:gap-3">
        {/* Brand Logo */}
        <Link
          to="/"
          aria-label="DigitStore Beranda"
          title="DigitStore Beranda"
          className="flex items-center gap-2 group focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-xl p-0.5 shrink-0"
        >
          <div className="w-11 h-11 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-emerald-400 p-0.5 glow-primary transition-transform group-hover:scale-105">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <ShoppingBag className="w-5 h-5 text-indigo-400 group-hover:text-emerald-400 transition-colors" />
            </div>
          </div>
          <span className="hidden sm:inline-block text-lg sm:text-xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-300 via-white to-emerald-300 bg-clip-text text-transparent">
            DigitStore
          </span>
        </Link>

        {/* Desktop Search Bar */}
        <form onSubmit={handleSearchSubmit} className="flex-1 max-w-md hidden md:block relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Cari file, lisensi, atau aktivasi SMS..."
            className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-10 pr-4 min-h-[44px] text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 transition-all"
          />
        </form>

        {/* Action Controls */}
        <div className="flex items-center gap-1 sm:gap-2.5 shrink-0">
          {/* Mobile Search Toggle */}
          <button
            onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
            className="md:hidden w-11 h-11 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 flex items-center justify-center shrink-0 focus-visible:ring-2 focus-visible:ring-indigo-500"
            aria-label="Cari"
            title="Cari"
          >
            {mobileSearchOpen ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
          </button>

          {/* Desktop Katalog Link */}
          <Link
            to="/"
            className={`hidden sm:flex px-3.5 min-h-[44px] text-xs font-semibold rounded-xl transition-all items-center justify-center ${
              location.pathname === '/'
                ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Katalog
          </Link>

          {/* HeroSMS OTP Link — responsive & keyboard-accessible with 44px touch target on mobile */}
          <Link
            to="/produk/herosms-otp-configurator"
            aria-label="HeroSMS OTP"
            title="HeroSMS OTP"
            className={`w-11 h-11 sm:w-auto sm:px-3.5 sm:min-h-[44px] text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 shrink-0 focus-visible:ring-2 focus-visible:ring-purple-500 ${
              location.pathname === '/produk/herosms-otp-configurator'
                ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-5 h-5 sm:w-4 sm:h-4 text-purple-400" />
            <span className="hidden sm:inline">HeroSMS OTP</span>
          </Link>

          {user && (
            <Link
              to="/pesanan"
              aria-label="Pesanan Saya"
              title="Pesanan Saya"
              className={`w-11 h-11 sm:w-auto sm:px-3.5 sm:min-h-[44px] text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 shrink-0 focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                location.pathname.startsWith('/pesanan')
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <KeyRound className="w-5 h-5 sm:w-4 sm:h-4 text-indigo-400" />
              <span className="hidden sm:inline">Pesanan Saya</span>
            </Link>
          )}

          {user?.role === 'admin' && (
            <Link
              to="/admin"
              aria-label="Admin Panel"
              title="Admin Panel"
              className={`w-11 h-11 sm:w-auto sm:px-3.5 sm:min-h-[44px] text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 shrink-0 focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                location.pathname === '/admin'
                  ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-emerald-400 hover:text-emerald-300'
              }`}
            >
              <ShieldCheck className="w-5 h-5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Admin</span>
            </Link>
          )}

          {/* Cart Button */}
          <Link
            to="/keranjang"
            className="relative w-11 h-11 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-all flex items-center justify-center shrink-0 focus-visible:ring-2 focus-visible:ring-indigo-500"
            aria-label="Keranjang Belanja"
            title="Keranjang Belanja"
          >
            <ShoppingBag className="w-5 h-5" />
            {totalItemsCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gradient-to-r from-indigo-500 to-emerald-500 text-white font-extrabold text-xs flex items-center justify-center rounded-full shadow-md">
                {totalItemsCount}
              </span>
            )}
          </Link>

          {/* Auth Button / Profile */}
          {user ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="hidden lg:flex flex-col text-right">
                <span className="text-xs font-semibold text-slate-200 truncate max-w-[120px]">
                  {user.email}
                </span>
                <span className="text-[10px] text-slate-400 capitalize">{user.role}</span>
              </div>
              <button
                onClick={logout}
                title="Keluar"
                aria-label="Keluar"
                className="w-11 h-11 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-500/30 transition-all flex items-center justify-center shrink-0 focus-visible:ring-2 focus-visible:ring-rose-500"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <Link
              to="/masuk"
              aria-label="Masuk"
              title="Masuk"
              className="w-11 h-11 sm:w-auto sm:px-4 sm:min-h-[44px] rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-xs font-bold shadow-lg shadow-indigo-500/20 transition-all flex items-center gap-1.5 justify-center shrink-0 focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <User className="w-5 h-5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Masuk</span>
            </Link>
          )}
        </div>
      </div>

      {/* Mobile Search Expanded Bar */}
      {mobileSearchOpen && (
        <form onSubmit={handleSearchSubmit} className="mt-2 md:hidden">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Cari file, lisensi, atau SMS..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 min-h-[44px] text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </form>
      )}
    </nav>
  );
};
