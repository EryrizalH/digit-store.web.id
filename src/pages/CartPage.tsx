import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useCart, getCartItemKey } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { ShoppingBag, Trash2, Plus, Minus, QrCode, ArrowRight, ArrowLeft, AlertCircle, Wallet, Mail } from 'lucide-react';

export const CartPage: React.FC = () => {
  const navigate = useNavigate();
  const { cart, removeFromCart, updateQuantity, updateOtpQuote, totalPrice, clearCart } = useCart();
  const { user, guestCheckout, openAuthModal } = useAuth();

  const [paymentProvider, setPaymentProvider] = useState<'qris' | 'credit'>('qris');
  const [agreedPolicy, setAgreedPolicy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [guestEmail, setGuestEmail] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [referralCode, setReferralCode] = useState('');

  const hasHeroSms = cart.some(item => item.product.type === 'herosms');

  // Fetch credit balance when user is logged in
  React.useEffect(() => {
    if (user) {
      fetch('/api/credits/balance')
        .then(res => res.ok ? res.json() : null)
        .then((data: any) => {
          if (data && typeof data.balance === 'number') {
            setCreditBalance(data.balance);
          }
        })
        .catch(() => {});
    }
  }, [user]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(price);
  };

  const handleCheckout = async () => {
    if (hasHeroSms && !agreedPolicy) {
      setError('Anda wajib menyetujui Kebijakan Penggunaan HeroSMS sebelum melakukan checkout.');
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

      const idempotencyKey = `idemp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
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

      const data = (await res.json()) as any;

      if (res.status === 409 || data.code === 'OTP_PRICE_CHANGED') {
        const fresh = data.freshQuote;
        if (fresh && fresh.serviceCode && fresh.countryCode && fresh.freshSellingPrice) {
          const pId = fresh.productId || cart.find(i => i.serviceCode === fresh.serviceCode)?.product.id || '';
          updateOtpQuote(pId, fresh.serviceCode, fresh.countryCode, {
            price: fresh.freshSellingPrice,
            expiresAt: fresh.expiresAt,
            quoteId: fresh.quoteId
          });
          const formattedPrice = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(fresh.freshSellingPrice);
          setError(`Harga OTP untuk rute ${fresh.serviceCode} (${fresh.countryCode}) telah diperbarui menjadi ${formattedPrice}. Silakan tekan Lanjut ke Pembayaran lagi untuk mengonfirmasi.`);
        } else {
          setError(data.error || 'Harga layanan OTP telah diperbarui. Silakan tekan Lanjut ke Pembayaran lagi untuk konfirmasi.');
        }
        return;
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Checkout gagal');
      }

      clearCart();

      const redirectUrl = typeof data.redirectUrl === 'string' ? data.redirectUrl : '';
      let canRedirectToGateway = false;
      if (redirectUrl) {
        try {
          canRedirectToGateway = new URL(redirectUrl).protocol === 'https:';
        } catch {
          canRedirectToGateway = false;
        }
      }
      if (canRedirectToGateway) {
        window.location.href = redirectUrl;
      } else {
        navigate(`/pesanan/${data.orderId}`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-4xl space-y-5 px-4 py-5 pb-safe sm:space-y-6 sm:py-8 lg:px-8">
      <div className="flex items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2.5 min-h-[44px] min-w-[44px] rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white flex items-center justify-center focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white flex items-center gap-2">
            <span>Keranjang Belanja</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              {cart.length} item
            </span>
          </h1>
        </div>

        {cart.length > 0 && (
          <button
            onClick={clearCart}
            className="text-xs font-semibold text-rose-400 hover:text-rose-300 min-h-[44px] px-2 flex items-center gap-1"
          >
            <Trash2 className="w-4 h-4" /> Kosongkan
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-rose-950/40 border border-rose-800/60 rounded-2xl text-xs text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {cart.length === 0 ? (
        <div className="glass-panel max-w-md mx-auto rounded-3xl p-10 border border-slate-800 text-center space-y-4 my-8">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto">
            <ShoppingBag className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-extrabold text-white">Keranjang Belanja Kosong</h3>
          <p className="text-xs text-slate-400">
            Anda belum menambahkan produk ke dalam keranjang.
          </p>
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 min-h-[44px] rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md"
          >
            Jelajahi Katalog Produk
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Cart Items List */}
          <div className="lg:col-span-2 space-y-3">
            {cart.map((item) => {
              const itemKey = getCartItemKey(item);
              const displayPrice = item.price !== undefined ? item.price : item.product.price;

              return (
                <div
                  key={itemKey}
                  className="glass-card flex flex-col items-stretch justify-between gap-3 rounded-2xl border border-slate-800 p-4 sm:flex-row sm:items-center"
                >
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-white truncate mb-0.5">
                      {item.product.name}
                    </h4>
                    {item.product.type === 'herosms' && (
                      <p className="text-xs text-purple-300 font-medium mb-1">
                        {item.serviceName || item.serviceCode} ({item.countryName || item.countryCode})
                      </p>
                    )}
                    <span className="text-xs font-black text-emerald-400 block">
                      {formatPrice(displayPrice)}
                    </span>
                  </div>

                  <div className="flex items-center justify-end gap-2 sm:shrink-0">
                    {item.product.type === 'herosms' ? (
                      <span className="text-xs font-bold text-purple-300 px-3 py-2 bg-purple-950/60 border border-purple-800/40 rounded-xl">
                        1x
                      </span>
                    ) : (
                      <>
                        <button
                          onClick={() => updateQuantity(itemKey, item.quantity - 1)}
                          className="w-10 h-10 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 flex items-center justify-center border border-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-500"
                          aria-label="Decrease quantity"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="text-sm font-extrabold text-white w-6 text-center">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(itemKey, item.quantity + 1)}
                          className="w-10 h-10 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 flex items-center justify-center border border-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-500"
                          aria-label="Increase quantity"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => removeFromCart(itemKey)}
                      className="w-10 h-10 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 flex items-center justify-center ml-1 border border-rose-500/20 focus-visible:ring-2 focus-visible:ring-rose-500"
                      aria-label="Remove item"
                      title="Hapus Rute"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Payment & Checkout Summary Side Panel */}
          <div className="glass-panel h-fit space-y-5 rounded-3xl border border-slate-800 p-4 sm:p-6">
            <h3 className="text-base font-extrabold text-white pb-3 border-b border-slate-800">
              Ringkasan Pembayaran
            </h3>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">
                Metode Pembayaran:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentProvider('qris')}
                  className={`p-3 min-h-[44px] rounded-xl border text-xs font-bold flex items-start justify-center gap-2 transition-all ${
                    paymentProvider === 'qris'
                      ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                      : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <QrCode className="w-4 h-4 mt-0.5 shrink-0" />
                  <span className="text-left">
                    <span className="block">QRIS</span>
                    <span className="mt-1 block text-[10px] font-normal leading-relaxed text-slate-400">
                      Lanjut ke halaman QRIS
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentProvider('credit')}
                  className={`p-3 min-h-[44px] rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                    paymentProvider === 'credit'
                      ? 'border-amber-500 bg-amber-500/10 text-amber-300'
                      : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <Wallet className="w-4 h-4" /> Kredit
                </button>
              </div>
              {/* Credit balance info when credit is selected */}
              {paymentProvider === 'credit' && user && (
                <div className={`p-3 rounded-xl border text-xs ${
                  creditBalance !== null && creditBalance >= totalPrice
                    ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-800/50 text-rose-300'
                }`}>
                  <div className="flex items-center justify-between">
                    <span>Saldo Kredit:</span>
                    <span className="font-black">
                      {creditBalance !== null ? formatPrice(creditBalance) : 'Memuat...'}
                    </span>
                  </div>
                  {creditBalance !== null && creditBalance < totalPrice && (
                    <p className="mt-1 text-[10px] text-rose-400">
                      Saldo tidak mencukupi. Silakan topup terlebih dahulu.
                    </p>
                  )}
                </div>
              )}
            </div>

            {!user && (
              <div>
                <label htmlFor="guest-checkout-email-page" className="text-xs font-semibold text-slate-300 block mb-1.5">Email untuk akses pesanan</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="guest-checkout-email-page"
                    type="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="nama@email.com"
                    className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 pl-10 pr-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  />
                </div>
                <p className="mt-1 text-[10px] text-slate-500">Email baru dibuatkan sesi tamu 24 jam. Email akun lama perlu login.</p>
              </div>
            )}

            <div>
              <label htmlFor="cart-page-coupon-code" className="text-xs font-semibold text-slate-300 block mb-1.5">Kode kupon (opsional)</label>
              <input id="cart-page-coupon-code" type="text" value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} placeholder="PROMO10" className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-mono text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>

            <div>
              <label htmlFor="cart-page-referral-code" className="text-xs font-semibold text-slate-300 block mb-1.5">Referral code (opsional)</label>
              <input id="cart-page-referral-code" type="text" value={referralCode} onChange={(e) => setReferralCode(e.target.value.toUpperCase())} placeholder="REF-AB12CD34" className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-mono text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
              <p className="mt-1 text-[10px] text-slate-500">Potongan referral 5%, maksimal Rp 10.000.</p>
            </div>

            {hasHeroSms && (
              <div className="p-4 bg-purple-950/40 border border-purple-800/50 rounded-2xl text-xs space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer text-purple-200 font-medium">
                  <input
                    type="checkbox"
                    checked={agreedPolicy}
                    onChange={(e) => setAgreedPolicy(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-purple-800 bg-purple-900 text-indigo-500 focus:ring-2 focus:ring-indigo-500"
                  />
                  <span>Saya membaca & menyetujui syarat kebijakan penggunaan HeroSMS.</span>
                </label>
              </div>
            )}

            <div className="pt-4 border-t border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Total Harga:</span>
                <span className="text-xl font-black text-white">
                  {formatPrice(totalPrice)}
                </span>
              </div>

              <button
                onClick={handleCheckout}
                disabled={loading}
                className="w-full min-h-[44px] py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-500 hover:from-indigo-500 hover:to-emerald-400 text-white font-extrabold text-sm shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
              {loading ? 'Memproses...' : user ? 'Lanjut ke Pembayaran' : 'Checkout sebagai Tamu'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
