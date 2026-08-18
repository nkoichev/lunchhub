import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRestaurant } from '../context/RestaurantContext';
import {
  fetchDishes,
  addDish,
  updateDish,
  deleteDish,
  addRestaurant,
} from '../services/menuAdminService';
import { Button, Badge, EmptyState } from '../components/ui';
import DishFormModal from '../components/DishFormModal';
import { confirmDialog, alertMessage } from '../utils/confirm';
import { useResponsive } from '../hooks/useResponsive';
import { isSupabaseConfigured } from '../config/supabase';
import { WEEKDAYS, dayName, CATEGORY_LABELS } from '../data/menu';
import { colors, spacing, radius, font, shadow, CURRENCY } from '../theme/theme';

export default function ManageScreen() {
  const { restaurants, selected, setSelected, reload } = useRestaurant();
  const { columns, maxWidth } = useResponsive();
  const [dishes, setDishes] = useState([]);
  const [loading, setLoading] = useState(true);

  const [dishModal, setDishModal] = useState({ open: false, dish: null });
  const [restModal, setRestModal] = useState(false);
  const [newRestName, setNewRestName] = useState('');
  const [addingRest, setAddingRest] = useState(false);

  const load = useCallback(async () => {
    if (!selected) {
      setDishes([]);
      setLoading(false);
      return;
    }
    try {
      setDishes(await fetchDishes(selected.id));
    } catch (e) {
      setDishes([]);
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  // ---- dish handlers ----
  const saveDish = async ({ name, price, dayIndex, category }) => {
    try {
      if (dishModal.dish) {
        await updateDish(dishModal.dish.id, { name, price, dayIndex, category });
      } else {
        await addDish({ restaurantId: selected.id, name, price, dayIndex, category });
      }
      setDishModal({ open: false, dish: null });
      load();
    } catch (e) {
      alertMessage('Грешка', e.message);
    }
  };

  const confirmDeleteDish = (dish) => {
    confirmDialog({
      title: 'Изтриване',
      message: `Да изтрия ли "${dish.name}"?`,
      confirmText: 'Изтрий',
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteDish(dish.id);
          load();
        } catch (e) {
          alertMessage('Грешка', e.message);
        }
      },
    });
  };

  // ---- restaurant handler ----
  const saveRestaurant = async () => {
    setAddingRest(true);
    try {
      const created = await addRestaurant(newRestName);
      setNewRestName('');
      setRestModal(false);
      await reload();
      setSelected(created);
    } catch (e) {
      alertMessage('Грешка', e.message);
    } finally {
      setAddingRest(false);
    }
  };

  if (!isSupabaseConfigured) {
    return (
      <View style={styles.container}>
        <EmptyState
          emoji="🔌"
          title="Базата данни не е настроена"
          subtitle="Добавете Supabase ключове в app.json, за да управлявате ястия и ресторанти."
        />
      </View>
    );
  }

  // Group dishes by day for display.
  const byDay = {};
  dishes.forEach((d) => {
    (byDay[d.day_index] ??= []).push(d);
  });

  const centered = { width: '100%', maxWidth, alignSelf: 'center' };
  const dishBasis = columns >= 3 ? '31.5%' : columns === 2 ? '48.5%' : '100%';

  return (
    <View style={styles.container}>
      {/* Restaurant selector + add */}
      <View style={styles.barWrap}>
        <View style={[styles.restaurantBar, centered]}>
          {restaurants.map((r) => {
            const active = r.id === selected?.id;
            return (
              <TouchableOpacity
                key={r.id}
                onPress={() => setSelected(r)}
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
          <TouchableOpacity style={styles.addRestChip} onPress={() => setRestModal(true)}>
            <Text style={styles.addRestChipText}>+ Ресторант</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <View style={centered}>
          <Text style={styles.catalogTitle}>
            Ястия · {selected?.name}
            {'  '}
            <Text style={styles.catalogCount}>({dishes.length})</Text>
          </Text>

          {dishes.length === 0 ? (
            <EmptyState
              emoji="📝"
              title="Няма ястия още"
              subtitle="Натиснете „+ Добави ястие“, за да започнете каталога на този ресторант."
            />
          ) : (
            WEEKDAYS.filter((d) => byDay[d]?.length).concat(byDay[0]?.length ? [0] : []).map((d) => (
              <View key={d}>
                <Text style={styles.dayHeader}>{d === 0 ? 'Всеки ден' : dayName(d)}</Text>
                <View style={styles.dishGrid}>
                {byDay[d].map((dish) => (
                  <View key={dish.id} style={[styles.dishRow, shadow.card, { width: dishBasis }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dishName}>{dish.name}</Text>
                      <View style={styles.dishMeta}>
                        <Text style={styles.dishPrice}>
                          {Number(dish.price).toFixed(2)} {CURRENCY}
                        </Text>
                        <Badge label={CATEGORY_LABELS[dish.category] ?? dish.category} />
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={() => setDishModal({ open: true, dish })}
                    >
                      <Text style={styles.iconText}>✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => confirmDeleteDish(dish)}>
                      <Text style={styles.iconText}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                </View>
              </View>
            ))
          )}
          <View style={{ height: 90 }} />
          </View>
        </ScrollView>
      )}

      {/* Floating add-dish button */}
      {selected ? (
        <TouchableOpacity
          style={[styles.fab, shadow.floating]}
          onPress={() => setDishModal({ open: true, dish: null })}
        >
          <Text style={styles.fabText}>+ Добави ястие</Text>
        </TouchableOpacity>
      ) : null}

      {/* Dish add/edit modal */}
      <DishFormModal
        visible={dishModal.open}
        dish={dishModal.dish}
        onClose={() => setDishModal({ open: false, dish: null })}
        onSave={saveDish}
      />

      {/* Add-restaurant modal */}
      <Modal visible={restModal} transparent animationType="slide" onRequestClose={() => setRestModal(false)}>
        <KeyboardAvoidingView
          style={styles.backdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.sheet, shadow.floating]}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>Нов ресторант</Text>
            <Text style={styles.modalLabel}>Име на ресторанта</Text>
            <TextInput
              value={newRestName}
              onChangeText={setNewRestName}
              placeholder="напр. Ресторант Централ"
              placeholderTextColor={colors.textFaint}
              style={styles.modalInput}
              autoFocus
            />
            <Button
              title="Добави ресторант"
              onPress={saveRestaurant}
              loading={addingRest}
              disabled={newRestName.trim().length < 2}
              style={{ marginTop: spacing.xl }}
            />
            <TouchableOpacity onPress={() => setRestModal(false)} style={styles.cancel}>
              <Text style={styles.cancelText}>Отказ</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
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
  addRestChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderStyle: 'dashed',
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  addRestChipText: { fontSize: font.sm, fontWeight: font.bold, color: colors.accent },
  list: { padding: spacing.lg },
  catalogTitle: { fontSize: font.md, fontWeight: font.bold, color: colors.text, marginBottom: spacing.sm },
  catalogCount: { color: colors.textFaint, fontWeight: font.regular },
  dayHeader: {
    fontSize: font.sm,
    fontWeight: font.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  dishGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  dishRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    paddingLeft: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dishName: { fontSize: font.base, fontWeight: font.semibold, color: colors.text },
  dishMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 3 },
  dishPrice: { fontSize: font.sm, fontWeight: font.bold, color: colors.accent },
  iconBtn: { padding: spacing.sm, marginLeft: 2 },
  iconText: { fontSize: 18 },
  fab: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    maxWidth: 400,
    alignSelf: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: 'center',
  },
  fabText: { color: colors.onPrimary, fontSize: font.md, fontWeight: font.bold },
  // modal
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md },
  modalTitle: { fontSize: font.lg, fontWeight: font.bold, color: colors.text, marginBottom: spacing.lg },
  modalLabel: {
    fontSize: font.sm,
    fontWeight: font.semibold,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  modalInput: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
    fontSize: font.md,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
  },
  cancel: { alignSelf: 'center', padding: spacing.md, marginTop: spacing.xs },
  cancelText: { color: colors.textMuted, fontSize: font.base, fontWeight: font.semibold },
});
