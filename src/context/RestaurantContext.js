import React, { createContext, useContext, useEffect, useState } from 'react';
import { fetchRestaurants } from '../services/restaurantService';
import { useAuth } from './AuthContext';

const RestaurantContext = createContext(null);

export function RestaurantProvider({ children }) {
  const [restaurants, setRestaurants] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const list = await fetchRestaurants();
      setRestaurants(list);
      // Keep current selection if still present, else pick the first.
      setSelected((prev) => {
        if (prev && list.some((r) => r.id === prev.id)) return prev;
        return list[0] ?? null;
      });
    } catch (_) {
      setRestaurants([]);
    } finally {
      setLoading(false);
    }
  };

  // The tables answer only to a signed-in member, so (re)load on sign-in.
  const { user } = useAuth();
  useEffect(() => {
    if (user?.id) load();
  }, [user?.id]);

  return (
    <RestaurantContext.Provider
      value={{ restaurants, selected, setSelected, loading, reload: load }}
    >
      {children}
    </RestaurantContext.Provider>
  );
}

export function useRestaurant() {
  const ctx = useContext(RestaurantContext);
  if (!ctx) throw new Error('useRestaurant must be used within RestaurantProvider');
  return ctx;
}
