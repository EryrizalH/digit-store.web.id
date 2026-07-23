import React, { useState } from 'react';
import { X, Trash2, Plus, Minus, CreditCard, ShieldCheck, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';

interface CartDrawerProps {
  onSuccessOrder: (orderId: string) => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({ onSuccessOrder }) => {
  const { cart, isCartOpen, closeCart, removeFromCart, updateQuantity, totalPrice, clearCart } = useCart();
  const { user, openAuthModal } = useAuth();

  const [paymentProvider, setPaymentProvider] = useState<'midtrans' | 'xendit'>('midtrans');
  const [agreedPolicy, setAgreedPolicy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isCartOpen) return null;

  const hasHeroSms = cart.some(item => item.product.type === 'herosms');

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(price);
  };

  const handleCheckout = async () => {
    if (!user) {
      openAuthModal('login');
      return;
    }

    if (hasHeroSms && !agreedPolicy) {
      setError('Wajib menyetujui Kebijakan Penggunaan HeroSMS sebelum checkout.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const idempotencyKey = `idemp_${Date.now()}_${Math.random()}`;
      const payload = {
        items: cart.map(item => ({ product_id: item.product.id, quantity: item.quantity })),
        payment_provider: paymentProvider,
        idempotency_key: idempotencyKey,
        agreed_policy: agreedPolicy
      };

      const res = await fetch('/api/orders/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = (await res.json()) as any;
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Checkout gagal');
      }

      clearCart();
      closeCart();

      if (data.redirectUrl) {
        if (data.redirectUrl.startsWith('http')) {
          window.location.href = data.redirectUrl;
        } else {
          // Simulated mock pay
          onSuccessOrder(data.orderId);
        }
      } else {
        onSuccessOrder(data.orderId);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md glass-modal border-l border-slate-800 shadow-2xl flex flex-col justify-between">
          {/* Header */}
          <div className="p-6 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
              <span>Keranjang Belanja</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300">
                {cart.length} item
              </span>
            </h2>
            <button
              onClick={closeCart}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Cart Items */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl text-xs">
                {error}
              </div>
            )}

            {cart.length === 0 ? (
              <div className="text-center py-16 text-slate-500">
                Keranjang Anda masih kosong.
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={item.product.id}
                  className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-slate-200 truncate">
                      {item.product.name}
                    </h4>
                    <span className="text-xs font-bold text-emerald-400 block mt-0.5">
                      {formatPrice(item.product.price)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                      className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-xs font-bold text-white w-5 text-center">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                      className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => removeFromCart(item.product.id)}
                      className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 ml-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}

            {cart.length > 0 && (
              <div className="pt-4 border-t border-slate-800 space-y-4">
                {/* Payment Gateway Selection */}
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-2">
                    Pilih Gateway Pembayaran:
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPaymentProvider('midtrans')}
                      className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                        paymentProvider === 'midtrans'
                          ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                          : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <CreditCard className="w-4 h-4" /> Midtrans
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentProvider('xendit')}
                      className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                        paymentProvider === 'xendit'
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                          : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <CreditCard className="w-4 h-4" /> Xendit
                    </button>
                  </div>
                </div>

                {hasHeroSms && (
                  <div className="p-3 bg-purple-950/30 border border-purple-800/40 rounded-xl text-xs">
                    <label className="flex items-start gap-2 cursor-pointer text-purple-200">
                      <input
                        type="checkbox"
                        checked={agreedPolicy}
                        onChange={(e) => setAgreedPolicy(e.target.checked)}
                        className="mt-0.5 rounded border-purple-800 bg-purple-900 text-indigo-500"
                      />
                      <span>Saya menyetujui syarat & kebijakan penggunaan HeroSMS.</span>
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Checkout */}
          {cart.length > 0 && (
            <div className="p-6 border-t border-slate-800 bg-slate-950/80 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Total Pembayaran:</span>
                <span className="text-xl font-extrabold text-white">
                  {formatPrice(totalPrice)}
                </span>
              </div>

              <button
                onClick={handleCheckout}
                disabled={loading}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-500 hover:from-indigo-500 hover:to-emerald-400 text-white font-bold shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? 'Memproses...' : user ? 'Bayar Sekarang' : 'Login untuk Checkout'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
