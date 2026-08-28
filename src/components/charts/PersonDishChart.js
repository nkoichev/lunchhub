import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView } from 'react-native';
import { spacing, radius, font } from '../../theme/theme';

const CHART_HEIGHT = 110;
const COL_WIDTH = 30;

function shortDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit' });
}

function fullDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('bg-BG', { day: '2-digit', month: 'long', weekday: 'short' });
}

// Per-person, per-day order chart. Bar height is that day's spend; tapping a
// day reveals exactly which dishes were ordered (a bare total doesn't say
// *what* was eaten, which is the point of this view). Only days the person
// actually ordered are shown, so it scrolls horizontally instead of using a
// fixed window like the team-wide TrendChart.
export default function PersonDishChart({ days, colors }) {
  const styles = makeStyles(colors);
  const [selected, setSelected] = useState(null);
  const max = Math.max(1, ...days.map((d) => d.total));

  if (!days.length) {
    return <Text style={styles.empty}>Няма данни за визуализация</Text>;
  }

  const active = days.find((d) => d.date === selected) ?? days[days.length - 1];

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chartRow}>
          {days.map((d, idx) => (
            <Column
              key={d.date}
              d={d}
              index={idx}
              max={max}
              colors={colors}
              selected={d.date === active.date}
              onPress={() => setSelected((s) => (s === d.date ? null : d.date))}
            />
          ))}
        </View>
      </ScrollView>
      <View style={styles.readout}>
        <Text style={styles.readoutDate}>{fullDate(active.date)}</Text>
        {active.items.map((it) => (
          <View key={it.name} style={styles.readoutRow}>
            <Text style={styles.readoutDish} numberOfLines={1}>
              {it.name}
            </Text>
            <Text style={styles.readoutQty}>×{it.qty}</Text>
          </View>
        ))}
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
      delay: index * 30,
      useNativeDriver: false,
    }).start();
  }, [pct]);

  const height = heightAnim.interpolate({ inputRange: [0, 1], outputRange: ['4%', '100%'] });

  return (
    <TouchableOpacity style={styles.col} activeOpacity={0.7} onPress={onPress}>
      <View style={styles.colTrack}>
        <Animated.View
          style={[styles.colFill, { height, backgroundColor: selected ? colors.primaryDark : colors.primary }]}
        />
      </View>
      <Text style={[styles.colLabel, selected && styles.colLabelActive]} numberOfLines={1}>
        {shortDate(d.date)}
      </Text>
    </TouchableOpacity>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: CHART_HEIGHT + 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 2,
    gap: 6,
  },
  col: { width: COL_WIDTH, height: '100%', alignItems: 'center' },
  colTrack: { width: '100%', height: CHART_HEIGHT, justifyContent: 'flex-end' },
  colFill: { width: '100%', borderTopLeftRadius: radius.sm, borderTopRightRadius: radius.sm, minHeight: 3 },
  colLabel: { fontSize: 9, color: colors.textFaint, marginTop: 4 },
  colLabelActive: { color: colors.primary, fontWeight: font.bold },
  readout: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  readoutDate: {
    fontSize: font.sm,
    fontWeight: font.bold,
    color: colors.text,
    marginBottom: spacing.xs,
    textTransform: 'capitalize',
  },
  readoutRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  readoutDish: { fontSize: font.base, color: colors.textMuted, flex: 1, marginRight: spacing.sm },
  readoutQty: { fontSize: font.base, fontWeight: font.semibold, color: colors.text },
  empty: { fontSize: font.base, color: colors.textFaint, paddingVertical: spacing.md },
});
