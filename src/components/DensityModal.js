import React, { useMemo } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useDensity } from '../context/DensityContext';
import { spacing, radius, font } from '../theme/theme';

// Row height in the preview scales with each option's own density factor,
// so the preview itself demonstrates what picking it will do to real lists.
function PreviewRows({ scale, colors }) {
  const rowHeight = 6 * scale;
  return (
    <View style={styles.previewBox}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={[
            styles.previewRow,
            { height: rowHeight, backgroundColor: colors.border, marginBottom: 4 * scale },
          ]}
        />
      ))}
    </View>
  );
}

export default function DensityModal({ visible, onClose }) {
  const { colors, shadow } = useTheme();
  const { densityId, setDensity, densities } = useDensity();
  const themedStyles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={themedStyles.backdrop}>
        <View style={[themedStyles.sheet, shadow.floating]}>
          <View style={themedStyles.handle} />
          <Text style={themedStyles.title}>Плътност на изгледа</Text>
          <Text style={themedStyles.subtitle}>Изберете колко сбито да е съдържанието</Text>

          {densities.map((d) => {
            const active = d.id === densityId;
            return (
              <TouchableOpacity
                key={d.id}
                style={[themedStyles.row, active && themedStyles.rowActive]}
                activeOpacity={0.7}
                onPress={() => setDensity(d.id)}
              >
                <View style={themedStyles.radio}>
                  {active && <View style={themedStyles.radioDot} />}
                </View>
                <Text style={themedStyles.name}>{d.name}</Text>
                <PreviewRows scale={d.scale} colors={colors} />
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity onPress={onClose} style={themedStyles.close}>
            <Text style={themedStyles.closeText}>Затвори</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  previewBox: { width: 34, justifyContent: 'center' },
  previewRow: { borderRadius: 2, width: '100%' },
});

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
    radio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.md,
    },
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
    name: { flex: 1, fontSize: font.base, fontWeight: font.semibold, color: colors.text },
    close: { alignSelf: 'center', padding: spacing.md, marginTop: spacing.sm },
    closeText: { color: colors.textMuted, fontSize: font.base, fontWeight: font.semibold },
  });
