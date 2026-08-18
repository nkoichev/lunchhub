import React, { useMemo } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius, font } from '../theme/theme';

export default function ThemeModal({ visible, onClose }) {
  const { colors, shadow, schemeId, setScheme, themes } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, shadow.floating]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Цветова схема</Text>
          <Text style={styles.subtitle}>Изберете оформление за приложението</Text>

          {themes.map((t) => {
            const active = t.id === schemeId;
            return (
              <TouchableOpacity
                key={t.id}
                style={[styles.row, active && styles.rowActive]}
                activeOpacity={0.7}
                onPress={() => setScheme(t.id)}
              >
                <View style={styles.swatches}>
                  <View style={[styles.dot, { backgroundColor: t.colors.primary }]} />
                  <View style={[styles.dot, { backgroundColor: t.colors.accent }]} />
                  <View style={[styles.dot, styles.dotBorder, { backgroundColor: t.colors.bg }]} />
                </View>
                <Text style={styles.name}>{t.name}</Text>
                {active && <Text style={styles.check}>✓</Text>}
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity onPress={onClose} style={styles.close}>
            <Text style={styles.closeText}>Затвори</Text>
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
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: colors.border,
      marginBottom: spacing.sm,
    },
    rowActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
    swatches: { flexDirection: 'row', marginRight: spacing.md },
    dot: { width: 18, height: 18, borderRadius: 9, marginRight: -6 },
    dotBorder: { borderWidth: 1, borderColor: colors.border },
    name: { flex: 1, fontSize: font.base, fontWeight: font.semibold, color: colors.text, marginLeft: spacing.sm },
    check: { fontSize: font.md, fontWeight: font.bold, color: colors.primary },
    close: { alignSelf: 'center', padding: spacing.md, marginTop: spacing.sm },
    closeText: { color: colors.textMuted, fontSize: font.base, fontWeight: font.semibold },
  });
