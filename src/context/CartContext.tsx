// ponytail: CartContext state manager with 1-unit HeroSMS route lock, updateOtpQuote refresh & maxPrice localStorage sanitization
import React, { createContext, useContext, useState, useEffect } from 'react';
import { Product } from '../types';

export interface CartItem {
  product: Product;
  quantity: number;
  serviceCode?: string;
  serviceName?: string;
  countryCode?: string;
  countryName?: string;
  quoteId?: string;
  expiresAt?: number;
  price?: number; // Quoted selling price for OTP
}

export function sanitizeCartItem(item: any): CartItem {
  if (!item) return item;
  const { maxPrice, max_price, ...cleanItem } = item;
  if (cleanItem.product?.type === 'herosms') {
    cleanItem.quantity = 1;
  }
  return cleanItem;
}

export function getCartItemKey(item: { product: Product; serviceCode?: string; countryCode?: string }): string {
  if (item.product.type === 'herosms') {
    return `${item.product.id}:${item.serviceCode || ''}:${item.countryCode || ''}`;
  }
  return item.product.id;
}

interface CartContextType {
  cart: CartItem[];
  isCartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  addToCart: (product: Product, quantity?: number, otpDetails?: Partial<CartItem>) => void;
  removeFromCart: (itemKey: string) => void;
  updateQuantity: (itemKey: string, quantity: number) => void;
  updateOtpQuote: (productId: string, serviceCode: string, countryCode: string, freshQuote: { price: number; expiresAt: number; quoteId?: string }) => void;
  clearCart: () => void;
  totalPrice: number;
  totalItemsCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('digit_cart');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed.map(sanitizeCartItem) : [];
    } catch {
      return [];
    }
  });

  const [isCartOpen, setIsCartOpen] = useState(false);

  useEffect(() => {
    try {
      const sanitized = cart.map(sanitizeCartItem);
      localStorage.setItem('digit_cart', JSON.stringify(sanitized));
    } catch {
      // ignore
    }
  }, [cart]);

  const openCart = () => setIsCartOpen(true);
  const closeCart = () => setIsCartOpen(false);

  const addToCart = (product: Product, quantity: number = 1, otpDetails?: Partial<CartItem>) => {
    const isHeroSms = product.type === 'herosms';
    const effectiveQty = isHeroSms ? 1 : quantity;

    const newItemCandidate: CartItem = sanitizeCartItem({
      product,
      quantity: effectiveQty,
      ...otpDetails,
      price: otpDetails?.price !== undefined ? otpDetails.price : product.price
    });

    const newKey = getCartItemKey(newItemCandidate);

    setCart((prev) => {
      const existingIndex = prev.findIndex((item) => getCartItemKey(item) === newKey);
      if (existingIndex >= 0) {
        return prev.map((item, idx) =>
          idx === existingIndex
            ? sanitizeCartItem({
                ...item,
                ...otpDetails,
                quantity: isHeroSms ? 1 : item.quantity + effectiveQty,
                price: otpDetails?.price !== undefined ? otpDetails.price : item.price
              })
            : item
        );
      }
      return [...prev, newItemCandidate];
    });
    openCart();
  };

  const removeFromCart = (itemKey: string) => {
    setCart((prev) => prev.filter((item) => getCartItemKey(item) !== itemKey && item.product.id !== itemKey));
  };

  const updateQuantity = (itemKey: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(itemKey);
      return;
    }
    setCart((prev) =>
      prev.map((item) => {
        const matches = getCartItemKey(item) === itemKey || item.product.id === itemKey;
        if (!matches) return item;
        const newQty = item.product.type === 'herosms' ? 1 : quantity;
        return sanitizeCartItem({ ...item, quantity: newQty });
      })
    );
  };

  const updateOtpQuote = (productId: string, serviceCode: string, countryCode: string, freshQuote: { price: number; expiresAt: number; quoteId?: string }) => {
    setCart((prev) =>
      prev.map((item) => {
        const matches = item.product.id === productId && String(item.serviceCode) === String(serviceCode) && String(item.countryCode) === String(countryCode);
        if (matches) {
          return sanitizeCartItem({
            ...item,
            price: freshQuote.price,
            expiresAt: freshQuote.expiresAt,
            quoteId: freshQuote.quoteId || item.quoteId,
            quantity: 1
          });
        }
        return item;
      })
    );
  };

  const clearCart = () => setCart([]);

  const totalPrice = cart.reduce((sum, item) => {
    const itemPrice = item.price !== undefined ? item.price : item.product.price;
    return sum + itemPrice * item.quantity;
  }, 0);

  const totalItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider value={{
      cart, isCartOpen, openCart, closeCart,
      addToCart, removeFromCart, updateQuantity, updateOtpQuote, clearCart,
      totalPrice, totalItemsCount
    }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
};
