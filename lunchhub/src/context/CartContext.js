import React, { createContext, useContext, useMemo, useState } from 'react';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  // items keyed by dish name: { name, price, quantity }
  const [items, setItems] = useState({});

  const add = (dish) => {
    setItems((prev) => {
      const existing = prev[dish.name];
      return {
        ...prev,
        [dish.name]: {
          name: dish.name,
          price: dish.price,
          quantity: (existing?.quantity ?? 0) + 1,
        },
      };
    });
  };

  const decrement = (name) => {
    setItems((prev) => {
      const existing = prev[name];
      if (!existing) return prev;
      if (existing.quantity <= 1) {
        const next = { ...prev };
        delete next[name];
        return next;
      }
      return { ...prev, [name]: { ...existing, quantity: existing.quantity - 1 } };
    });
  };

  const remove = (name) => {
    setItems((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const clear = () => setItems({});

  const list = useMemo(() => Object.values(items), [items]);
  const count = useMemo(() => list.reduce((s, i) => s + i.quantity, 0), [list]);
  const total = useMemo(
    () => list.reduce((s, i) => s + i.price * i.quantity, 0),
    [list]
  );
  const qtyOf = (name) => items[name]?.quantity ?? 0;

  return (
    <CartContext.Provider
      value={{ items, list, count, total, add, decrement, remove, clear, qtyOf }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
