import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { fetchColleagueNames } from '../services/orderService';
import { normalizeForName } from '../utils/orderLines';
import { Button } from './ui';
import { spacing, radius, font } from '../theme/theme';

// Bottom sheet for picking who an order line is for: the owner ("Аз"),
// any colleague in the users list (or named on an earlier order), or a
// new name typed by hand. When the line has more than one portion, a
// stepper lets you reassign only some of them (e.g. 1 of 2 for Иван).
export default function ForWhomModal({ visible, line, ownerName, onPick, onClose }) {
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [names, setNames] = useState([]);
  const [custom, setCustom] = useState('');
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (!visible) return;
    setCustom('');
    setQty(line?.quantity ?? 1);
    fetchColleagueNames()
      .then(setNames)
      .catch(() => setNames([]));
  }, [visible, line]);

  if (!line) return null;

  const current = line.forName ?? null;
  const options = names.filter(
    (n) => n.trim().toLowerCase() !== (ownerName ?? '').trim().toLowerCase()
  );

  const pick = (forName) => onPick(normalizeForName(forName, ownerName), qty);

  const Chip = ({ label, active, onPress }) => (
    <TouchableOpacity onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {active ? '✓ ' : ''}
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, shadow.floating]}>
          <View style={styles.handle} />
          <Text style={styles.title}>За кого е?</Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {line.name}
          </Text>

          {line.quantity > 1 && (
            <View style={styles.qtyRow}>
              <Text style={styles.qtyLabel}>Брой порции</Text>
              <View style={styles.stepper}>
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => setQty((q) => Math.max(1, q - 1))}
                >
                  <Text style={styles.stepText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.qty}>
                  {qty} / {line.quantity}
                </Text>
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => setQty((q) => Math.min(line.quantity, q + 1))}
                >
                  <Text style={styles.stepText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={styles.chips}>
            <Chip label={`Аз (${ownerName})`} active={current === null} onPress={() => pick(null)} />
            {options.map((n) => (
              <Chip key={n} label={n} active={current === n} onPress={() => pick(n)} />
            ))}
          </ScrollView>

          <Text style={styles.label}>Друг колега</Text>
          <View style={styles.inputRow}>
            <TextInput
              value={custom}
              onChangeText={setCustom}
              placeholder="Въведете име"
              placeholderTextColor={colors.textFaint}
              style={styles.input}
              autoCorrect={false}
              onSubmitEditing={() => custom.trim() && pick(custom)}
              returnKeyType="done"
            />
            <Button
              title="OK"
              small
              disabled={!custom.trim()}
              onPress={() => pick(custom)}
              style={{ marginLeft: spacing.sm, paddingHorizontal: spacing.lg }}
            />
          </View>

          <TouchableOpacity onPress={onClose} style={styles.cancel}>
            <Text style={styles.cancelText}>Затвори</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: spacing.xl,
      width: '100%',
      maxWidth: 640,
      alignSelf: 'center',
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginBottom: spacing.md,
    },
    title: { fontSize: font.lg, fontWeight: font.bold, color: colors.text },
    subtitle: { fontSize: font.sm, color: colors.textMuted, marginTop: 2, marginBottom: spacing.lg },
    qtyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    qtyLabel: { fontSize: font.sm, fontWeight: font.semibold, color: colors.textMuted },
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primaryLight,
      borderRadius: radius.sm,
    },
    stepBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    stepText: { fontSize: 20, color: colors.primaryDark, fontWeight: font.bold },
    qty: { fontSize: font.base, fontWeight: font.bold, minWidth: 44, textAlign: 'center', color: colors.text },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingBottom: spacing.sm },
    chip: {
      paddingHorizontal: spacing.lg,
      paddingVertical: 9,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    chipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
    chipText: { fontSize: font.sm, fontWeight: font.semibold, color: colors.textMuted },
    chipTextActive: { color: colors.primaryDark },
    label: {
      fontSize: font.sm,
      fontWeight: font.semibold,
      color: colors.textMuted,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    inputRow: { flexDirection: 'row', alignItems: 'center' },
    input: {
      flex: 1,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceAlt,
      paddingHorizontal: spacing.lg,
      paddingVertical: 11,
      fontSize: font.md,
      color: colors.text,
    },
    cancel: { alignSelf: 'center', padding: spacing.md, marginTop: spacing.xs },
    cancelText: { color: colors.textMuted, fontSize: font.base, fontWeight: font.semibold },
  });
