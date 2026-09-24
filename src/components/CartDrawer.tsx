import React, { useEffect, useState } from 'react';
import { X, Trash2, Plus, Minus, QrCode, ArrowRight, AlertCircle, Mail, Wallet } from 'lucide-react';
import { useCart, getCartItemKey } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface CartDrawerProps {
  onSuccessOrder: (orderId: string) => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({ onSuccessOrder }) => {
  const { cart, isCartOpen, closeCart, removeFromCart, updateQuantity, updateOtpQuote, totalPrice, clearCart } = useCart();
  const { user, openAuthModal, guestCheckout } = useAuth();

  const [paymentProvider, setPaymentProvider] = useState<'qris' | 'credit'>('qris');
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [agreedPolicy, setAgreedPolicy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guestEmail, setGuestEmail] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [referralCode, setReferralCode] = useState('');

  // ponytail: hook traps Tab/Shift+Tab, auto-focuses close button, and restores focus on close
  const drawerRef = useFocusTrap<HTMLDivElement>(isCartOpen, closeCart);

  useEffect(() => {
    if (!isCartOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isCartOpen]);

  useEffect(() => {
    if (!user) {
      setCreditBalance(null);
      setPaymentProvider('qris');
      return;
    }
    fetch('/api/credits/balance')
      .then((res) => res.ok ? res.json() : null)
      .then((data: any) => {
        if (data && typeof data.balance === 'number') setCreditBalance(data.balance);
      })
      .catch(() => {});
  }, [user]);

  if (!isCartOpen) return null;

  const hasHeroSms = cart.some(item => item.product.type === 'herosms');

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(price);
  };

  const handleCheckout = async () => {
    if (paymentProvider === 'credit' && !user) {
      setError('Masuk terlebih dahulu untuk membayar menggunakan saldo.');
      openAuthModal('login');
      return;
    }
    if (hasHeroSms && !agreedPolicy) {
      setError('Wajib menyetujui Kebijakan Penggunaan Layanan SMS OTP sebelum checkout.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (!user) {
        if (!guestEmail.trim()) {
          setError('Masukkan email untuk menerima akses pesanan Anda.');
          return;
        }
        const guest = await guestCheckout(guestEmail.trim());
        if (!guest.success) {
          if (guest.error?.includes('sudah terdaftar')) openAuthModal('login');
          throw new Error(guest.error || 'Checkout tamu gagal');
        }
      }

      const idempotencyKey = `idemp_${Date.now()}_${Math.random()}`;
      const payload = {
        items: cart.map(item => ({
          product_id: item.product.id,
          quantity: item.quantity,
          service_code: item.serviceCode,
          country_code: item.countryCode,
          expires_at: item.expiresAt,
          price: item.price !== undefined ? item.price : item.product.price
        })),
        payment_provider: paymentProvider,
        idempotency_key: idempotencyKey,
        agreed_policy: agreedPolicy
        ,coupon_code: couponCode.trim() || undefined
        ,referral_code: referralCode.trim() || undefined
      };

      const res = await fetch('/api/orders/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const resText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(resText);
      } catch {
        throw new Error(resText || `Gagal memproses pesanan (HTTP ${res.status})`);
      }

      if (res.status === 409 || data.code === 'OTP_PRICE_CHANGED') {
        const fresh = data.freshQuote;
        if (fresh && fresh.serviceCode && fresh.countryCode && fresh.freshSellingPrice) {
          const pId = fresh.productId || cart.find(i => i.serviceCode === fresh.serviceCode)?.product.id || '';
          updateOtpQuote(pId, fresh.serviceCode, fresh.countryCode, {
            price: fresh.freshSellingPrice,
            expiresAt: fresh.expiresAt,
            quoteId: fresh.quoteId
          });
          const cartItem = cart.find(i => i.serviceCode === fresh.serviceCode);
          const serviceLabel = cartItem?.serviceName ? ` untuk ${cartItem.serviceName}` : '';
          const formattedPrice = formatPrice(fresh.freshSellingPrice);
          setError(`Harga layanan SMS OTP${serviceLabel} telah diperbarui menjadi ${formattedPrice}. Silakan tinjau dan klik Bayar Sekarang.`);
          return;
        }
      }

      if (!res.ok) {
        throw new Error(data.error || 'Gagal membuat pesanan');
      }

      clearCart();
      closeCart();
      onSuccessOrder(data.orderId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      ref={drawerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cart-drawer-title"
      tabIndex={-1}
      className="fixed inset-0 z-50 overflow-hidden bg-black/60"
      onClick={(event) => {
        if (event.target === event.currentTarget) closeCart();
      }}
    >
      <div className="absolute inset-x-0 bottom-0 flex max-h-[94dvh] w-full max-w-full sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-screen sm:max-w-md">
        <div className="glass-modal flex max-h-[94dvh] w-full flex-col justify-between rounded-t-3xl border-t border-slate-800 shadow-2xl sm:max-h-none sm:rounded-none sm:border-l sm:border-t-0">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 px-4 pb-3 pt-4 sm:p-6">
            <h2 id="cart-drawer-title" className="text-lg font-extrabold text-white flex items-center gap-2">
              <span>Keranjang Belanja</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300">
                {cart.length} produk
              </span>
            </h2>
            <button
              onClick={closeCart}
              aria-label="Tutup keranjang belanja"
              className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Cart Items */}
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:p-6">
            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {cart.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-sm">
                Keranjang Anda masih kosong.
              </div>
            ) : (
              cart.map((item) => {
                const itemKey = getCartItemKey(item);
                const displayPrice = item.price !== undefined ? item.price : item.product.price;

                return (
                  <div
                    key={itemKey}
                    className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-slate-200 truncate">
                        {item.product.name}
                      </h4>
                      {item.product.type === 'herosms' && (
                        <p className="text-[11px] text-purple-300">
                          {item.serviceName || item.serviceCode} ({item.countryName || item.countryCode})
                        </p>
                      )}
                      <span className="text-xs font-bold text-emerald-400 block mt-0.5">
                        {formatPrice(displayPrice)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {item.product.type === 'herosms' ? (
                        <span className="text-xs font-bold text-purple-300 px-2 py-1 bg-purple-950/60 border border-purple-800/40 rounded-lg">
                          1x
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={() => updateQuantity(itemKey, item.quantity - 1)}
                            aria-label="Kurangi jumlah"
                            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 focus-visible:ring-2 focus-visible:ring-indigo-500"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="text-xs font-bold text-white w-6 text-center">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(itemKey, item.quantity + 1)}
                            aria-label="Tambah jumlah"
                            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 focus-visible:ring-2 focus-visible:ring-indigo-500"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => removeFromCart(itemKey)}
                        aria-label="Hapus produk dari keranjang"
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 ml-1 focus-visible:ring-2 focus-visible:ring-indigo-500"
                        title="Hapus produk"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}

            {cart.length > 0 && (
              <div className="pt-4 border-t border-slate-800 space-y-4">
                <div>
                  <span className="text-xs font-semibold text-slate-300 block mb-2">
                    Metode Pembayaran:
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentProvider('qris')}
                      className={`min-h-[52px] rounded-xl border p-3 text-left text-xs font-bold ${paymentProvider === 'qris' ? 'border-indigo-500 bg-indigo-500/10 text-indigo-200' : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'}`}
                    >
                      <span className="flex items-center gap-2"><QrCode className="w-4 h-4" /> QRIS</span>
                      <span className="mt-1 block text-[10px] font-normal text-slate-400">Scan di halaman pesanan</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!user) {
                          setError('Masuk terlebih dahulu untuk membayar menggunakan saldo.');
                          openAuthModal('login');
                          return;
                        }
                        setPaymentProvider('credit');
                      }}
                      className={`min-h-[52px] rounded-xl border p-3 text-left text-xs font-bold ${paymentProvider === 'credit' ? 'border-amber-500 bg-amber-500/10 text-amber-200' : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'}`}
                    >
                      <span className="flex items-center gap-2"><Wallet className="w-4 h-4" /> Saldo</span>
                      <span className="mt-1 block text-[10px] font-normal text-slate-400">Potong saldo akun</span>
                    </button>
                  </div>
                  {paymentProvider === 'credit' && user && (
                    <div className={`mt-2 rounded-xl border p-3 text-xs ${creditBalance !== null && creditBalance >= totalPrice ? 'border-emerald-800/50 bg-emerald-950/40 text-emerald-300' : 'border-rose-800/50 bg-rose-950/40 text-rose-300'}`}>
                      <div className="flex items-center justify-between">
                        <span>Saldo saat ini</span>
                        <span className="font-black">{creditBalance === null ? 'Memuat...' : formatPrice(creditBalance)}</span>
                      </div>
                      {creditBalance !== null && creditBalance < totalPrice && <p className="mt-1 text-[10px]">Saldo belum mencukupi untuk total keranjang.</p>}
                    </div>
                  )}
                </div>

                {hasHeroSms && (
                  <div className="p-3 bg-purple-950/30 border border-purple-800/40 rounded-xl text-xs">
                    <label className="flex items-start gap-2 cursor-pointer text-purple-200 min-h-[44px]">
                      <input
                        type="checkbox"
                        checked={agreedPolicy}
                        onChange={(e) => setAgreedPolicy(e.target.checked)}
                        className="mt-0.5 rounded border-purple-800 bg-purple-900 text-indigo-500"
                      />
                      <span>Saya menyetujui syarat & ketentuan layanan SMS OTP.</span>
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Checkout */}
          {cart.length > 0 && (
            <div className="space-y-3 border-t border-slate-800 bg-slate-950/80 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:p-6">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Total Pembayaran:</span>
                <span className="text-xl font-extrabold text-white">
                  {formatPrice(totalPrice)}
                </span>
              </div>

              {!user && (
                <div>
                  <label htmlFor="guest-checkout-email" className="text-xs font-semibold text-slate-300 block mb-1.5">Email untuk akses pesanan</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="guest-checkout-email"
                      type="email"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      placeholder="nama@email.com"
                      className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 pl-10 pr-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">Checkout langsung tanpa ribet. Akun terdaftar silakan masuk.</p>
                </div>
              )}

              <div>
                <label htmlFor="cart-coupon-code" className="text-xs font-semibold text-slate-300 block mb-1.5">Kode kupon (opsional)</label>
                <input id="cart-coupon-code" type="text" value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} placeholder="PROMO10" className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-mono text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
              </div>

              <div>
                <label htmlFor="cart-referral-code" className="text-xs font-semibold text-slate-300 block mb-1.5">Kode referral (opsional)</label>
                <input id="cart-referral-code" type="text" value={referralCode} onChange={(e) => setReferralCode(e.target.value.toUpperCase())} placeholder="REF-AB12CD34" className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-mono text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
                <p className="mt-1 text-[10px] text-slate-500">Potongan referral 5%, maksimal Rp 10.000.</p>
              </div>

              <button
                onClick={handleCheckout}
                disabled={loading}
                className="w-full py-3.5 min-h-[44px] rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-500 hover:from-indigo-500 hover:to-emerald-400 text-white font-bold shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                {loading ? 'Memproses...' : user ? 'Bayar Sekarang' : 'Checkout sebagai Tamu'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
