import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { fetchOrder, updateOrder, deleteOrder } from '../services/orderService';
import { Button, EmptyState } from '../components/ui';
import { confirmDialog, alertMessage } from '../utils/confirm';
import { useResponsive } from '../hooks/useResponsive';
import { colors, spacing, radius, font, shadow, CURRENCY } from '../theme/theme';

export default function EditOrderScreen({ route, navigation }) {
  const { orderId } = route.params;
  const { readWidth } = useResponsive();
  const [items, setItems] = useState([]);
  const [restaurantName, setRestaurantName] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const order = await fetchOrder(orderId);
        if (order) {
          setItems(
            order.items.map((it) => ({
              name: it.item_name,
              price: Number(it.price),
              quantity: it.quantity,
            }))
          );
          setRestaurantName(order.restaurant_name);
        }
      } catch (e) {
        alertMessage('Грешка', e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId]);

  const inc = (name) =>
    setItems((prev) =>
      prev.map((i) => (i.name === name ? { ...i, quantity: i.quantity + 1 } : i))
    );

  const dec = (name) =>
    setItems((prev) =>
      prev
        .map((i) => (i.name === name ? { ...i, quantity: i.quantity - 1 } : i))
        .filter((i) => i.quantity > 0)
    );

  const removeItem = (name) =>
    setItems((prev) => prev.filter((i) => i.name !== name));

  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);

  const save = async () => {
    setSaving(true);
    try {
      const res = await updateOrder(orderId, items);
      alertMessage(
        res.deleted ? 'Изтрито' : 'Запазено',
        res.deleted ? 'Поръчката беше премахната.' : 'Поръчката е обновена.'
      );
      navigation.goBack();
    } catch (e) {
      alertMessage('Грешка', e.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    confirmDialog({
      title: 'Изтриване',
      message: 'Сигурни ли сте, че искате да изтриете поръчката?',
      confirmText: 'Изтрий',
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteOrder(orderId);
          navigation.goBack();
        } catch (e) {
          alertMessage('Грешка', e.message);
        }
      },
    });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.list}>
        <View style={{ width: '100%', maxWidth: readWidth, alignSelf: 'center' }}>
        {restaurantName ? (
          <View style={styles.restBanner}>
            <Text style={styles.restBannerLabel}>Поръчка от</Text>
            <Text style={styles.restBannerName}>{restaurantName}</Text>
          </View>
        ) : null}

        {items.length === 0 ? (
          <EmptyState
            emoji="🗑️"
            title="Няма останали ястия"
            subtitle="Ако запазите така, поръчката ще бъде изтрита."
          />
        ) : (
          items.map((item) => (
            <View key={item.name} style={[styles.row, shadow.card]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.unit}>
                  {item.price.toFixed(2)} {CURRENCY} × {item.quantity} ={' '}
                  <Text style={styles.lineTotal}>
                    {(item.price * item.quantity).toFixed(2)} {CURRENCY}
                  </Text>
                </Text>
              </View>
              <View style={styles.stepper}>
                <TouchableOpacity style={styles.stepBtn} onPress={() => dec(item.name)}>
                  <Text style={styles.stepText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.qty}>{item.quantity}</Text>
                <TouchableOpacity style={styles.stepBtn} onPress={() => inc(item.name)}>
                  <Text style={styles.stepText}>+</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => removeItem(item.name)} hitSlop={8} style={styles.removeBtn}>
                <Text style={styles.removeText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        <TouchableOpacity onPress={confirmDelete} style={styles.deleteLink}>
          <Text style={styles.deleteText}>Изтрий цялата поръчка</Text>
        </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={[styles.footer, shadow.floating]}>
        <View style={{ width: '100%', maxWidth: readWidth, alignSelf: 'center' }}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Ново общо</Text>
            <Text style={styles.totalValue}>
              {total.toFixed(2)} {CURRENCY}
            </Text>
          </View>
          <Button
            title={items.length === 0 ? 'Изтрий поръчката' : 'Запази промените'}
            onPress={save}
            loading={saving}
            variant={items.length === 0 ? 'danger' : 'primary'}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  list: { padding: spacing.lg, paddingBottom: spacing.xl },
  restBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  restBannerLabel: { fontSize: font.sm, color: colors.primaryDark },
  restBannerName: { fontSize: font.md, fontWeight: font.bold, color: colors.primaryDark },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  name: { fontSize: font.md, fontWeight: font.semibold, color: colors.text },
  unit: { fontSize: font.sm, color: colors.textMuted, marginTop: 2 },
  lineTotal: { color: colors.accent, fontWeight: font.bold },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    marginHorizontal: spacing.sm,
  },
  stepBtn: { width: 32, height: 36, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 20, color: colors.primaryDark, fontWeight: font.bold },
  qty: { fontSize: font.base, fontWeight: font.bold, minWidth: 18, textAlign: 'center', color: colors.text },
  removeBtn: { paddingLeft: spacing.sm },
  removeText: { fontSize: font.md, color: colors.textFaint },
  deleteLink: { alignSelf: 'center', marginTop: spacing.md, padding: spacing.sm },
  deleteText: { color: colors.danger, fontSize: font.sm, fontWeight: font.semibold },
  footer: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  totalLabel: { fontSize: font.md, color: colors.textMuted, fontWeight: font.medium },
  totalValue: { fontSize: font.xl, fontWeight: font.bold, color: colors.text },
});
