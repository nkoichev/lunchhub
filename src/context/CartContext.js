import React, { createContext, useContext, useMemo, useState } from 'react';
import { moveUnits } from '../utils/orderLines';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  // Ordered lines: { name, price, quantity, forName }. forName null = for
  // me; the same dish for two colleagues is two lines (see orderLines.js).
  const [list, setList] = useState([]);

  // From the menu: add one portion "for me" (the cart lets you reassign it).
  const add = (dish) => {
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
  const incLine = (index) =>
    setList((prev) => prev.map((l, i) => (i === index ? { ...l, quantity: l.quantity + 1 } : l)));
  const decLine = (index) =>
    setList((prev) =>
      prev
        .map((l, i) => (i === index ? { ...l, quantity: l.quantity - 1 } : l))
        .filter((l) => l.quantity > 0)
    );
  const removeLine = (index) => setList((prev) => prev.filter((_, i) => i !== index));
  const assignLine = (index, forName, qty) =>
    setList((prev) => moveUnits(prev, index, forName, qty));

  const clear = () => setList([]);

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
