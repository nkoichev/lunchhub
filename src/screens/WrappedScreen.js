import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  Animated,
  Share,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { loadFunData, computeWrapped, wrappedShareText } from '../services/funStatsService';
import LogoSpinner from '../components/LogoSpinner';
import { tapHaptic, successHaptic } from '../utils/haptics';
import { font, spacing, radius, CURRENCY } from '../theme/theme';

// Bold, fixed story colors (independent of the app theme on purpose — it
// should feel like a special occasion, and look good in screenshots).
const PAGE_COLORS = ['#6C3FD1', '#E85D2F', '#16A37F', '#2B7FD6', '#C2357A', '#D88A12', '#1E2A44', '#6C3FD1'];

const fmtDate = (d) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('bg-BG', { day: 'numeric', month: 'long' });
};
const n = (v) => Math.round(v).toLocaleString('bg-BG');

function Page({ width, color, active, children }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (active) {
      a.setValue(0);
      Animated.spring(a, { toValue: 1, useNativeDriver: true, speed: 10, bounciness: 8 }).start();
    }
  }, [active]);
  return (
    <View style={[styles.page, { width, backgroundColor: color }]}>
      <Animated.View
        style={{
          opacity: a,
          transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
          alignItems: 'center',
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
}

export default function WrappedScreen({ route, navigation }) {
  const period = route.params?.period ?? 'thisMonth';
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [w, setW] = useState(null);
  const [index, setIndex] = useState(0);
  const scrollRef = useRef(null);

  useEffect(() => {
    loadFunData()
      .then((data) => setW(computeWrapped(user.id, data, period)))
      .catch(() => setW(null));
  }, [user, period]);

  const pages = useMemo(() => {
    if (!w) return [];
    const list = [];
    list.push(
      <>
        <Text style={styles.kicker}>LunchHub Wrapped · {w.label}</Text>
        <Text style={styles.huge}>{w.persona.emoji}</Text>
        <Text style={styles.title}>Ти си „{w.persona.title}“</Text>
        <Text style={styles.body}>{w.persona.line}</Text>
        <Text style={styles.hint}>плъзни →</Text>
      </>
    );
    if (w.orders > 0) {
      list.push(
        <>
          <Text style={styles.kicker}>Обядва с LunchHub</Text>
          <Text style={styles.big}>{w.orders}</Text>
          <Text style={styles.title}>пъти</Text>
          <Text style={styles.body}>
            Похарчи {w.spent.toFixed(2)} {CURRENCY} · средно {w.avgPerLunch.toFixed(2)} {CURRENCY} на обяд
          </Text>
          {w.teamSize > 1 && (
            <Text style={styles.pill}>
              {w.rank === 1 ? '🥇 Най-редовният в отбора!' : `#${w.rank} от ${w.teamSize} в отбора`}
            </Text>
          )}
        </>
      );
      if (w.favDish) {
        list.push(
          <>
            <Text style={styles.kicker}>Любимото ти ястие</Text>
            <Text style={styles.huge}>❤️</Text>
            <Text style={styles.title}>{w.favDish}</Text>
            <Text style={styles.body}>поръчано {w.favDishCount} {w.favDishCount === 1 ? 'път' : 'пъти'}</Text>
            {w.favRestaurant && w.favRestaurant !== '—' && (
              <Text style={styles.pill}>🏪 Най-често от {w.favRestaurant}</Text>
            )}
          </>
        );
      }
      list.push(
        <>
          <Text style={styles.kicker}>Опита</Text>
          <Text style={styles.big}>{w.distinctDishes}</Text>
          <Text style={styles.title}>различни ястия</Text>
          <Text style={styles.body}>
            {w.newDishes > 0 ? `${w.newDishes} от тях за пръв път 🧭` : 'Нищо ново — знаеш какво харесваш 🎯'}
          </Text>
        </>
      );
      if (w.twin) {
        list.push(
          <>
            <Text style={styles.kicker}>Хранителният ти близнак</Text>
            <Text style={styles.huge}>👯</Text>
            <Text style={styles.title}>{w.twin.name}</Text>
            <Text style={styles.body}>
              Поръчахте едно и също в един и същ ден {w.twin.matches} {w.twin.matches === 1 ? 'път' : 'пъти'}
            </Text>
          </>
        );
      }
    }
    if (w.kcal > 0 || w.totalSteps > 0) {
      list.push(
        <>
          <Text style={styles.kicker}>Калории срещу стъпки</Text>
          <Text style={styles.huge}>⚖️</Text>
          {w.kcal > 0 && <Text style={styles.title}>🍽️ {n(w.kcal)} ккал изядени</Text>}
          {w.totalSteps > 0 && <Text style={styles.title}>🚶 ~{n(w.burnedKcal)} ккал изгорени</Text>}
          {w.totalSteps > 0 && (
            <Text style={styles.body}>
              {n(w.totalSteps)} стъпки · средно {n(w.avgSteps)} на ден
            </Text>
          )}
          {w.bestStepDay && (
            <Text style={styles.pill}>
              🏃 Рекорд: {n(w.bestStepDay.steps)} на {fmtDate(w.bestStepDay.date)}
            </Text>
          )}
        </>
      );
    }
    if (w.priciest || w.timesPaid > 0) {
      list.push(
        <>
          <Text style={styles.kicker}>Големите моменти</Text>
          <Text style={styles.huge}>💸</Text>
          {w.priciest && (
            <Text style={styles.title}>
              Най-скъп обяд: {w.priciest.total.toFixed(2)} {CURRENCY}
            </Text>
          )}
          {w.priciest && <Text style={styles.body}>на {fmtDate(w.priciest.date)}</Text>}
          {w.timesPaid > 0 && (
            <Text style={styles.pill}>
              💰 Черпи отбора {w.timesPaid} {w.timesPaid === 1 ? 'път' : 'пъти'} — благодарим!
            </Text>
          )}
        </>
      );
    }
    list.push(
      <>
        <Text style={styles.kicker}>Това беше {w.label}</Text>
        <Text style={styles.huge}>🎉</Text>
        <Text style={styles.title}>До следващия обяд!</Text>
        <TouchableOpacity
          style={styles.shareBtn}
          onPress={async () => {
            successHaptic();
            const message = wrappedShareText(user.name, w);
            try {
              if (Platform.OS === 'web' && navigator?.clipboard) {
                await navigator.clipboard.writeText(message);
              } else {
                await Share.share({ message });
              }
            } catch (_) {}
          }}
        >
          <Text style={styles.shareText}>{Platform.OS === 'web' ? '📋 Копирай за споделяне' : '📤 Сподели'}</Text>
        </TouchableOpacity>
      </>
    );
    return list;
  }, [w, user]);

  const goTo = (i) => {
    scrollRef.current?.scrollTo({ x: i * width, animated: true });
  };

  if (!w) {
    return (
      <View style={[styles.center, { backgroundColor: PAGE_COLORS[0] }]}>
        <LogoSpinner />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: PAGE_COLORS[index % PAGE_COLORS.length] }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / width);
          if (i !== index) tapHaptic();
          setIndex(i);
        }}
        scrollEventThrottle={16}
        onScroll={Platform.OS === 'web' ? (e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width)) : undefined}
      >
        {pages.map((content, i) => (
          <Page key={i} width={width} color={PAGE_COLORS[i % PAGE_COLORS.length]} active={i === index}>
            {content}
          </Page>
        ))}
      </ScrollView>

      <View style={[styles.topBar, { top: insets.top + spacing.sm }]}>
        <View style={styles.dots}>
          {pages.map((_, i) => (
            <View key={i} style={[styles.dot, i <= index && styles.dotOn]} />
          ))}
        </View>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={styles.close}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.navRow, { bottom: insets.bottom + spacing.lg }]}>
        <TouchableOpacity disabled={index === 0} onPress={() => goTo(index - 1)} style={styles.navBtn}>
          <Text style={[styles.navText, index === 0 && { opacity: 0.3 }]}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={index >= pages.length - 1}
          onPress={() => goTo(index + 1)}
          style={styles.navBtn}
        >
          <Text style={[styles.navText, index >= pages.length - 1 && { opacity: 0.3 }]}>›</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  kicker: {
    color: '#ffffffcc',
    fontSize: font.sm,
    fontWeight: font.bold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  huge: { fontSize: 88, marginVertical: spacing.lg },
  big: { fontSize: 96, fontWeight: font.bold, color: '#fff', marginVertical: spacing.sm },
  title: { fontSize: font.xl, fontWeight: font.bold, color: '#fff', textAlign: 'center', marginTop: 4 },
  body: { fontSize: font.md, color: '#ffffffdd', textAlign: 'center', marginTop: spacing.sm, lineHeight: 24 },
  pill: {
    marginTop: spacing.lg,
    color: '#fff',
    fontSize: font.base,
    fontWeight: font.semibold,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    overflow: 'hidden',
    textAlign: 'center',
  },
  hint: { color: '#ffffff99', fontSize: font.sm, marginTop: spacing.xxl },
  shareBtn: {
    marginTop: spacing.xl,
    backgroundColor: '#fff',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
  },
  shareText: { color: '#1E1B18', fontWeight: font.bold, fontSize: font.md },
  topBar: { position: 'absolute', left: spacing.lg, right: spacing.lg, flexDirection: 'row', alignItems: 'center' },
  dots: { flex: 1, flexDirection: 'row', gap: 4 },
  dot: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)' },
  dotOn: { backgroundColor: '#fff' },
  close: { marginLeft: spacing.md, padding: 4 },
  closeText: { color: '#fff', fontSize: 20, fontWeight: font.bold },
  navRow: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  navBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navText: { color: '#fff', fontSize: 30, fontWeight: font.bold, marginTop: -3 },
});
