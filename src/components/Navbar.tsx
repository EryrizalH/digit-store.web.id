import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Bell, KeyRound, LogOut, Menu, Search, ShoppingBag, Smartphone, User, Wallet, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { MobileMenu } from './MobileMenu';

export const Navbar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, logout, openAuthModal } = useAuth();
  const { totalItemsCount } = useCart();

  const [searchInput, setSearchInput] = useState(searchParams.get('q') || '');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setCreditBalance(null);
      return;
    }
    fetch('/api/credits/balance')
      .then((res) => res.ok ? res.json() : null)
      .then((data: any) => {
        if (data && typeof data.balance === 'number') setCreditBalance(data.balance);
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) {
      setReferralCode(null);
      return;
    }
    fetch('/api/auth/referral-code')
      .then((res) => res.ok ? res.json() : null)
      .then((data: any) => setReferralCode(data?.referralCode || null))
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadNotifications(0);
      return;
    }

    let cancelled = false;
    const loadNotifications = async () => {
      try {
        const res = await fetch('/api/notifications');
        if (!res.ok || cancelled) return;
        const data = await res.json() as any;
        if (!cancelled) {
          setNotifications(data.notifications || []);
          setUnreadNotifications(Number(data.unreadCount || 0));
        }
      } catch {
        // Notifications are optional and should not block navigation.
      }
    };

    loadNotifications();
    const timer = window.setInterval(loadNotifications, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [user]);

  const markNotificationRead = async (notification: any) => {
    if (!notification.read_at) {
      await fetch(`/api/notifications/${notification.id}/read`, { method: 'POST' }).catch(() => {});
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item));
      setUnreadNotifications((count) => Math.max(0, count - 1));
    }
    if (notification.order_id) navigate(`/pesanan/${notification.order_id}`);
    setNotificationsOpen(false);
    setMobileMenuOpen(false);
  };

  useEffect(() => {
    setSearchInput(searchParams.get('q') || '');
  }, [searchParams]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (location.pathname !== '/') return;
      const currentQ = searchParams.get('q') || '';
      if (searchInput === currentQ) return;
      const next = new URLSearchParams(searchParams);
      if (searchInput.trim()) next.set('q', searchInput.trim());
      else next.delete('q');
      setSearchParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(handler);
  }, [searchInput, location.pathname, searchParams, setSearchParams]);

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (location.pathname !== '/') navigate(`/?q=${encodeURIComponent(searchInput.trim())}`);
  };

  const navLinkClass = (active: boolean, tone: 'indigo' | 'purple' | 'emerald' = 'indigo') => {
    const activeClass = tone === 'purple'
      ? 'bg-purple-600/20 text-purple-300 border-purple-500/30'
      : tone === 'emerald'
        ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30'
        : 'bg-indigo-600/20 text-indigo-300 border-indigo-500/30';
    return `hidden min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold transition-all focus-visible:ring-2 lg:flex ${active ? `border ${activeClass}` : tone === 'emerald' ? 'text-emerald-400 hover:text-emerald-300' : 'text-slate-400 hover:text-slate-200'}`;
  };

  return (
    <>
      <nav className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#0d1322] px-3 py-2.5 pt-safe sm:px-4 sm:py-3 lg:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 sm:gap-3">
          <Link to="/" aria-label="DigitStore Beranda" title="DigitStore Beranda" className="group flex shrink-0 items-center gap-2 rounded-xl p-0.5 focus-visible:ring-2 focus-visible:ring-indigo-500">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-emerald-400 p-0.5 transition-transform group-hover:scale-105 sm:h-10 sm:w-10">
              <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-slate-950">
                <ShoppingBag className="h-5 w-5 text-indigo-400 transition-colors group-hover:text-emerald-400" />
              </div>
            </div>
            <span className="hidden text-lg font-extrabold tracking-tight text-slate-100 sm:inline-block sm:text-xl">DigitStore</span>
          </Link>

          <form onSubmit={handleSearchSubmit} className="relative hidden max-w-md flex-1 lg:block">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input id="desktop-search-input" aria-label="Cari produk" type="text" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Cari file, lisensi, atau aktivasi SMS..." className="min-h-[44px] w-full rounded-xl border border-slate-800 bg-slate-900 px-4 pl-10 text-sm text-slate-200 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400" />
          </form>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
            <button type="button" onClick={() => setMobileSearchOpen((open) => !open)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-300 focus-visible:ring-2 focus-visible:ring-indigo-500 lg:hidden" aria-label="Cari" aria-expanded={mobileSearchOpen} aria-controls="mobile-search-bar" title="Cari">
              {mobileSearchOpen ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
            </button>

            <Link to="/" className={navLinkClass(location.pathname === '/')}>Katalog</Link>

            <Link to="/produk/herosms-otp-configurator" aria-label="Aktivasi SMS OTP" title="Aktivasi SMS OTP" className={navLinkClass(location.pathname === '/produk/herosms-otp-configurator', 'purple')}>
              <Smartphone className="h-4 w-4 text-purple-400" />
              Aktivasi SMS OTP
            </Link>

            {user && <Link to="/pesanan" aria-label="Pesanan Saya" title="Pesanan Saya" className={navLinkClass(location.pathname.startsWith('/pesanan'))}><KeyRound className="h-4 w-4 text-indigo-400" /> Pesanan Saya</Link>}

            {user?.role === 'admin' && <Link to="/admin" aria-label="Admin Panel" title="Admin Panel" className={navLinkClass(location.pathname === '/admin', 'emerald')}>Admin</Link>}

            {user && creditBalance !== null && <Link to="/topup" aria-label="Saldo Kredit" title="Saldo Kredit" className={`hidden h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3.5 text-xs font-semibold text-emerald-300 transition-all focus-visible:ring-2 focus-visible:ring-emerald-500 lg:flex ${location.pathname === '/topup' ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-800 bg-slate-900 hover:border-emerald-500/30 hover:bg-emerald-500/5'}`}>
              <Wallet className="h-4 w-4" />
              <span>{new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 0 }).format(creditBalance)}</span>
            </Link>}

            {user && <div className="relative hidden lg:block">
              <button type="button" onClick={() => setNotificationsOpen((open) => !open)} aria-label="Notifikasi" aria-expanded={notificationsOpen} className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-300 hover:text-white focus-visible:ring-2 focus-visible:ring-indigo-500">
                <Bell className="h-5 w-5" />
                {unreadNotifications > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{unreadNotifications > 9 ? '9+' : unreadNotifications}</span>}
              </button>
              {notificationsOpen && <div className="absolute right-0 top-12 z-50 w-80 max-w-[calc(100vw-1rem)] rounded-2xl border border-slate-700 bg-slate-950 p-3 shadow-2xl">
                <div className="flex items-center justify-between px-2 pb-2"><strong className="text-xs text-white">Notifikasi</strong><span className="text-[10px] text-slate-500">30 terbaru</span></div>
                {notifications.length === 0 ? <p className="px-2 py-5 text-center text-xs text-slate-500">Belum ada notifikasi.</p> : <div className="max-h-72 space-y-1 overflow-y-auto">{notifications.slice(0, 8).map((notification) => <button key={notification.id} type="button" onClick={() => markNotificationRead(notification)} className={`w-full rounded-xl p-2 text-left hover:bg-slate-900 ${notification.read_at ? 'opacity-60' : 'bg-indigo-950/30'}`}><span className="block text-xs font-bold text-slate-200">{notification.title}</span><span className="mt-0.5 block text-[11px] leading-relaxed text-slate-400">{notification.message}</span></button>)}</div>}
              </div>}
            </div>}

            <Link to="/keranjang" className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-300 transition-all hover:border-slate-700 hover:text-white focus-visible:ring-2 focus-visible:ring-indigo-500" aria-label="Keranjang Belanja" title="Keranjang Belanja">
              <ShoppingBag className="h-5 w-5" />
              {totalItemsCount > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-xs font-extrabold text-white">{totalItemsCount}</span>}
            </Link>

            {user ? <div className="flex shrink-0 items-center gap-1.5">
              <div className="hidden flex-col text-right lg:flex"><span className="max-w-[120px] truncate text-xs font-semibold text-slate-200">{user.email}</span><span className="text-[10px] capitalize text-slate-400">{user.is_guest ? 'tamu' : user.role === 'admin' ? 'admin' : 'terdaftar'}</span>{referralCode && <span className="text-[9px] text-indigo-300">Referral: {referralCode}</span>}</div>
              {user.is_guest && <button type="button" onClick={() => openAuthModal('register')} className="hidden min-h-[40px] rounded-xl border border-amber-700/60 px-2.5 text-[10px] font-bold text-amber-300 hover:bg-amber-950/40 lg:inline-flex">Amankan akun</button>}
              <button type="button" onClick={logout} title="Keluar" aria-label="Keluar" className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-400 transition-all hover:border-rose-500/30 hover:text-rose-400 focus-visible:ring-2 focus-visible:ring-rose-500 lg:flex"><LogOut className="h-5 w-5" /></button>
            </div> : <Link to="/masuk" aria-label="Masuk" title="Masuk" className="hidden min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white transition-all hover:bg-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 lg:flex"><User className="h-4 w-4" /> Masuk</Link>}

            <button type="button" onClick={() => setMobileMenuOpen(true)} aria-label="Buka menu" aria-expanded={mobileMenuOpen} aria-controls="mobile-menu-panel" className="flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-2.5 text-xs font-bold text-slate-200 focus-visible:ring-2 focus-visible:ring-indigo-500 lg:hidden"><Menu className="h-4 w-4" /><span>Menu</span></button>
          </div>
        </div>

        {mobileSearchOpen && <form id="mobile-search-bar" onSubmit={handleSearchSubmit} className="mt-2 lg:hidden">
          <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="mobile-search-input" aria-label="Cari produk" type="text" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Cari file, lisensi, atau SMS..." className="min-h-[44px] w-full rounded-xl border border-slate-800 bg-slate-900 px-4 pl-10 text-sm text-slate-200 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400" /></div>
        </form>}
      </nav>

      <MobileMenu open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} notifications={notifications} unreadNotifications={unreadNotifications} referralCode={referralCode} creditBalance={creditBalance} onReadNotification={markNotificationRead} />
    </>
  );
};
