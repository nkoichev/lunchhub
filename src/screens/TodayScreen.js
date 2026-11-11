import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchTodaySummary, deleteOrder, todayDateString } from '../services/orderService';
import { fetchDayPayer, setDayPayer, markOrderPaid, markForNamePaid, fetchPayerCandidates } from '../services/paymentService';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useDensity } from '../context/DensityContext';
import { EmptyState, Badge } from '../components/ui';
import Avatar from '../components/Avatar';
import { confirmDialog, alertMessage } from '../utils/confirm';
import { useResponsive } from '../hooks/useResponsive';
import { spacing, radius, font, CURRENCY } from '../theme/theme';
import LogoSpinner from '../components/LogoSpinner';
import { groupByForName } from '../utils/orderLines';

export default function TodayScreen({ navigation }) {
  const { user } = useAuth();
  const { colors, shadow } = useTheme();
  const { densityId, scale } = useDensity();
  const isCompact = densityId === 'compact';
  const styles = useMemo(() => makeStyles(colors, scale), [colors, scale]);
  const { columns, maxWidth } = useResponsive();
  const [people, setPeople] = useState([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [payerUserId, setPayerUserId] = useState(null);
  const [payerBusy, setPayerBusy] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ people, grandTotal }, payer, users] = await Promise.all([
        fetchTodaySummary(),
        fetchDayPayer(todayDateString()),
        fetchPayerCandidates().catch(() => []),
      ]);
      setPeople(people);
      setAllUsers(users);
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
        byRestaurant[rest][it.name].names.add(it.forName || p.name);
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
  // Headcount counts colleagues someone ordered for, not just accounts.
  const peopleCount = new Set(
    people.flatMap((p) =>
      p.items.map((it) => (it.forName || p.name).trim().toLowerCase())
    )
  ).size;
  // Everyone who eats today — order owners plus colleagues ordered for
  // (one of them may be the one who paid the restaurant). Names typed by
  // hand are matched to an app account when possible; without an account
  // they can't receive payments (no Revolut tag), so they show disabled.
  const usersByLowerName = useMemo(() => {
    const m = new Map();
    allUsers.forEach((u) => m.set(u.name.trim().toLowerCase(), u));
    return m;
  }, [allUsers]);
  const distinctPeople = useMemo(() => {
    const acc = new Map();
    people.forEach((p) => {
      if (p.items.some((it) => !it.forName) && !acc.has(p.userId)) {
        acc.set(p.userId, { userId: p.userId, name: p.name, avatarUrl: p.avatarUrl, revolutTag: p.revolutTag });
      }
      p.items.forEach((it) => {
        if (!it.forName) return;
        const key = it.forName.trim().toLowerCase();
        const u = usersByLowerName.get(key);
        const id = u ? u.id : `name:${key}`;
        if (acc.has(id)) return;
        acc.set(
          id,
          u
            ? { userId: u.id, name: u.name, avatarUrl: u.avatar_url, revolutTag: u.revolut_tag }
            : { userId: id, name: it.forName.trim(), avatarUrl: null, revolutTag: null, noAccount: true }
        );
      });
    });
    return [...acc.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [people, usersByLowerName]);
  const payer =
    distinctPeople.find((dp) => dp.userId === payerUserId) ||
    (() => {
      const u = allUsers.find((x) => x.id === payerUserId);
      return u ? { userId: u.id, name: u.name, revolutTag: u.revolut_tag } : null;
    })();

  // What a card's owner owes the payer: the whole order minus any dishes
  // that were for the payer themself.
  const isPayerName = (name) =>
    !!payer && name.trim().toLowerCase() === payer.name.trim().toLowerCase();

  // What the card's owner owes for their own dishes. Dishes ordered for
  // colleagues are settled by each colleague separately (see the per-group
  // pay rows), so they're not part of the owner's amount.
  const ownerOwed = (p) =>
    p.items.filter((it) => !it.forName).reduce((s, it) => s + it.lineTotal, 0);

  const onPickPayer = async (userId) => {
    const next = payerUserId === userId ? null : userId; // tap again to unset
    if (next) {
      const target = distinctPeople.find((dp) => dp.userId === next);
      if (target?.noAccount) {
        alertMessage('Няма профил', `${target.name} няма профил в приложението, затова не може да получава плащания тук.`);
        return;
      }
    }
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

  const onPay = (amount) => {
    if (!payer?.revolutTag) {
      alertMessage(
        'Няма Revolut таг',
        `${payer?.name || 'Този човек'} няма Revolut таг — платете му ${amount.toFixed(2)} ${CURRENCY} по друг начин и отбележете „Платено“.`
      );
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

  const onToggleForNamePaid = async (p, forName, paid) => {
    try {
      await markForNamePaid(p.orderId, forName, !paid);
      setPeople((prev) =>
        prev.map((x) =>
          x.orderId === p.orderId
            ? { ...x, items: x.items.map((it) => (it.forName === forName ? { ...it, isPaid: !paid } : it)) }
            : x
        )
      );
    } catch (e) {
      alertMessage('Грешка', e.message);
    }
  };

  // "Плати" + "Платено?" row, shared by the owner's own dishes and each
  // colleague's group of dishes inside a card.
  // One compact line: what's owed on the left, a checkbox-style toggle on
  // the right. Once paid, the left side collapses to a quiet confirmation.
  const renderPayRow = (amount, paid, onToggle) => {
    const amt = `${amount.toFixed(2)} ${CURRENCY}`;
    return (
      <View style={styles.payRow}>
        {paid ? (
          <Text style={styles.payDoneText} numberOfLines={1}>
            Платено на {payer?.name ?? '—'}
          </Text>
        ) : payer?.revolutTag ? (
          <TouchableOpacity style={styles.payBtn} onPress={() => onPay(amount)}>
            <Text style={styles.payBtnText} numberOfLines={1}>💳 Плати {amt}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.oweText} numberOfLines={2}>
            Дължи <Text style={styles.oweAmount}>{amt}</Text> на {payer?.name ?? '—'}
          </Text>
        )}
        <TouchableOpacity
          style={[styles.paidToggle, paid && styles.paidToggleActive]}
          onPress={onToggle}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <View style={[styles.checkbox, paid && styles.checkboxActive]}>
            {paid && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={[styles.paidToggleText, paid && styles.paidToggleTextActive]}>Платено</Text>
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <LogoSpinner />
      </View>
    );
  }

  const centered = { width: '100%', maxWidth, alignSelf: 'center' };

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
            <Text style={styles.payerLabel}>На кого плащаме днес?</Text>
            <View style={styles.payerChips}>
              {distinctPeople.map((dp) => {
                const active = dp.userId === payerUserId;
                const noTag = !dp.revolutTag || dp.noAccount;
                return (
                  <TouchableOpacity
                    key={dp.userId}
                    disabled={payerBusy}
                    onPress={() => onPickPayer(dp.userId)}
                    style={[styles.payerChip, active && styles.payerChipActive, noTag && styles.payerChipDisabled, noTag && active && styles.payerChipDisabledActive]}
                  >
                    <Avatar uri={dp.avatarUrl} name={dp.name} size={18} />
                    <Text style={[styles.payerChipText, active && styles.payerChipTextActive]}>
                      {active ? '💰 ' : ''}
                      {dp.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {!payerUserId && (
              <Text style={styles.payerHint}>Изберете на кого плащаме днес (кой е платил сметката), за да се появят бутоните за плащане.</Text>
            )}
          </View>

          {(() => {
          const renderCard = (p) => {
            const isMe =
              user &&
              (p.userId === user.id ||
                p.name.toLowerCase() === user.name.toLowerCase());
            return (
              <View key={p.orderId} style={[styles.personCard, shadow.card, isMe && styles.myCard]}>
                <View style={styles.personHeader}>
                  <Avatar uri={p.avatarUrl} name={p.name} size={34} />
                  <View style={{ flex: 1, marginLeft: spacing.md }}>
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
                    {p.totalCalories > 0 && !isCompact && (
                      <Text style={styles.personCalories}>🔥 {p.totalCalories} ккал</Text>
                    )}
                  </View>
                </View>
                {(() => {
                  // Dishes ordered for colleagues are grouped under their
                  // name with a subtotal, so it's clear who owes what.
                  const groups = groupByForName(p.items, (it) => it.lineTotal);
                  const showHeaders = groups.some((g) => g.forName !== null);
                  return groups.map((g) => (
                    <View key={g.forName ?? '__me__'}>
                      {showHeaders && (
                        <View style={styles.forHeader}>
                          <Text style={styles.forHeaderName}>
                            👤 {g.forName ?? p.name}
                          </Text>
                          <Text style={styles.forHeaderTotal}>
                            {g.total.toFixed(2)} {CURRENCY}
                          </Text>
                        </View>
                      )}
                      {g.items.map((it, idx) => (
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
                      {showHeaders && g.forName === null && payerUserId && p.userId !== payerUserId && g.total > 0.004 && (
                        <View style={{ marginLeft: 46 }}>
                          {renderPayRow(g.total, p.isPaid, () => onTogglePaid(p))}
                        </View>
                      )}
                      {payerUserId && g.forName !== null && (
                        isPayerName(g.forName) ? (
                          <View style={{ marginTop: spacing.xs, marginLeft: 46, alignSelf: 'flex-start' }}>
                            <Badge label="💰 Получава плащанията" tone="primary" />
                          </View>
                        ) : (
                          <View style={{ marginLeft: 46 }}>
                            {(() => {
                              const paid = g.items.every((it) => it.isPaid);
                              return renderPayRow(g.total, paid, () => onToggleForNamePaid(p, g.forName, paid));
                            })()}
                          </View>
                        )
                      )}
                    </View>
                  ));
                })()}

                {payerUserId && p.userId === payerUserId && (
                  <View style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}>
                    <Badge label="💰 Получава плащанията" tone="primary" />
                  </View>
                )}
                {payerUserId && p.userId !== payerUserId && ownerOwed(p) > 0.004 &&
                  !p.items.some((it) => it.forName) && (
                  // Plain card (no colleagues' dishes): owner's row at the bottom.
                  // Otherwise it's rendered under the owner's own group above.
                  renderPayRow(ownerOwed(p), p.isPaid, () => onTogglePaid(p))
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
          };
          if (columns < 2) return people.map(renderCard);
          // Masonry: each card goes to the currently shortest column (by a
          // rough height estimate), so cards keep their natural height
          // instead of stretching to match a taller neighbour in a row.
          const estimate = (p) => {
            const groups = new Set(p.items.map((it) => it.forName ?? '__me__')).size;
            const hasFor = p.items.some((it) => it.forName);
            return 3 + p.items.length + (hasFor ? groups * 2 : 1) + (p.userId === user?.id ? 2 : 0);
          };
          const cols = Array.from({ length: Math.min(columns, 2) }, () => ({ h: 0, items: [] }));
          people.forEach((p) => {
            const target = cols.reduce((a, b) => (b.h < a.h ? b : a));
            target.items.push(p);
            target.h += estimate(p);
          });
          return (
            <View style={styles.grid}>
              {cols.map((c, i) => (
                <View key={i} style={styles.gridCol}>
                  {c.items.map(renderCard)}
                </View>
              ))}
            </View>
          );
          })()}

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

const makeStyles = (colors, scale = 1) => {
  const s = (v) => Math.max(2, Math.round(v * scale));
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  grid: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  gridCol: { flex: 1, minWidth: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  totalCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: s(spacing.xl),
    marginBottom: s(spacing.lg),
    alignItems: 'center',
  },
  totalCardLabel: { color: '#ffffffcc', fontSize: font.sm, fontWeight: font.semibold, textTransform: 'uppercase', letterSpacing: 0.8 },
  totalCardValue: { color: colors.onPrimary, fontSize: font.xxl, fontWeight: font.bold, marginTop: 4 },
  totalCardSub: { color: '#ffffffcc', fontSize: font.sm, marginTop: 2 },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: s(spacing.lg),
    marginBottom: s(spacing.lg),
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
    paddingVertical: s(4),
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
    padding: s(spacing.lg),
    marginBottom: s(spacing.lg),
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  payerChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  payerChipDisabled: { opacity: 0.45 },
  // No Revolut tag but picked: stays faded, with a strong outline so it's
  // still obvious who's being paid today.
  payerChipDisabledActive: { opacity: 0.7, borderColor: colors.primary, borderWidth: 2.5 },
  payerChipText: { fontSize: font.sm, fontWeight: font.semibold, color: colors.textMuted },
  payerChipTextActive: { color: colors.primaryDark },
  payerHint: { fontSize: font.xs, color: colors.textFaint, marginTop: spacing.sm },
  payRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: s(6),
    marginBottom: s(2),
    paddingVertical: s(6),
    paddingHorizontal: s(10),
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  payBtn: {
    flexShrink: 1,
    paddingVertical: s(6),
    paddingHorizontal: s(14),
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  payBtnText: { fontSize: font.sm, fontWeight: font.semibold, color: colors.onPrimary },
  oweText: { flex: 1, fontSize: font.sm, color: colors.textMuted },
  oweAmount: { fontWeight: font.bold, color: colors.text },
  payDoneText: { flex: 1, fontSize: font.sm, color: colors.textFaint },
  paidToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: s(5),
    paddingHorizontal: s(10),
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  paidToggleActive: { borderColor: colors.success },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.textFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: colors.success, borderColor: colors.success },
  checkmark: { color: '#fff', fontSize: 11, fontWeight: font.bold, lineHeight: 13 },
  paidToggleText: { fontSize: font.sm, fontWeight: font.semibold, color: colors.textMuted },
  paidToggleTextActive: { color: colors.success },
  personCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: s(spacing.lg),
    marginBottom: s(spacing.sm),
    borderWidth: 1,
    borderColor: colors.border,
  },
  myCard: { borderColor: colors.primary, borderWidth: 1.5 },
  personHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: s(spacing.sm) },
  personName: { fontSize: font.md, fontWeight: font.bold, color: colors.text },
  personRest: { fontSize: font.xs, color: colors.primary, fontWeight: font.semibold, marginTop: 1 },
  personTotal: { fontSize: font.md, fontWeight: font.bold, color: colors.accent },
  personCalories: { fontSize: font.xs, color: colors.textFaint, marginTop: 1 },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: s(4),
    paddingLeft: 46,
  },
  itemName: { fontSize: font.base, color: colors.textMuted, flex: 1 },
  forHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: s(spacing.sm),
    marginLeft: 46,
    paddingTop: s(4),
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  forHeaderName: { fontSize: font.sm, fontWeight: font.bold, color: colors.primaryDark, flex: 1 },
  forHeaderTotal: { fontSize: font.sm, fontWeight: font.bold, color: colors.textMuted },
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
};
