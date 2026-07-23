import React, { useState } from 'react';
import { Product } from '../types';
import { X, Download, Key, Smartphone, ShieldAlert, ShoppingBag, Check } from 'lucide-react';
import { useCart } from '../context/CartContext';

interface ProductDetailModalProps {
  product: Product | null;
  onClose: () => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({ product, onClose }) => {
  const { addToCart } = useCart();
  const [policyAgreed, setPolicyAgreed] = useState(false);

  if (!product) return null;

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(price);
  };

  const handleAddToCart = () => {
    if (product.type === 'herosms' && !policyAgreed) {
      alert('Anda wajib menyetujui kebijakan penggunaan HeroSMS sebelum melanjutkan.');
      return;
    }
    addToCart(product);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div className="glass-modal w-full max-w-xl rounded-3xl p-6 sm:p-8 relative shadow-2xl border border-slate-700/50">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 text-slate-400 hover:text-white bg-slate-900/60 hover:bg-slate-800 rounded-full transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          {product.type === 'file' && (
            <span className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Download className="w-5 h-5" />
            </span>
          )}
          {product.type === 'code' && (
            <span className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Key className="w-5 h-5" />
            </span>
          )}
          {product.type === 'herosms' && (
            <span className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Smartphone className="w-5 h-5" />
            </span>
          )}

          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              {product.type === 'file' ? 'Digital Download' : product.type === 'code' ? 'Lisensi Voucher' : 'Aktivasi HeroSMS'}
            </span>
            <h2 className="text-xl font-extrabold text-white">{product.name}</h2>
          </div>
        </div>

        <div className="bg-slate-900/70 rounded-2xl p-4 border border-slate-800/80 mb-5">
          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
            {product.description || 'Tidak ada deskripsi rinci untuk produk ini.'}
          </p>
        </div>

        {/* HeroSMS Specific Policy Agreement */}
        {product.type === 'herosms' && (
          <div className="bg-purple-950/40 border border-purple-800/50 rounded-2xl p-4 mb-5 text-xs text-purple-200">
            <div className="flex items-start gap-2.5 mb-2">
              <ShieldAlert className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <span className="font-semibold text-purple-300">Syarat & Kebijakan Aktivasi SMS:</span>
            </div>
            <p className="text-purple-300/80 mb-3 leading-relaxed">
              Layanan ini disediakan hanya untuk keperluan legal. Pembeli wajib menyetujui bahwa penggunaan nomor OTP SMS tidak melanggar ketentuan hukum atau syarat layanan pihak ketiga.
            </p>
            <label className="flex items-center gap-2.5 cursor-pointer font-medium text-purple-200 hover:text-white transition-colors">
              <input
                type="checkbox"
                checked={policyAgreed}
                onChange={(e) => setPolicyAgreed(e.target.checked)}
                className="w-4 h-4 rounded border-purple-700 bg-purple-900/50 text-indigo-500 focus:ring-indigo-500"
              />
              <span>Saya telah membaca & menyetujui kebijakan penggunaan di atas</span>
            </label>
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          <div>
            <span className="text-xs text-slate-400 block">Total Harga</span>
            <span className="text-2xl font-black text-emerald-400">
              {formatPrice(product.price)}
            </span>
          </div>

          <button
            onClick={handleAddToCart}
            disabled={product.type === 'code' && (product.stock_count || 0) <= 0}
            className="px-6 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-emerald-500 hover:from-indigo-500 hover:to-emerald-400 disabled:opacity-50 text-white font-bold shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2"
          >
            <ShoppingBag className="w-5 h-5" />
            <span>Beli / Tambah Cart</span>
          </button>
        </div>
      </div>
    </div>
  );
};
