import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Alert, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchTodaySummary, deleteOrder, todayDateString } from '../services/orderService';
import { fetchDayPayer, setDayPayer, markOrderPaid } from '../services/paymentService';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { EmptyState, Badge } from '../components/ui';
import { confirmDialog, alertMessage } from '../utils/confirm';
import { useResponsive } from '../hooks/useResponsive';
import { spacing, radius, font, CURRENCY } from '../theme/theme';

export default function TodayScreen({ navigation }) {
  const { user } = useAuth();
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { columns, maxWidth } = useResponsive();
  const [people, setPeople] = useState([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [payerUserId, setPayerUserId] = useState(null);
  const [payerBusy, setPayerBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ people, grandTotal }, payer] = await Promise.all([
        fetchTodaySummary(),
        fetchDayPayer(todayDateString()),
      ]);
      setPeople(people);
      setGrandTotal(grandTotal);
      setPayerUserId(payer);
    } catch (_) {
      setPeople([]);
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
      message: 'Да изтрия ли поръчката?',
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

  // Totals per dish per restaurant — what to actually order/dictate by phone.
  const orderSummary = useMemo(() => {
    const byRestaurant = {};
    people.forEach((p) => {
      const rest = p.restaurantName || 'Без ресторант';
      if (!byRestaurant[rest]) byRestaurant[rest] = {};
      p.items.forEach((it) => {
        if (!byRestaurant[rest][it.name]) {
          byRestaurant[rest][it.name] = { quantity: 0, names: new Set() };
        }
        byRestaurant[rest][it.name].quantity += it.quantity;
        byRestaurant[rest][it.name].names.add(p.name);
      });
    });
    return Object.entries(byRestaurant)
      .map(([restaurantName, itemsMap]) => ({
        restaurantName,
        items: Object.entries(itemsMap)
          .map(([name, { quantity, names }]) => ({
            name,
            quantity,
            names: [...names].sort((a, b) => a.localeCompare(b)),
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.restaurantName.localeCompare(b.restaurantName));
  }, [people]);

  // Distinct people (a person may have >1 order today).
  const peopleCount = new Set(people.map((p) => p.userId)).size;
  const distinctPeople = Object.values(
    people.reduce((acc, p) => {
      if (!acc[p.userId]) acc[p.userId] = { userId: p.userId, name: p.name };
      return acc;
    }, {})
  );
  const payer = people.find((p) => p.userId === payerUserId);

  const onPickPayer = async (userId) => {
    const next = payerUserId === userId ? null : userId; // tap again to unset
    setPayerBusy(true);
    setPayerUserId(next);
    try {
      await setDayPayer(todayDateString(), next);
      load();
    } catch (e) {
      alertMessage('Грешка', e.message);
    } finally {
      setPayerBusy(false);
    }
  };

  const onPay = (p) => {
    if (!payer?.revolutTag) {
      alertMessage('Няма Revolut таг', 'Платецът още не си е задал Revolut таг.');
      return;
    }
    // Revolut doesn't publicly document a URL format for pre-filling the
    // amount on a personal revolut.me link (unlike e.g. paypal.me) — the
    // amount+currency suffix we used to build here gets rejected by the
    // Revolut app ("We couldn't open that link"). Link to the bare profile
    // instead and let the person type the amount themselves; it's shown
    // right on this button.
    const url = `https://revolut.me/${payer.revolutTag}`;
    Linking.openURL(url).catch(() =>
      alertMessage('Грешка', 'Линкът не можа да се отвори.')
    );
  };

  const onTogglePaid = async (p) => {
    try {
      await markOrderPaid(p.orderId, !p.isPaid);
      setPeople((prev) =>
        prev.map((x) => (x.orderId === p.orderId ? { ...x, isPaid: !x.isPaid } : x))
      );
    } catch (e) {
      alertMessage('Грешка', e.message);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const centered = { width: '100%', maxWidth, alignSelf: 'center' };
  const cardBasis = columns >= 2 ? '48.5%' : '100%';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <View style={centered}>
      {people.length === 0 ? (
        <EmptyState
          emoji="🕛"
          title="Още няма поръчки днес"
          subtitle="Бъдете първи — направете поръчка от менюто."
        />
      ) : (
        <>
          <View style={[styles.totalCard, shadow.card]}>
            <Text style={styles.totalCardLabel}>Общо за днес</Text>
            <Text style={styles.totalCardValue}>
              {grandTotal.toFixed(2)} {CURRENCY}
            </Text>
            <Text style={styles.totalCardSub}>
              {peopleCount} {peopleCount === 1 ? 'човек' : 'души'} поръчаха
            </Text>
          </View>

          <View style={[styles.payerCard, shadow.card]}>
            <Text style={styles.payerLabel}>Кой плаща днес?</Text>
            <View style={styles.payerChips}>
              {distinctPeople.map((dp) => {
                const active = dp.userId === payerUserId;
                return (
                  <TouchableOpacity
                    key={dp.userId}
                    disabled={payerBusy}
                    onPress={() => onPickPayer(dp.userId)}
                    style={[styles.payerChip, active && styles.payerChipActive]}
                  >
                    <Text style={[styles.payerChipText, active && styles.payerChipTextActive]}>
                      {active ? '💰 ' : ''}
                      {dp.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {!payerUserId && (
              <Text style={styles.payerHint}>Изберете кой плаща сметката днес, за да се появят бутоните за плащане.</Text>
            )}
          </View>

          <View style={styles.grid}>
          {people.map((p) => {
            const isMe =
              user &&
              (p.userId === user.id ||
                p.name.toLowerCase() === user.name.toLowerCase());
            return (
              <View key={p.orderId} style={[styles.personCard, shadow.card, isMe && styles.myCard, { width: cardBasis }]}>
                <View style={styles.personHeader}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{p.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.personName}>
                      {p.name}
                      {isMe ? '  (аз)' : ''}
                    </Text>
                    {p.restaurantName ? (
                      <Text style={styles.personRest}>{p.restaurantName}</Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.personTotal}>
                      {p.total.toFixed(2)} {CURRENCY}
                    </Text>
                    {p.totalCalories > 0 && (
                      <Text style={styles.personCalories}>🔥 {p.totalCalories} ккал</Text>
                    )}
                  </View>
                </View>
                {p.items.map((it, idx) => (
                  <View key={idx} style={styles.itemRow}>
                    <Text style={styles.itemName}>
                      {it.name}
                      {it.quantity > 1 ? ` ×${it.quantity}` : ''}
                    </Text>
                    <Text style={styles.itemPrice}>
                      {it.lineTotal.toFixed(2)} {CURRENCY}
                    </Text>
                  </View>
                ))}

                {payerUserId && p.userId === payerUserId && (
                  <View style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}>
                    <Badge label="💰 Плаща днес" tone="primary" />
                  </View>
                )}
                {payerUserId && p.userId !== payerUserId && (
                  <View style={styles.payRow}>
                    <TouchableOpacity style={styles.payBtn} onPress={() => onPay(p)}>
                      <Text style={styles.payBtnText}>
                        💳 Плати {p.total.toFixed(2)} {CURRENCY}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.paidToggle, p.isPaid && styles.paidToggleActive]}
                      onPress={() => onTogglePaid(p)}
                    >
                      <Text style={[styles.paidToggleText, p.isPaid && styles.paidToggleTextActive]}>
                        {p.isPaid ? '✅ Платено' : 'Платено?'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {isMe ? (
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => navigation.navigate('EditOrder', { orderId: p.orderId })}
                    >
                      <Text style={styles.actionText}>✏️ Редактирай</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => confirmDelete(p.orderId)}>
                      <Text style={[styles.actionText, { color: colors.danger }]}>🗑️ Изтрий</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            );
          })}
          </View>

          <View style={[styles.summaryCard, shadow.card]}>
            <Text style={styles.payerLabel}>📞 Поръчка</Text>
            {orderSummary.map((r) => (
              <View key={r.restaurantName} style={styles.summaryRestaurant}>
                <Text style={styles.summaryRestaurantName}>{r.restaurantName}</Text>
                {r.items.map((it) => (
                  <View key={it.name} style={styles.summaryRow}>
                    <Text style={styles.summaryItemName}>{it.name}</Text>
                    <Text style={styles.summaryQty}>×{it.quantity}</Text>
                    <Text style={styles.summaryNames}>{it.names.join(', ')}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </>
      )}
      </View>
    </ScrollView>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  totalCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  totalCardLabel: { color: '#ffffffcc', fontSize: font.sm, fontWeight: font.semibold, textTransform: 'uppercase', letterSpacing: 0.8 },
  totalCardValue: { color: colors.onPrimary, fontSize: font.xxl, fontWeight: font.bold, marginTop: 4 },
  totalCardSub: { color: '#ffffffcc', fontSize: font.sm, marginTop: 2 },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryRestaurant: { marginTop: spacing.sm },
  summaryRestaurantName: {
    fontSize: font.base,
    fontWeight: font.bold,
    color: colors.primary,
    marginBottom: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 4,
    paddingLeft: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  summaryItemName: { fontSize: font.base, color: colors.text, flex: 1.2, fontWeight: font.semibold },
  summaryQty: { fontSize: font.base, color: colors.textMuted, fontWeight: font.bold, flex: 0.4, textAlign: 'center' },
  summaryNames: { fontSize: font.sm, color: colors.textMuted, flex: 1.4, textAlign: 'right' },
  payerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  payerLabel: {
    fontSize: font.sm,
    fontWeight: font.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  payerChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  payerChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  payerChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  payerChipText: { fontSize: font.sm, fontWeight: font.semibold, color: colors.textMuted },
  payerChipTextActive: { color: colors.primaryDark },
  payerHint: { fontSize: font.xs, color: colors.textFaint, marginTop: spacing.sm },
  payRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  payBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
  },
  payBtnText: { fontSize: font.sm, fontWeight: font.semibold, color: colors.onPrimary },
  paidToggle: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  paidToggleActive: { backgroundColor: '#E4F4EE', borderColor: colors.success },
  paidToggleText: { fontSize: font.sm, fontWeight: font.semibold, color: colors.textMuted },
  paidToggleTextActive: { color: colors.success },
  personCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  myCard: { borderColor: colors.primary, borderWidth: 1.5 },
  personHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: { color: colors.primaryDark, fontWeight: font.bold, fontSize: font.md },
  personName: { fontSize: font.md, fontWeight: font.bold, color: colors.text },
  personRest: { fontSize: font.xs, color: colors.primary, fontWeight: font.semibold, marginTop: 1 },
  personTotal: { fontSize: font.md, fontWeight: font.bold, color: colors.accent },
  personCalories: { fontSize: font.xs, color: colors.textFaint, marginTop: 1 },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingLeft: 46,
  },
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
});
