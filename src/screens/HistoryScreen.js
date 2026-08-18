import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchAllHistory, deleteOrder } from '../services/orderService';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { EmptyState } from '../components/ui';
import { confirmDialog, alertMessage } from '../utils/confirm';
import { useResponsive } from '../hooks/useResponsive';
import { spacing, radius, font, CURRENCY } from '../theme/theme';

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
  const [mode, setMode] = useState('orders'); // 'orders' | 'summary'

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
        ) : (
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
});
