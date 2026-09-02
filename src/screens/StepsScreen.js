import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useResponsive } from '../hooks/useResponsive';
import { EmptyState } from '../components/ui';
import RankBarChart from '../components/charts/RankBarChart';
import TrendChart from '../components/charts/TrendChart';
import StepsCompareChart, { PERSON_COLORS } from '../components/charts/StepsCompareChart';
import { alertMessage } from '../utils/confirm';
import { spacing, radius, font } from '../theme/theme';
import { fetchAllSteps, todayDateString, dateStringDaysAgo } from '../services/stepService';
import { syncDeviceSteps, syncDeviceStepsNow } from '../services/stepSyncService';

const RANGE_OPTIONS = [
  { id: '7', label: '7 дни', days: 7 },
  { id: '30', label: '30 дни', days: 30 },
  { id: 'all', label: 'Всички', days: null },
];

const COMPARE_DAYS = 14;   // fixed head-to-head window
const TREND_DAYS = 14;     // fixed personal-trend window
const MAX_COMPARE_PEOPLE = 6;

const fmt = (n) => Math.round(n || 0).toLocaleString('bg-BG');

function longDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('bg-BG', { day: '2-digit', month: 'long', weekday: 'short' });
}

export default function StepsScreen() {
  const { user } = useAuth();
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { readWidth } = useResponsive();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [mode, setMode] = useState('today'); // 'today' | 'leaderboard' | 'compare' | 'me'
  const [rangeId, setRangeId] = useState('7');
  const [picked, setPicked] = useState(null); // Set<userId> | null (=auto top N)

  const load = useCallback(async () => {
    try {
      setRows(await fetchAllSteps());
    } catch (_) {
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // On every focus: pull fresh data from Health Connect (silent), then reload.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        await syncDeviceSteps(user);
        if (alive) await load();
      })();
      return () => {
        alive = false;
      };
    }, [load, user])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await syncDeviceSteps(user);
    await load();
  };

  const onSyncNow = async () => {
    setSyncing(true);
    try {
      const { today, yesterday } = await syncDeviceStepsNow(user);
      await load();
      alertMessage('Готово', `Днес: ${fmt(today)} стъпки\nВчера: ${fmt(yesterday)} стъпки`);
    } catch (e) {
      alertMessage('Health Connect', e.message);
    } finally {
      setSyncing(false);
    }
  };

  // ---- Range-filtered rows (leaderboard / me stats) ----
  const rangedRows = useMemo(() => {
    const range = RANGE_OPTIONS.find((r) => r.id === rangeId);
    if (!range?.days) return rows;
    const cutoff = dateStringDaysAgo(range.days - 1);
    return rows.filter((r) => r.date >= cutoff);
  }, [rows, rangeId]);

  // ---- Per-person aggregates for the leaderboard ----
  const leaderboard = useMemo(() => {
    const byUser = new Map();
    rangedRows.forEach((r) => {
      if (!byUser.has(r.userId)) {
        byUser.set(r.userId, { name: r.userName, total: 0, days: 0, best: 0 });
      }
      const p = byUser.get(r.userId);
      p.total += r.steps;
      if (r.steps > 0) p.days += 1;
      p.best = Math.max(p.best, r.steps);
    });

    const people = Array.from(byUser.entries()).map(([userId, p]) => ({
      userId,
      ...p,
      avg: p.days ? Math.round(p.total / p.days) : 0,
    }));
    people.sort((a, b) => b.total - a.total);

    const teamTotal = people.reduce((s, p) => s + p.total, 0);
    const mine = people.find((p) => p.userId === user?.id) || null;
    const myRank = mine ? people.findIndex((p) => p.userId === user?.id) + 1 : null;

    return {
      people,
      teamTotal,
      mine,
      myRank,
      byTotal: people.slice(0, 8).map((p) => ({ label: p.name, value: p.total })),
      byAvg: people
        .slice()
        .sort((a, b) => b.avg - a.avg)
        .slice(0, 8)
        .map((p) => ({ label: p.name, value: p.avg })),
    };
  }, [rangedRows, user]);

  // ---- Today ----
  const myTodaySteps = useMemo(() => {
    const today = todayDateString();
    const r = rows.find((x) => x.userId === user?.id && x.date === today);
    return r ? r.steps : null;
  }, [rows, user]);

  const todayRows = useMemo(() => {
    const today = todayDateString();
    return rows
      .filter((r) => r.date === today && r.steps > 0)
      .sort((a, b) => b.steps - a.steps);
  }, [rows]);

  // ---- Head-to-head comparison (fixed window) ----
  const compare = useMemo(() => {
    const dates = [];
    for (let i = COMPARE_DAYS - 1; i >= 0; i--) dates.push(dateStringDaysAgo(i));
    const since = dates[0];

    const windowRows = rows.filter((r) => r.date >= since);
    const totals = new Map();
    const names = new Map();
    windowRows.forEach((r) => {
      totals.set(r.userId, (totals.get(r.userId) || 0) + r.steps);
      names.set(r.userId, r.userName);
    });

    const pool = Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([userId]) => userId);

    const chosen = picked
      ? pool.filter((id) => picked.has(id))
      : pool.slice(0, MAX_COMPARE_PEOPLE);

    const series = chosen.map((userId, i) => {
      const byDate = {};
      windowRows
        .filter((r) => r.userId === userId)
        .forEach((r) => {
          byDate[r.date] = r.steps;
        });
      return { userId, name: names.get(userId) || '—', color: PERSON_COLORS[i % PERSON_COLORS.length], byDate };
    });

    return { dates, series, pool: pool.map((id) => ({ userId: id, name: names.get(id) || '—' })) };
  }, [rows, picked]);

  // ---- My personal trend + stats ----
  const me = useMemo(() => {
    const myAll = rows.filter((r) => r.userId === user?.id);
    const byDate = {};
    myAll.forEach((r) => {
      byDate[r.date] = r.steps;
    });

    const trend = [];
    for (let i = TREND_DAYS - 1; i >= 0; i--) {
      const key = dateStringDaysAgo(i);
      trend.push({ date: key, total: byDate[key] || 0 });
    }

    const inRange = myAll.filter((r) => rangedRows.includes(r));
    const total = inRange.reduce((s, r) => s + r.steps, 0);
    const activeDays = inRange.filter((r) => r.steps > 0).length;
    const best = inRange.reduce((m, r) => Math.max(m, r.steps), 0);

    // Consecutive days with a >0 entry, ending today or yesterday.
    const logged = new Set(myAll.filter((r) => r.steps > 0).map((r) => r.date));
    let streak = 0;
    for (let i = 0; ; i++) {
      const key = dateStringDaysAgo(i);
      if (logged.has(key)) streak += 1;
      else if (i === 0) continue; // today may not be counted yet
      else break;
    }

    return {
      trend,
      total,
      activeDays,
      avg: activeDays ? Math.round(total / activeDays) : 0,
      best,
      streak,
      hasAny: myAll.some((r) => r.steps > 0),
    };
  }, [rows, user, rangedRows]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const showRange = mode === 'leaderboard' || mode === 'me';

  return (
    <View style={styles.container}>
      <View style={styles.toggleWrap}>
        <View style={[styles.toggle, { maxWidth: readWidth, alignSelf: 'center', width: '100%' }]}>
          {[
            ['today', '👟 Днес'],
            ['leaderboard', '🏆 Класация'],
            ['compare', '📊 Сравнение'],
            ['me', '📈 Аз'],
          ].map(([id, label]) => (
            <TouchableOpacity
              key={id}
              style={[styles.toggleBtn, mode === id && styles.toggleBtnActive]}
              onPress={() => setMode(id)}
            >
              <Text style={[styles.toggleText, mode === id && styles.toggleTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <View style={{ width: '100%', maxWidth: readWidth, alignSelf: 'center' }}>
          {showRange && (
            <View style={styles.rangeChips}>
              {RANGE_OPTIONS.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  onPress={() => setRangeId(r.id)}
                  style={[styles.rangeChip, rangeId === r.id && styles.rangeChipActive]}
                >
                  <Text style={[styles.rangeChipText, rangeId === r.id && styles.rangeChipTextActive]}>
                    {r.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* ---------- TODAY ---------- */}
          {mode === 'today' && (
            <>
              <View style={[styles.card, shadow.card]}>
                <Text style={styles.cardTitle}>Моите стъпки днес</Text>
                <Text style={styles.bigValue}>{myTodaySteps != null ? fmt(myTodaySteps) : '—'}</Text>
                <Text style={styles.cardSub}>{longDate(todayDateString())}</Text>

                {Platform.OS === 'android' ? (
                  <TouchableOpacity
                    style={[styles.syncBtn, syncing && { opacity: 0.6 }]}
                    onPress={onSyncNow}
                    disabled={syncing}
                  >
                    <Text style={styles.syncBtnText}>
                      {syncing ? 'Синхронизиране…' : '🔄 Обнови от Health Connect'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.muted}>
                    Стъпките се четат автоматично от Health Connect на Android устройство.
                  </Text>
                )}
              </View>

              <View style={[styles.chartCard, shadow.card]}>
                <Text style={styles.chartTitle}>🏆 Класация за днес</Text>
                {todayRows.length === 0 ? (
                  <Text style={styles.muted}>Още няма стъпки за днес.</Text>
                ) : (
                  <RankBarChart
                    data={todayRows.map((r) => ({ label: r.userName, value: r.steps }))}
                    colors={colors}
                    color={colors.primary}
                    valueFormatter={fmt}
                  />
                )}
              </View>
            </>
          )}

          {/* ---------- LEADERBOARD ---------- */}
          {mode === 'leaderboard' &&
            (leaderboard.people.length === 0 ? (
              <EmptyState
                emoji="🏆"
                title="Няма данни"
                subtitle="Класацията ще се появи, щом има синхронизирани стъпки за този период."
              />
            ) : (
              <>
                <View style={styles.statsRow}>
                  <View style={[styles.statTile, shadow.card]}>
                    <Text style={styles.statValue}>{fmt(leaderboard.mine?.total || 0)}</Text>
                    <Text style={styles.statLabel}>Моите стъпки</Text>
                  </View>
                  <View style={[styles.statTile, shadow.card]}>
                    <Text style={styles.statValue}>
                      {leaderboard.myRank ? `#${leaderboard.myRank}` : '—'}
                    </Text>
                    <Text style={styles.statLabel}>Моето място</Text>
                  </View>
                  <View style={[styles.statTile, shadow.card]}>
                    <Text style={styles.statValue}>{fmt(leaderboard.teamTotal)}</Text>
                    <Text style={styles.statLabel}>Общо екип</Text>
                  </View>
                </View>

                <View style={[styles.chartCard, shadow.card]}>
                  <Text style={styles.chartTitle}>👣 Общо стъпки</Text>
                  <RankBarChart
                    data={leaderboard.byTotal}
                    colors={colors}
                    color={colors.primary}
                    valueFormatter={fmt}
                  />
                </View>

                <View style={[styles.chartCard, shadow.card]}>
                  <Text style={styles.chartTitle}>📅 Среден на активен ден</Text>
                  <RankBarChart
                    data={leaderboard.byAvg}
                    colors={colors}
                    color={colors.accent}
                    valueFormatter={fmt}
                  />
                </View>
              </>
            ))}

          {/* ---------- COMPARE ---------- */}
          {mode === 'compare' &&
            (compare.pool.length === 0 ? (
              <EmptyState
                emoji="📊"
                title="Няма данни"
                subtitle="Нужни са поне няколко дни с данни, за да се сравняват колеги."
              />
            ) : (
              <>
                <Text style={styles.hint}>
                  Последните {COMPARE_DAYS} дни · избери кого да сравниш
                </Text>
                <View style={styles.peopleWrap}>
                  {compare.pool.map((p) => {
                    const active = picked ? picked.has(p.userId) : compare.series.some((s) => s.userId === p.userId);
                    return (
                      <TouchableOpacity
                        key={p.userId}
                        onPress={() =>
                          setPicked((prev) => {
                            const next = new Set(prev ?? compare.series.map((s) => s.userId));
                            if (next.has(p.userId)) next.delete(p.userId);
                            else next.add(p.userId);
                            return next;
                          })
                        }
                        style={[styles.personChip, active && styles.personChipActive]}
                      >
                        <Text
                          numberOfLines={1}
                          style={[styles.personChipText, active && styles.personChipTextActive]}
                        >
                          {p.name}
                          {user && p.userId === user.id ? ' (аз)' : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {compare.series.length === 0 ? (
                  <Text style={styles.muted}>Избери поне един човек.</Text>
                ) : (
                  <View style={[styles.chartCard, shadow.card]}>
                    <Text style={styles.chartTitle}>📊 Стъпки по дни</Text>
                    <StepsCompareChart
                      series={compare.series}
                      dates={compare.dates}
                      colors={colors}
                    />
                  </View>
                )}
              </>
            ))}

          {/* ---------- ME ---------- */}
          {mode === 'me' &&
            (!me.hasAny ? (
              <EmptyState
                emoji="📈"
                title="Все още няма стъпки"
                subtitle="Личният ти напредък ще се появи, щом стъпките се синхронизират от Health Connect."
              />
            ) : (
              <>
                <View style={styles.statsRow}>
                  <View style={[styles.statTile, shadow.card]}>
                    <Text style={styles.statValue}>{fmt(me.total)}</Text>
                    <Text style={styles.statLabel}>Общо (период)</Text>
                  </View>
                  <View style={[styles.statTile, shadow.card]}>
                    <Text style={styles.statValue}>{fmt(me.avg)}</Text>
                    <Text style={styles.statLabel}>Среден / ден</Text>
                  </View>
                  <View style={[styles.statTile, shadow.card]}>
                    <Text style={styles.statValue}>{fmt(me.best)}</Text>
                    <Text style={styles.statLabel}>Най-добър ден</Text>
                  </View>
                </View>

                <View style={styles.statsRow}>
                  <View style={[styles.statTile, shadow.card]}>
                    <Text style={styles.statValue}>🔥 {me.streak}</Text>
                    <Text style={styles.statLabel}>Поредни дни</Text>
                  </View>
                  <View style={[styles.statTile, shadow.card]}>
                    <Text style={styles.statValue}>{me.activeDays}</Text>
                    <Text style={styles.statLabel}>Активни дни</Text>
                  </View>
                </View>

                <View style={[styles.chartCard, shadow.card]}>
                  <Text style={styles.chartTitle}>📈 Последните {TREND_DAYS} дни</Text>
                  <TrendChart days={me.trend} colors={colors} formatValue={fmt} />
                </View>
              </>
            ))}
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
    content: { padding: spacing.lg, paddingBottom: spacing.xxl },

    toggleWrap: {
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
    },
    toggle: { flexDirection: 'row', gap: spacing.sm },
    toggleBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    toggleBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    toggleText: { fontSize: font.sm, fontWeight: font.semibold, color: colors.textMuted },
    toggleTextActive: { color: colors.onPrimary },

    rangeChips: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
    rangeChip: {
      paddingHorizontal: spacing.lg,
      paddingVertical: 8,
      borderRadius: radius.pill,
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    rangeChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
    rangeChipText: { fontSize: font.sm, fontWeight: font.semibold, color: colors.textMuted },
    rangeChipTextActive: { color: colors.primaryDark },

    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.lg,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    cardTitle: { fontSize: font.sm, fontWeight: font.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    bigValue: { fontSize: font.xxl + 8, fontWeight: font.bold, color: colors.primary, marginTop: spacing.xs },
    cardSub: { fontSize: font.sm, color: colors.textMuted, textTransform: 'capitalize', marginTop: 2 },

    syncBtn: {
      alignSelf: 'stretch',
      marginTop: spacing.lg,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1.5,
      borderColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
    },
    syncBtnText: { fontSize: font.base, fontWeight: font.bold, color: colors.primary },

    statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
    statTile: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      alignItems: 'center',
    },
    statValue: { fontSize: font.md, fontWeight: font.bold, color: colors.text, textAlign: 'center' },
    statLabel: { fontSize: font.xs, color: colors.textMuted, marginTop: 2, textAlign: 'center' },

    chartCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.lg,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chartTitle: { fontSize: font.base, fontWeight: font.bold, color: colors.text, marginBottom: spacing.md },

    peopleWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
    personChip: {
      paddingHorizontal: spacing.lg,
      paddingVertical: 9,
      borderRadius: radius.pill,
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    personChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    personChipText: { fontSize: font.sm, fontWeight: font.semibold, color: colors.textMuted },
    personChipTextActive: { color: colors.onPrimary },

    hint: { fontSize: font.sm, color: colors.textMuted, marginBottom: spacing.sm },
    muted: { fontSize: font.base, color: colors.textFaint, paddingVertical: spacing.sm, textAlign: 'center' },
  });
