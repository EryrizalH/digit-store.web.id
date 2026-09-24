import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, CircleHelp, Home, KeyRound, LogIn, LogOut, ShieldCheck, ShoppingBag, Smartphone, UserPlus, Wallet, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
  notifications: any[];
  unreadNotifications: number;
  referralCode: string | null;
  creditBalance: number | null;
  onReadNotification: (notification: any) => void;
}

const linkClass = (active: boolean) => `flex min-h-[48px] items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-indigo-400 ${
  active ? 'bg-indigo-500/15 text-indigo-200' : 'text-slate-300 hover:bg-slate-900 hover:text-white'
}`;

export const MobileMenu: React.FC<MobileMenuProps> = ({
  open,
  onClose,
  notifications,
  unreadNotifications,
  referralCode,
  creditBalance,
  onReadNotification
}) => {
  const location = useLocation();
  const { user, logout, openAuthModal } = useAuth();
  const menuRef = useFocusTrap<HTMLDivElement>(open, onClose);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  const handleLinkClick = () => onClose();
  const handleLogout = () => {
    logout();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      id="mobile-menu-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-menu-title"
      tabIndex={-1}
      className="fixed inset-0 z-50 bg-black/65 lg:hidden"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-y-0 right-0 flex w-[min(23rem,calc(100vw-0.75rem))] flex-col border-l border-slate-800 bg-[#0b101c] shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-800 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-300">Navigasi</p>
            <h2 id="mobile-menu-title" className="mt-1 text-lg font-extrabold text-white">Menu DigitStore</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup menu"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-300 focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {user && (
            <div className="mb-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
              <p className="truncate text-sm font-bold text-white">{user.email}</p>
              <p className="mt-1 text-[11px] text-slate-400">{user.is_guest ? 'Sesi tamu' : `Akun ${user.role}`}</p>
              {referralCode && <p className="mt-1 text-[10px] text-indigo-300">Referral: {referralCode}</p>}
              {creditBalance !== null && (
                <Link to="/topup" onClick={handleLinkClick} className="mt-3 flex min-h-[44px] items-center justify-between rounded-xl border border-emerald-800/60 bg-emerald-950/30 px-3 text-xs font-bold text-emerald-200 focus-visible:ring-2 focus-visible:ring-emerald-400">
                  <span className="flex items-center gap-2"><Wallet className="h-4 w-4" /> Saldo kredit</span>
                  <span>{new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 0 }).format(creditBalance)}</span>
                </Link>
              )}
            </div>
          )}

          <nav aria-label="Navigasi mobile" className="space-y-1">
            <Link to="/" onClick={handleLinkClick} className={linkClass(location.pathname === '/')}><Home className="h-5 w-5 text-indigo-300" /> Katalog produk</Link>
            <Link to="/produk/herosms-otp-configurator" onClick={handleLinkClick} className={linkClass(location.pathname === '/produk/herosms-otp-configurator')}><Smartphone className="h-5 w-5 text-purple-300" /> HeroSMS OTP</Link>
            <Link to="/keranjang" onClick={handleLinkClick} className={linkClass(location.pathname === '/keranjang')}><ShoppingBag className="h-5 w-5 text-indigo-300" /> Keranjang</Link>
            {user && <Link to="/pesanan" onClick={handleLinkClick} className={linkClass(location.pathname.startsWith('/pesanan'))}><KeyRound className="h-5 w-5 text-indigo-300" /> Pesanan saya</Link>}
            {user && <Link to="/topup" onClick={handleLinkClick} className={linkClass(location.pathname.startsWith('/topup'))}><Wallet className="h-5 w-5 text-emerald-300" /> Top-up kredit</Link>}
            <Link to="/bantuan" onClick={handleLinkClick} className={linkClass(location.pathname === '/bantuan')}><CircleHelp className="h-5 w-5 text-slate-300" /> Bantuan & kebijakan</Link>
            {user?.role === 'admin' && <Link to="/admin" onClick={handleLinkClick} className={linkClass(location.pathname === '/admin')}><ShieldCheck className="h-5 w-5 text-emerald-300" /> Admin</Link>}
          </nav>

          {user && (
            <section className="mt-6 border-t border-slate-800 pt-4" aria-labelledby="mobile-notifications-title">
              <div className="flex items-center justify-between gap-3">
                <h3 id="mobile-notifications-title" className="flex items-center gap-2 text-xs font-extrabold text-white"><Bell className="h-4 w-4 text-indigo-300" /> Notifikasi</h3>
                {unreadNotifications > 0 && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">{unreadNotifications > 9 ? '9+' : unreadNotifications} baru</span>}
              </div>
              {notifications.length === 0 ? (
                <p className="mt-3 rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-xs text-slate-500">Belum ada notifikasi.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {notifications.slice(0, 5).map((notification) => (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => onReadNotification(notification)}
                      className={`w-full rounded-xl border p-3 text-left focus-visible:ring-2 focus-visible:ring-indigo-400 ${notification.read_at ? 'border-slate-800 bg-slate-900/40 opacity-65' : 'border-indigo-800/60 bg-indigo-950/30'}`}
                    >
                      <span className="block text-xs font-bold text-slate-200">{notification.title}</span>
                      <span className="mt-1 block text-[11px] leading-relaxed text-slate-400">{notification.message}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          <div className="mt-6 border-t border-slate-800 pt-4">
            {user ? (
              <>
                {user.is_guest && (
                  <button type="button" onClick={() => { openAuthModal('register'); onClose(); }} className="mb-2 flex min-h-[48px] w-full items-center gap-3 rounded-xl border border-amber-800/70 bg-amber-950/20 px-3 text-sm font-bold text-amber-200 focus-visible:ring-2 focus-visible:ring-amber-400"><UserPlus className="h-5 w-5" /> Amankan akun tamu</button>
                )}
                <button type="button" onClick={handleLogout} className="flex min-h-[48px] w-full items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 px-3 text-sm font-bold text-rose-300 focus-visible:ring-2 focus-visible:ring-rose-400"><LogOut className="h-5 w-5" /> Keluar</button>
              </>
            ) : (
              <Link to="/masuk" onClick={handleLinkClick} className="flex min-h-[48px] items-center gap-3 rounded-xl bg-indigo-600 px-3 text-sm font-bold text-white focus-visible:ring-2 focus-visible:ring-indigo-400"><LogIn className="h-5 w-5" /> Masuk atau daftar</Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
