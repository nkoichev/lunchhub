import React, { createContext, useContext, useMemo, useState } from 'react';
import { moveUnits } from '../utils/orderLines';
import { tapHaptic } from '../utils/haptics';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  // Ordered lines: { name, price, quantity, forName }. forName null = for
  // me; the same dish for two colleagues is two lines (see orderLines.js).
  const [list, setList] = useState([]);

  // From the menu: add one portion "for me" (the cart lets you reassign it).
  // Every add/remove gives a light haptic tick — "picking" a dish should
  // feel like something happened, wherever the +/− lives (menu, cart).
  const add = (dish) => {
    tapHaptic();
    setList((prev) => {
      const idx = prev.findIndex((l) => l.name === dish.name && l.forName == null);
      if (idx >= 0) {
        return prev.map((l, i) => (i === idx ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { name: dish.name, price: dish.price, quantity: 1, forName: null }];
    });
  };

  // From the menu: take one portion off — my own line first, else the
  // most recently added line for that dish.
  const decrement = (name) => {
    tapHaptic();
    setList((prev) => {
      let idx = prev.findIndex((l) => l.name === name && l.forName == null);
      if (idx < 0) idx = prev.map((l) => l.name).lastIndexOf(name);
      if (idx < 0) return prev;
      return prev
        .map((l, i) => (i === idx ? { ...l, quantity: l.quantity - 1 } : l))
        .filter((l) => l.quantity > 0);
    });
  };

  // Per-line controls for the cart screen.
  const incLine = (index) => {
    tapHaptic();
    setList((prev) => prev.map((l, i) => (i === index ? { ...l, quantity: l.quantity + 1 } : l)));
  };
  const decLine = (index) => {
    tapHaptic();
    setList((prev) =>
      prev
        .map((l, i) => (i === index ? { ...l, quantity: l.quantity - 1 } : l))
        .filter((l) => l.quantity > 0)
    );
  };
  const removeLine = (index) => setList((prev) => prev.filter((_, i) => i !== index));
  const assignLine = (index, forName, qty) =>
    setList((prev) => moveUnits(prev, index, forName, qty));

  const clear = () => setList([]);

  // Bulk add "for me" (e.g. "Вземи същото като…") — one haptic for the batch.
  // dishes: [{ name, price, quantity }]
  const addMany = (dishes) => {
    tapHaptic();
    setList((prev) => {
      let next = [...prev];
      dishes.forEach((d) => {
        const idx = next.findIndex((l) => l.name === d.name && l.forName == null);
        if (idx >= 0) {
          next = next.map((l, i) => (i === idx ? { ...l, quantity: l.quantity + (d.quantity || 1) } : l));
        } else {
          next.push({ name: d.name, price: d.price, quantity: d.quantity || 1, forName: null });
        }
      });
      return next;
    });
  };

  const count = useMemo(() => list.reduce((s, i) => s + i.quantity, 0), [list]);
  const total = useMemo(
    () => list.reduce((s, i) => s + i.price * i.quantity, 0),
    [list]
  );
  const qtyOf = (name) =>
    list.reduce((s, l) => (l.name === name ? s + l.quantity : s), 0);

  return (
    <CartContext.Provider
      value={{
        list,
        count,
        total,
        add,
        addMany,
        decrement,
        incLine,
        decLine,
        removeLine,
        assignLine,
        clear,
        qtyOf,
      }}
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
