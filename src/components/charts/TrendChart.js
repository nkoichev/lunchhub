import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { spacing, radius, font, CURRENCY } from '../../theme/theme';

const CHART_HEIGHT = 110;

function shortDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit' });
}

// Daily-totals column chart with a tap-for-tooltip readout below the bars
// (a persistent axis label per bar would be too dense at this width).
// `formatValue` lets callers show something other than money (e.g. steps).
export default function TrendChart({
  days,
  colors,
  formatValue = (v) => `${v.toFixed(2)} ${CURRENCY}`,
}) {
  const styles = makeStyles(colors);
  const [selected, setSelected] = useState(null);
  const max = Math.max(1, ...days.map((d) => d.total));

  if (!days.length) {
    return <Text style={styles.empty}>Няма данни за визуализация</Text>;
  }

  const active = days.find((d) => d.date === selected) ?? days[days.length - 1];

  return (
    <View>
      <View style={styles.chartRow}>
        {days.map((d, idx) => (
          <Column
            key={d.date}
            d={d}
            index={idx}
            max={max}
            colors={colors}
            selected={d.date === selected}
            onPress={() => setSelected((s) => (s === d.date ? null : d.date))}
          />
        ))}
      </View>
      <View style={styles.readout}>
        <Text style={styles.readoutDate}>{shortDate(active.date)}</Text>
        <Text style={styles.readoutValue}>{formatValue(active.total)}</Text>
      </View>
    </View>
  );
}

function Column({ d, index, max, colors, selected, onPress }) {
  const styles = makeStyles(colors);
  const heightAnim = useRef(new Animated.Value(0)).current;
  const pct = max > 0 ? d.total / max : 0;

  useEffect(() => {
    Animated.timing(heightAnim, {
      toValue: pct,
      duration: 450,
      delay: index * 40,
      useNativeDriver: false,
    }).start();
  }, [pct]);

  const height = heightAnim.interpolate({ inputRange: [0, 1], outputRange: ['4%', '100%'] });

  return (
    <TouchableOpacity style={styles.col} activeOpacity={0.7} onPress={onPress}>
      <View style={styles.colTrack}>
        <Animated.View
          style={[
            styles.colFill,
            { height, backgroundColor: selected ? colors.primaryDark : colors.primary },
          ]}
        />
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: CHART_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 2,
    gap: 4,
  },
  col: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  colTrack: { flex: 1, justifyContent: 'flex-end' },
  colFill: { width: '100%', borderTopLeftRadius: radius.sm, borderTopRightRadius: radius.sm, minHeight: 3 },
  readout: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  readoutDate: { fontSize: font.sm, color: colors.textMuted, fontWeight: font.semibold },
  readoutValue: { fontSize: font.sm, color: colors.text, fontWeight: font.bold },
  empty: { fontSize: font.base, color: colors.textFaint, paddingVertical: spacing.md },
});
