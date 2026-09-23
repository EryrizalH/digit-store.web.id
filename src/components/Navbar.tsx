import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { ShoppingBag, User, LogOut, ShieldCheck, KeyRound, Search, X, Smartphone, Wallet, Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

export const Navbar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, logout, openAuthModal } = useAuth();
  const { totalItemsCount } = useCart();

  const [searchInput, setSearchInput] = useState(searchParams.get('q') || '');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);

  // Fetch credit balance when user is logged in
  useEffect(() => {
    if (user) {
      fetch('/api/credits/balance')
        .then(res => res.ok ? res.json() : null)
        .then((data: any) => {
          if (data && typeof data.balance === 'number') {
            setCreditBalance(data.balance);
          }
        })
        .catch(() => {});
    } else {
      setCreditBalance(null);
    }
  }, [user]);

  useEffect(() => {
    if (!user) { setReferralCode(null); return; }
    fetch('/api/auth/referral-code').then((res) => res.ok ? res.json() : null).then((data: any) => setReferralCode(data?.referralCode || null)).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) { setNotifications([]); setUnreadNotifications(0); return; }
    let cancelled = false;
    const loadNotifications = async () => {
      try {
        const res = await fetch('/api/notifications');
        if (!res.ok || cancelled) return;
        const data = await res.json() as any;
        if (!cancelled) { setNotifications(data.notifications || []); setUnreadNotifications(Number(data.unreadCount || 0)); }
      } catch { /* notifications are optional */ }
    };
    loadNotifications();
    const timer = window.setInterval(loadNotifications, 20000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [user]);

  const markNotificationRead = async (notification: any) => {
    if (!notification.read_at) {
      await fetch(`/api/notifications/${notification.id}/read`, { method: 'POST' }).catch(() => {});
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item));
      setUnreadNotifications((count) => Math.max(0, count - 1));
    }
    if (notification.order_id) navigate(`/pesanan/${notification.order_id}`);
    setNotificationsOpen(false);
  };

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
            id="desktop-search-input"
            aria-label="Cari produk"
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Cari file, lisensi, atau aktivasi SMS..."
            className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-10 pr-4 min-h-[44px] text-sm text-slate-200 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-400 transition-all"
          />
        </form>

        {/* Action Controls */}
        <div className="flex items-center gap-1 sm:gap-2.5 shrink-0">
          {/* Mobile Search Toggle */}
          <button
            type="button"
            onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
            className="md:hidden w-11 h-11 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 flex items-center justify-center shrink-0 focus-visible:ring-2 focus-visible:ring-indigo-500"
            aria-label="Cari"
            aria-expanded={mobileSearchOpen}
            aria-controls="mobile-search-bar"
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

          {/* Credit Balance Badge */}
          {user && creditBalance !== null && (
            <Link
              to="/topup"
              aria-label="Saldo Kredit"
              title="Saldo Kredit"
              className={`h-11 px-2.5 sm:px-3.5 min-h-[44px] text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 shrink-0 focus-visible:ring-2 focus-visible:ring-emerald-500 border ${
                location.pathname === '/topup'
                  ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                  : 'border-slate-800 bg-slate-900 text-emerald-400 hover:border-emerald-500/30 hover:bg-emerald-500/5'
              }`}
            >
              <Wallet className="w-4 h-4" />
              <span className="text-[11px] sm:text-xs font-black">
                {new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 0 }).format(creditBalance)}
              </span>
            </Link>
          )}

          {/* Cart Button */}
          {user && (
            <div className="relative">
              <button type="button" onClick={() => setNotificationsOpen((open) => !open)} aria-label="Notifikasi" aria-expanded={notificationsOpen} className="relative w-11 h-11 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white flex items-center justify-center focus-visible:ring-2 focus-visible:ring-indigo-500">
                <Bell className="w-5 h-5" />
                {unreadNotifications > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 bg-rose-500 text-white font-bold text-[10px] flex items-center justify-center rounded-full">{unreadNotifications > 9 ? '9+' : unreadNotifications}</span>}
              </button>
              {notificationsOpen && <div className="absolute right-0 top-12 z-50 w-80 max-w-[calc(100vw-1rem)] rounded-2xl border border-slate-700 bg-slate-950 p-3 shadow-2xl"><div className="flex items-center justify-between px-2 pb-2"><strong className="text-xs text-white">Notifikasi</strong><span className="text-[10px] text-slate-500">30 terbaru</span></div>{notifications.length === 0 ? <p className="px-2 py-5 text-center text-xs text-slate-500">Belum ada notifikasi.</p> : <div className="max-h-72 space-y-1 overflow-y-auto">{notifications.slice(0, 8).map((notification) => <button key={notification.id} type="button" onClick={() => markNotificationRead(notification)} className={`w-full rounded-xl p-2 text-left hover:bg-slate-900 ${notification.read_at ? 'opacity-60' : 'bg-indigo-950/30'}`}><span className="block text-xs font-bold text-slate-200">{notification.title}</span><span className="mt-0.5 block text-[11px] leading-relaxed text-slate-400">{notification.message}</span></button>)}</div>}</div>}
            </div>
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
                <span className="text-[10px] text-slate-400 capitalize">{user.is_guest ? 'tamu' : user.role}</span>
                {referralCode && <span className="text-[9px] text-indigo-300" title="Bagikan kode ini ke teman">Referral: {referralCode}</span>}
              </div>
              {user.is_guest && <button type="button" onClick={() => openAuthModal('register')} className="hidden sm:inline-flex min-h-[40px] rounded-xl border border-amber-700/60 px-2.5 text-[10px] font-bold text-amber-300 hover:bg-amber-950/40">Amankan akun</button>}
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
        <form id="mobile-search-bar" onSubmit={handleSearchSubmit} className="mt-2 md:hidden">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="mobile-search-input"
              aria-label="Cari produk"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Cari file, lisensi, atau SMS..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 min-h-[44px] text-sm text-slate-200 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-400"
            />
          </div>
        </form>
      )}
    </nav>
  );
};
