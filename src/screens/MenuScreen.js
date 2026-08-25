import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useCart } from '../context/CartContext';
import { useRestaurant } from '../context/RestaurantContext';
import { useTheme } from '../context/ThemeContext';
import { fetchMenu } from '../services/menuService';
import { confirmDialog } from '../utils/confirm';
import { StarRating, EmptyState } from '../components/ui';
import { useResponsive } from '../hooks/useResponsive';
import {
  todayIndex,
  dayName,
  WEEKDAYS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
} from '../data/menu';
import { spacing, radius, font, CURRENCY } from '../theme/theme';

export default function MenuScreen({ navigation }) {
  const { qtyOf, add, decrement, count, total, clear, list } = useCart();
  const { restaurants, selected, setSelected } = useRestaurant();
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { columns, maxWidth, isWide } = useResponsive();
  const [day, setDay] = useState(() => {
    const t = todayIndex();
    return WEEKDAYS.includes(t) ? t : 1; // default to Monday on weekends
  });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortMode, setSortMode] = useState('alpha'); // 'alpha' | 'category'
  const [search, setSearch] = useState('');

  // Switching restaurant with a non-empty cart would mix restaurants in one
  // order, so confirm and clear first.
  const onSelectRestaurant = (r) => {
    if (r.id === selected?.id) return;
    if (list.length > 0) {
      confirmDialog({
        title: 'Смяна на ресторант',
        message: 'Кошницата ви ще бъде изчистена. Продължавате ли?',
        confirmText: 'Смени',
        destructive: true,
        onConfirm: () => {
          clear();
          setSelected(r);
        },
      });
    } else {
      setSelected(r);
    }
  };

  const load = useCallback(async () => {
    try {
      setItems(await fetchMenu(selected?.id, day));
    } catch (e) {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [day, selected?.id]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  // Search matches from the start of the dish name (not anywhere inside it).
  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('bg');
    if (!q) return items;
    return items.filter((i) => i.name.toLocaleLowerCase('bg').startsWith(q));
  }, [items, search]);

  const sections = useMemo(() => {
    if (sortMode === 'alpha') {
      const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'bg'));
      return sorted.length ? [{ title: null, category: 'all', data: sorted }] : [];
    }
    return CATEGORY_ORDER.map((cat) => ({
      title: CATEGORY_LABELS[cat],
      category: cat,
      data: filtered.filter((i) => (i.category ?? 'main') === cat),
    })).filter((s) => s.data.length);
  }, [filtered, sortMode]);

  const centered = { width: '100%', maxWidth, alignSelf: 'center' };
  const cardBasis = columns === 1 ? '100%' : columns === 2 ? '48%' : '31.5%';

  const renderDish = (item) => {
    const qty = qtyOf(item.name);
    return (
      <View key={item.id} style={[styles.dish, shadow.card, { width: cardBasis }]}>
        <View style={styles.dishMain}>
          <Text style={styles.dishName}>{item.name}</Text>
          <View style={styles.dishMeta}>
            <Text style={styles.price}>
              {item.price.toFixed(2)} {CURRENCY}
            </Text>
            {item.calories ? <Text style={styles.calories}>🔥 {item.calories} ккал</Text> : null}
            {item.avg_stars ? (
              <View style={styles.ratingInline}>
                <StarRating value={item.avg_stars} size={13} />
                <Text style={styles.votes}>({item.votes})</Text>
              </View>
            ) : (
              <Text style={styles.noRating}>без оценки</Text>
            )}
          </View>
        </View>

        {qty === 0 ? (
          <TouchableOpacity style={styles.addBtn} onPress={() => add(item)}>
            <Text style={styles.addBtnText}>+</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.stepper}>
            <TouchableOpacity style={styles.stepBtn} onPress={() => decrement(item.name)}>
              <Text style={styles.stepText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.qty}>{qty}</Text>
            <TouchableOpacity style={styles.stepBtn} onPress={() => add(item)}>
              <Text style={styles.stepText}>+</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Restaurant selector */}
      {restaurants.length > 1 && (
        <View style={styles.barWrap}>
          <View style={[styles.restaurantBar, centered]}>
            {restaurants.map((r) => {
              const active = r.id === selected?.id;
              return (
                <TouchableOpacity
                  key={r.id}
                  onPress={() => onSelectRestaurant(r)}
                  style={[styles.restChip, active && styles.restChipActive]}
                >
                  <Text
                    numberOfLines={1}
                    style={[styles.restChipText, active && styles.restChipTextActive]}
                  >
                    {r.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Day selector */}
      <View style={styles.barWrap}>
        <View style={[styles.dayBar, centered]}>
          {WEEKDAYS.map((d) => {
            const active = d === day;
            const isToday = d === todayIndex();
            return (
              <TouchableOpacity
                key={d}
                onPress={() => setDay(d)}
                style={[styles.dayChip, active && styles.dayChipActive]}
              >
                <Text style={[styles.dayChipText, active && styles.dayChipTextActive]}>
                  {dayName(d).slice(0, 3)}
                </Text>
                {isToday && <View style={[styles.todayDot, active && { backgroundColor: '#fff' }]} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Search + sort toggle */}
      <View style={styles.barWrap}>
        <View style={[styles.toolsBar, centered]}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Търси ястие…"
            placeholderTextColor={colors.textFaint}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          <TouchableOpacity
            style={styles.sortBtn}
            onPress={() => setSortMode((m) => (m === 'alpha' ? 'category' : 'alpha'))}
          >
            <Text style={styles.sortBtnText}>
              {sortMode === 'alpha' ? '📂 По категория' : '🔤 Азбучен ред'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          <View style={centered}>
            {sections.length === 0 ? (
              <EmptyState
                emoji="📭"
                title={search ? 'Няма съвпадения' : 'Няма меню за този ден'}
                subtitle={
                  search
                    ? 'Опитайте с друго начало на името.'
                    : 'Опитайте с друг ден или дръпнете надолу за обновяване.'
                }
              />
            ) : (
              sections.map((section) => (
                <View key={section.category}>
                  {section.title && <Text style={styles.sectionHeader}>{section.title}</Text>}
                  <View style={styles.grid}>{section.data.map(renderDish)}</View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}

      {/* Floating cart bar */}
      {count > 0 && (
        <View style={styles.cartBarWrap} pointerEvents="box-none">
          <TouchableOpacity
            style={[styles.cartBar, shadow.floating, { maxWidth, alignSelf: 'center', width: '100%' }]}
            activeOpacity={0.9}
            onPress={() => navigation.navigate('Cart')}
          >
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{count}</Text>
            </View>
            <Text style={styles.cartBarText}>Виж поръчката</Text>
            <Text style={styles.cartBarTotal}>
              {total.toFixed(2)} {CURRENCY}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  barWrap: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  restaurantBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  restChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
    flexShrink: 0,
  },
  restChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  restChipText: { fontSize: font.sm, fontWeight: font.semibold, color: colors.textMuted },
  restChipTextActive: { color: colors.onPrimary },
  dayBar: {
    flexDirection: 'row',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  dayChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayChipText: { fontSize: font.sm, fontWeight: font.semibold, color: colors.textMuted },
  dayChipTextActive: { color: colors.onPrimary },
  todayDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginTop: 3,
  },
  toolsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    fontSize: font.base,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
  },
  sortBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.border,
    flexShrink: 0,
  },
  sortBtnText: { fontSize: font.sm, fontWeight: font.semibold, color: colors.textMuted },
  scrollContent: { padding: spacing.lg, paddingBottom: 120 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  sectionHeader: {
    fontSize: font.sm,
    fontWeight: font.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  dish: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dishMain: { flex: 1, marginRight: spacing.md },
  dishName: { fontSize: font.md, fontWeight: font.semibold, color: colors.text },
  dishMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: spacing.md },
  price: { fontSize: font.base, fontWeight: font.bold, color: colors.accent },
  calories: { fontSize: font.xs, color: colors.textFaint },
  ratingInline: { flexDirection: 'row', alignItems: 'center' },
  votes: { fontSize: font.xs, color: colors.textFaint, marginLeft: 3 },
  noRating: { fontSize: font.xs, color: colors.textFaint },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { color: colors.onPrimary, fontSize: 24, fontWeight: font.bold, marginTop: -2 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
  },
  stepBtn: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 22, color: colors.primaryDark, fontWeight: font.bold },
  qty: { fontSize: font.md, fontWeight: font.bold, color: colors.text, minWidth: 20, textAlign: 'center' },
  cartBarWrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
  },
  cartBar: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: spacing.xl,
  },
  cartBadge: {
    backgroundColor: '#fff',
    borderRadius: radius.pill,
    minWidth: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  cartBadgeText: { color: colors.primary, fontWeight: font.bold, fontSize: font.sm },
  cartBarText: { flex: 1, color: colors.onPrimary, fontSize: font.md, fontWeight: font.semibold, marginLeft: spacing.md },
  cartBarTotal: { color: colors.onPrimary, fontSize: font.md, fontWeight: font.bold },
});
