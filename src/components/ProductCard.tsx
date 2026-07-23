import React from 'react';
import { Product } from '../types';
import { Download, Key, Smartphone, ShoppingCart, CheckCircle2 } from 'lucide-react';
import { useCart } from '../context/CartContext';

interface ProductCardProps {
  product: Product;
  onSelectProduct: (p: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, onSelectProduct }) => {
  const { addToCart } = useCart();

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(price);
  };

  const getTypeBadge = () => {
    switch (product.type) {
      case 'file':
        return (
          <span className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1">
            <Download className="w-3.5 h-3.5" /> File Software
          </span>
        );
      case 'code':
        return (
          <span className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
            <Key className="w-3.5 h-3.5" /> Lisensi / Code
          </span>
        );
      case 'herosms':
        return (
          <span className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center gap-1">
            <Smartphone className="w-3.5 h-3.5" /> HeroSMS OTP
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="glass-card rounded-2xl p-5 flex flex-col justify-between relative group">
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          {getTypeBadge()}
          {product.type === 'code' && (
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
              (product.stock_count || 0) > 0
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                : 'bg-rose-950 text-rose-300 border border-rose-800'
            }`}>
              Stok: {product.stock_count ?? 0}
            </span>
          )}
        </div>

        <h3
          onClick={() => onSelectProduct(product)}
          className="text-lg font-bold text-slate-100 hover:text-indigo-300 cursor-pointer transition-colors line-clamp-2 mb-2"
        >
          {product.name}
        </h3>

        <p className="text-xs text-slate-400 line-clamp-3 mb-4 leading-relaxed">
          {product.description || 'Tidak ada deskripsi produk.'}
        </p>
      </div>

      <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between gap-3">
        <div>
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Harga</span>
          <span className="text-lg font-extrabold text-white bg-gradient-to-r from-white via-indigo-100 to-indigo-300 bg-clip-text">
            {formatPrice(product.price)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onSelectProduct(product)}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all"
          >
            Detail
          </button>

          <button
            onClick={() => addToCart(product)}
            disabled={product.type === 'code' && (product.stock_count || 0) <= 0}
            className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center"
            title="Tambah ke Keranjang"
          >
            <ShoppingCart className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
