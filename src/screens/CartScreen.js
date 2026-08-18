import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useRestaurant } from '../context/RestaurantContext';
import { placeOrder } from '../services/orderService';
import { Button, EmptyState } from '../components/ui';
import { alertMessage } from '../utils/confirm';
import { useResponsive } from '../hooks/useResponsive';
import { colors, spacing, radius, font, shadow, CURRENCY } from '../theme/theme';

export default function CartScreen({ navigation }) {
  const { list, total, add, decrement, remove, clear, count } = useCart();
  const { user } = useAuth();
  const { selected } = useRestaurant();
  const { readWidth } = useResponsive();
  const [placing, setPlacing] = useState(false);

  const submit = async () => {
    setPlacing(true);
    try {
      await placeOrder(user, list, selected);
      clear();
      alertMessage('Готово! 🎉', 'Поръчката е изпратена.');
      navigation.navigate('Today');
    } catch (e) {
      alertMessage('Грешка', e.message);
    } finally {
      setPlacing(false);
    }
  };

  if (count === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          emoji="🛒"
          title="Кошницата е празна"
          subtitle="Добавете ястия от менюто, за да направите поръчка."
        />
        <View style={styles.emptyBtnWrap}>
          <Button title="Към менюто" variant="ghost" onPress={() => navigation.navigate('Menu')} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.list, { alignItems: 'stretch' }]}>
        <View style={{ width: '100%', maxWidth: readWidth, alignSelf: 'center' }}>
        {selected ? (
          <View style={styles.restBanner}>
            <Text style={styles.restBannerLabel}>Поръчка от</Text>
            <Text style={styles.restBannerName}>{selected.name}</Text>
          </View>
        ) : null}
        {list.map((item) => (
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
              <TouchableOpacity style={styles.stepBtn} onPress={() => decrement(item.name)}>
                <Text style={styles.stepText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.qty}>{item.quantity}</Text>
              <TouchableOpacity style={styles.stepBtn} onPress={() => add(item)}>
                <Text style={styles.stepText}>+</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => remove(item.name)} hitSlop={8} style={styles.removeBtn}>
              <Text style={styles.removeText}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity onPress={clear} style={styles.clearLink}>
          <Text style={styles.clearText}>Изчисти кошницата</Text>
        </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={[styles.footer, shadow.floating]}>
        <View style={{ width: '100%', maxWidth: readWidth, alignSelf: 'center' }}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Общо</Text>
            <Text style={styles.totalValue}>
              {total.toFixed(2)} {CURRENCY}
            </Text>
          </View>
          <Button title="Поръчай" onPress={submit} loading={placing} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
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
  clearLink: { alignSelf: 'center', marginTop: spacing.md, padding: spacing.sm },
  clearText: { color: colors.danger, fontSize: font.sm, fontWeight: font.semibold },
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
  emptyBtnWrap: { paddingHorizontal: spacing.xl },
});
