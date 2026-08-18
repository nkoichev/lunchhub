import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Button } from './ui';
import { useTheme } from '../context/ThemeContext';
import { FORM_DAYS, dayName, CATEGORY_LABELS, CATEGORY_ORDER } from '../data/menu';
import { spacing, radius, font } from '../theme/theme';

// dish === null -> add mode; otherwise edit mode.
export default function DishFormModal({ visible, dish, defaultDay, onClose, onSave }) {
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [day, setDay] = useState(0);
  const [category, setCategory] = useState('main');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(dish?.name ?? '');
      setPrice(dish ? String(dish.price) : '');
      setDay(dish?.day_index ?? defaultDay ?? 0);
      setCategory(dish?.category ?? 'main');
      setSaving(false);
    }
  }, [visible, dish, defaultDay]);

  const submit = async () => {
    setSaving(true);
    try {
      await onSave({ name, price, dayIndex: day, category });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.sheet, shadow.floating]}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.handle} />
            <Text style={styles.title}>{dish ? 'Редакция на ястие' : 'Ново ястие'}</Text>

            <Text style={styles.label}>Име</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="напр. Пилешка супа"
              placeholderTextColor={colors.textFaint}
              style={styles.input}
              autoFocus={!dish}
            />

            <Text style={styles.label}>Цена (€)</Text>
            <TextInput
              value={price}
              onChangeText={setPrice}
              placeholder="напр. 3.20"
              placeholderTextColor={colors.textFaint}
              keyboardType="decimal-pad"
              style={styles.input}
            />

            <Text style={styles.label}>Ден</Text>
            <View style={styles.chipRow}>
              {FORM_DAYS.map((d) => {
                const active = d === day;
                return (
                  <TouchableOpacity
                    key={d}
                    onPress={() => setDay(d)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {d === 0 ? 'Всеки ден' : dayName(d).slice(0, 3)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>Категория</Text>
            <View style={styles.chipRow}>
              {CATEGORY_ORDER.map((c) => {
                const active = c === category;
                return (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setCategory(c)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {CATEGORY_LABELS[c]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Button
              title={dish ? 'Запази' : 'Добави'}
              onPress={submit}
              loading={saving}
              disabled={name.trim().length < 2}
              style={{ marginTop: spacing.xl }}
            />
            <TouchableOpacity onPress={onClose} style={styles.cancel}>
              <Text style={styles.cancelText}>Отказ</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    maxHeight: '88%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: { fontSize: font.lg, fontWeight: font.bold, color: colors.text, marginBottom: spacing.lg },
  label: {
    fontSize: font.sm,
    fontWeight: font.semibold,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
    fontSize: font.md,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: font.sm, fontWeight: font.semibold, color: colors.textMuted },
  chipTextActive: { color: colors.onPrimary },
  cancel: { alignSelf: 'center', padding: spacing.md, marginTop: spacing.xs },
  cancelText: { color: colors.textMuted, fontSize: font.base, fontWeight: font.semibold },
});
