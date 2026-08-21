import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { spacing, radius, font } from '../../theme/theme';

const MEDALS = ['🥇', '🥈', '🥉'];

// Horizontal ranking bars — one flat color per chart (single series, so no
// legend is needed; the chart title already names what's being measured).
// Tap a row to reveal its share of the total as an inline tooltip.
export default function RankBarChart({ data, colors, color, valueFormatter = (v) => String(v), medals = true, emptyText = 'Няма данни' }) {
  const styles = makeStyles(colors);
  const [selected, setSelected] = useState(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);
  const barColor = color || colors.primary;

  if (!data.length) {
    return <Text style={styles.empty}>{emptyText}</Text>;
  }

  return (
    <View>
      {data.map((item, idx) => (
        <BarRow
          key={item.label}
          item={item}
          index={idx}
          max={max}
          total={total}
          color={barColor}
          colors={colors}
          valueFormatter={valueFormatter}
          medal={medals ? MEDALS[idx] : null}
          selected={selected === item.label}
          onPress={() => setSelected((s) => (s === item.label ? null : item.label))}
        />
      ))}
    </View>
  );
}

function BarRow({ item, index, max, total, color, colors, valueFormatter, medal, selected, onPress }) {
  const styles = makeStyles(colors);
  const widthAnim = useRef(new Animated.Value(0)).current;
  const pct = max > 0 ? item.value / max : 0;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: pct,
      duration: 500,
      delay: index * 70,
      useNativeDriver: false,
    }).start();
  }, [pct]);

  const width = widthAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const share = total > 0 ? Math.round((item.value / total) * 100) : 0;

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={styles.row}>
      <View style={styles.labelRow}>
        <Text style={styles.label} numberOfLines={1}>
          {medal ? `${medal} ` : ''}
          {item.label}
        </Text>
        <Text style={styles.value}>{valueFormatter(item.value)}</Text>
      </View>
      <View style={[styles.track, selected && { backgroundColor: colors.primaryLight }]}>
        <Animated.View style={[styles.fill, { width, backgroundColor: color }]} />
      </View>
      {selected && (
        <Text style={styles.tooltip}>
          {share}% от общото{item.sublabel ? ` · ${item.sublabel}` : ''}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  row: { marginBottom: spacing.md },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label: { fontSize: font.base, fontWeight: font.semibold, color: colors.text, flex: 1, marginRight: spacing.sm },
  value: { fontSize: font.base, fontWeight: font.bold, color: colors.textMuted },
  track: { height: 10, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.sm },
  tooltip: { fontSize: font.xs, color: colors.textFaint, marginTop: 4 },
  empty: { fontSize: font.base, color: colors.textFaint, paddingVertical: spacing.md },
});
