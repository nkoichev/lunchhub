import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchAllHistory, deleteOrder } from '../services/orderService';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { EmptyState } from '../components/ui';
import RankBarChart from '../components/charts/RankBarChart';
import TrendChart from '../components/charts/TrendChart';
import { confirmDialog, alertMessage } from '../utils/confirm';
import { useResponsive } from '../hooks/useResponsive';
import { spacing, radius, font, CURRENCY } from '../theme/theme';

const RANGE_OPTIONS = [
  { id: '7', label: '7 дни', days: 7 },
  { id: '30', label: '30 дни', days: 30 },
  { id: 'all', label: 'Всички', days: null },
];

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('bg-BG', { day: '2-digit', month: 'long', weekday: 'short' });
}

export default function HistoryScreen({ navigation }) {
  const { user } = useAuth();
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { readWidth } = useResponsive();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mode, setMode] = useState('charts'); // 'charts' | 'orders' | 'summary'
  const [rangeId, setRangeId] = useState('30');

  const load = useCallback(async () => {
    try {
      setOrders(await fetchAllHistory(300));
    } catch (_) {
      setOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const confirmDelete = (orderId) => {
    confirmDialog({
      title: 'Изтриване',
      message: 'Да изтрия ли тази поръчка?',
      confirmText: 'Изтрий',
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteOrder(orderId);
          load();
        } catch (e) {
          alertMessage('Грешка', e.message);
        }
      },
    });
  };

  // Group orders by date (newest first, preserving fetch order).
  const days = useMemo(() => {
    const map = new Map();
    orders.forEach((o) => {
      if (!map.has(o.date)) map.set(o.date, []);
      map.get(o.date).push(o);
    });
    return Array.from(map.entries()).map(([date, list]) => {
      // per-restaurant and per-person sums
      const byRestaurant = {};
      const byPerson = {};
      let total = 0;
      list.forEach((o) => {
        byRestaurant[o.restaurantName] = (byRestaurant[o.restaurantName] || 0) + o.total;
        byPerson[o.userName] = (byPerson[o.userName] || 0) + o.total;
        total += o.total;
      });
      return {
        date,
        list: list.slice().sort((a, b) => a.userName.localeCompare(b.userName)),
        byRestaurant: Object.entries(byRestaurant).sort((a, b) => b[1] - a[1]),
        byPerson: Object.entries(byPerson).sort((a, b) => a[0].localeCompare(b[0])),
        total,
      };
    });
  }, [orders]);

  // Orders inside the selected chart range (7 / 30 days / all time).
  const rangedOrders = useMemo(() => {
    const range = RANGE_OPTIONS.find((r) => r.id === rangeId);
    if (!range?.days) return orders;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - range.days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return orders.filter((o) => o.date >= cutoffStr);
  }, [orders, rangeId]);

  // Rankings + trend for the "Графики" tab, built from the ranged/full history.
  const charts = useMemo(() => {
    const restaurantTotals = {};
    const personTotals = {};
    // Historic item names differ in casing (e.g. "Кутия" vs "кутия") depending
    // on how the dish was typed at order time — normalize so they rank as one.
    // "Кутия" itself is packaging, not a dish, so it's excluded here.
    const NON_DISH_NAMES = new Set(['кутия']);
    const dishQty = {};
    const dishVariants = {};
    rangedOrders.forEach((o) => {
      restaurantTotals[o.restaurantName] = (restaurantTotals[o.restaurantName] || 0) + o.total;
      personTotals[o.userName] = (personTotals[o.userName] || 0) + o.total;
      o.items.forEach((it) => {
        const key = it.item_name.trim().toLowerCase();
        if (NON_DISH_NAMES.has(key)) return;
        dishQty[key] = (dishQty[key] || 0) + it.quantity;
        const variants = (dishVariants[key] ??= {});
        variants[it.item_name] = (variants[it.item_name] || 0) + it.quantity;
      });
    });
    const dishLabel = (key) =>
      Object.entries(dishVariants[key]).sort((a, b) => b[1] - a[1])[0][0];
    const toRanked = (map, labelFor = (key) => key) =>
      Object.entries(map)
        .map(([key, value]) => ({ label: labelFor(key), value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);

    const rankedDishes = toRanked(dishQty, dishLabel);
    const topDish = rankedDishes[0];

    // Fixed 14-day trend window, independent of the range chips above.
    const byDate = {};
    orders.forEach((o) => {
      byDate[o.date] = (byDate[o.date] || 0) + o.total;
    });
    const dailyTotals = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dailyTotals.push({ date: key, total: byDate[key] || 0 });
    }

    return {
      byRestaurant: toRanked(restaurantTotals),
      byPerson: toRanked(personTotals),
      byDish: rankedDishes,
      dailyTotals,
      totalSpend: rangedOrders.reduce((s, o) => s + o.total, 0),
      orderCount: rangedOrders.length,
      topDish,
    };
  }, [rangedOrders, orders]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Mode toggle */}
      <View style={styles.toggleWrap}>
        <View style={[styles.toggle, { maxWidth: readWidth, alignSelf: 'center', width: '100%' }]}>
          <TouchableOpacity
            style={[styles.toggleBtn, mode === 'charts' && styles.toggleBtnActive]}
            onPress={() => setMode('charts')}
          >
            <Text style={[styles.toggleText, mode === 'charts' && styles.toggleTextActive]}>
              📊 Графики
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, mode === 'orders' && styles.toggleBtnActive]}
            onPress={() => setMode('orders')}
          >
            <Text style={[styles.toggleText, mode === 'orders' && styles.toggleTextActive]}>
              Всички поръчки
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, mode === 'summary' && styles.toggleBtnActive]}
            onPress={() => setMode('summary')}
          >
            <Text style={[styles.toggleText, mode === 'summary' && styles.toggleTextActive]}>
              Обобщено
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <View style={{ width: '100%', maxWidth: readWidth, alignSelf: 'center' }}>
        {days.length === 0 ? (
          <EmptyState
            emoji="📜"
            title="Няма поръчки"
            subtitle="Поръчките ще се появят тук след първата поръчка на екипа."
          />
        ) : mode === 'orders' ? (
          // ---------- ALL ORDERS ----------
          days.map((day) => (
            <View key={day.date} style={styles.daySection}>
              <View style={styles.dayHeaderRow}>
                <Text style={styles.dayHeader}>{formatDate(day.date)}</Text>
                <Text style={styles.dayHeaderTotal}>
                  {day.total.toFixed(2)} {CURRENCY}
                </Text>
              </View>
              {day.list.map((o) => {
                const isMe = user && o.userId === user.id;
                return (
                  <View key={o.id} style={[styles.orderCard, shadow.card, isMe && styles.myCard]}>
                    <View style={styles.orderHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.person}>
                          {o.userName}
                          {isMe ? '  (аз)' : ''}
                        </Text>
                        <Text style={styles.orderRest}>{o.restaurantName}</Text>
                      </View>
                      <Text style={styles.orderTotal}>
                        {o.total.toFixed(2)} {CURRENCY}
                      </Text>
                    </View>
                    {o.items.map((it, idx) => (
                      <View key={idx} style={styles.itemRow}>
                        <Text style={styles.itemName}>
                          {it.item_name}
                          {it.quantity > 1 ? ` ×${it.quantity}` : ''}
                        </Text>
                        <Text style={styles.itemPrice}>
                          {Number(it.line_total).toFixed(2)} {CURRENCY}
                        </Text>
                      </View>
                    ))}
                    {isMe ? (
                      <View style={styles.actions}>
                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() => navigation.navigate('EditOrder', { orderId: o.id })}
                        >
                          <Text style={styles.actionText}>✏️ Редактирай</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionBtn} onPress={() => confirmDelete(o.id)}>
                          <Text style={[styles.actionText, { color: colors.danger }]}>🗑️ Изтрий</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ))
        ) : mode === 'summary' ? (
          // ---------- SUMMARY ----------
          days.map((day) => (
            <View key={day.date} style={[styles.summaryCard, shadow.card]}>
              <View style={styles.dayHeaderRow}>
                <Text style={styles.dayHeader}>{formatDate(day.date)}</Text>
                <Text style={styles.dayHeaderTotal}>
                  {day.total.toFixed(2)} {CURRENCY}
                </Text>
              </View>

              <Text style={styles.subHead}>По ресторанти</Text>
              {day.byRestaurant.map(([name, sum]) => (
                <View key={name} style={styles.sumRow}>
                  <Text style={styles.sumName}>{name}</Text>
                  <Text style={styles.sumValue}>
                    {sum.toFixed(2)} {CURRENCY}
                  </Text>
                </View>
              ))}

              <Text style={styles.subHead}>По хора</Text>
              {day.byPerson.map(([name, sum]) => {
                const isMe = user && name.toLowerCase() === user.name.toLowerCase();
                return (
                  <View key={name} style={styles.sumRow}>
                    <Text style={[styles.sumName, isMe && { fontWeight: font.bold, color: colors.text }]}>
                      {name}
                      {isMe ? '  (аз)' : ''}
                    </Text>
                    <Text style={styles.sumValue}>
                      {sum.toFixed(2)} {CURRENCY}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))
        ) : (
          // ---------- CHARTS ----------
          <>
            <View style={styles.rangeChips}>
              {RANGE_OPTIONS.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  onPress={() => setRangeId(r.id)}
                  style={[styles.rangeChip, rangeId === r.id && styles.rangeChipActive]}
                >
                  <Text style={[styles.rangeChipText, rangeId === r.id && styles.rangeChipTextActive]}>
                    {r.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.statsRow}>
              <View style={[styles.statTile, shadow.card]}>
                <Text style={styles.statValue}>
                  {charts.totalSpend.toFixed(2)} {CURRENCY}
                </Text>
                <Text style={styles.statLabel}>Общо похарчено</Text>
              </View>
              <View style={[styles.statTile, shadow.card]}>
                <Text style={styles.statValue}>{charts.orderCount}</Text>
                <Text style={styles.statLabel}>Поръчки</Text>
              </View>
              <View style={[styles.statTile, shadow.card]}>
                <Text style={styles.statValue} numberOfLines={1}>
                  {charts.topDish ? charts.topDish.label : '—'}
                </Text>
                <Text style={styles.statLabel}>Топ ястие</Text>
              </View>
            </View>

            <View style={[styles.chartCard, shadow.card]}>
              <Text style={styles.chartTitle}>🏪 По ресторанти</Text>
              <RankBarChart data={charts.byRestaurant} colors={colors} color={colors.primary} valueFormatter={(v) => `${v.toFixed(2)} ${CURRENCY}`} />
            </View>

            <View style={[styles.chartCard, shadow.card]}>
              <Text style={styles.chartTitle}>👥 По хора</Text>
              <RankBarChart data={charts.byPerson} colors={colors} color={colors.accent} valueFormatter={(v) => `${v.toFixed(2)} ${CURRENCY}`} />
            </View>

            <View style={[styles.chartCard, shadow.card]}>
              <Text style={styles.chartTitle}>🍽️ По ястия (брой поръчани)</Text>
              <RankBarChart data={charts.byDish} colors={colors} color={colors.primary} valueFormatter={(v) => `×${v}`} />
            </View>

            <View style={[styles.chartCard, shadow.card]}>
              <Text style={styles.chartTitle}>📈 Последните 14 дни</Text>
              <TrendChart days={charts.dailyTotals} colors={colors} />
            </View>
          </>
        )}
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  toggleWrap: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  toggle: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  toggleText: { fontSize: font.base, fontWeight: font.semibold, color: colors.textMuted },
  toggleTextActive: { color: colors.onPrimary },

  daySection: { marginBottom: spacing.lg },
  dayHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  dayHeader: { fontSize: font.md, fontWeight: font.bold, color: colors.text, textTransform: 'capitalize' },
  dayHeaderTotal: { fontSize: font.md, fontWeight: font.bold, color: colors.primary },

  orderCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  myCard: { borderColor: colors.primary, borderWidth: 1.5 },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  person: { fontSize: font.md, fontWeight: font.bold, color: colors.text },
  orderRest: { fontSize: font.sm, color: colors.primary, fontWeight: font.semibold, marginTop: 1 },
  orderTotal: { fontSize: font.md, fontWeight: font.bold, color: colors.accent },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  itemName: { fontSize: font.base, color: colors.textMuted, flex: 1 },
  itemPrice: { fontSize: font.base, color: colors.textMuted },
  actions: {
    flexDirection: 'row',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  actionText: { fontSize: font.sm, fontWeight: font.semibold, color: colors.text },

  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  subHead: {
    fontSize: font.xs,
    fontWeight: font.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  sumRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceAlt,
  },
  sumName: { fontSize: font.base, color: colors.textMuted, flex: 1 },
  sumValue: { fontSize: font.base, fontWeight: font.semibold, color: colors.accent },

  rangeChips: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  rangeChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  rangeChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  rangeChipText: { fontSize: font.sm, fontWeight: font.semibold, color: colors.textMuted },
  rangeChipTextActive: { color: colors.primaryDark },

  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  statTile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  statValue: { fontSize: font.md, fontWeight: font.bold, color: colors.text },
  statLabel: { fontSize: font.xs, color: colors.textMuted, marginTop: 2, textAlign: 'center' },

  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chartTitle: { fontSize: font.base, fontWeight: font.bold, color: colors.text, marginBottom: spacing.md },
});
