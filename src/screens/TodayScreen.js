import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchTodaySummary, deleteOrder } from '../services/orderService';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { EmptyState } from '../components/ui';
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { people, grandTotal } = await fetchTodaySummary();
      setPeople(people);
      setGrandTotal(grandTotal);
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

  // Distinct people (a person may have >1 order today).
  const peopleCount = new Set(people.map((p) => p.userId)).size;

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
                  <Text style={styles.personTotal}>
                    {p.total.toFixed(2)} {CURRENCY}
                  </Text>
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
