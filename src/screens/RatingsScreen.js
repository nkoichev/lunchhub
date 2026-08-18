import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchHistory } from '../services/orderService';
import { fetchMyRatings, rateDish, fetchTopRated } from '../services/ratingService';
import { useAuth } from '../context/AuthContext';
import { StarRating, EmptyState, Badge } from '../components/ui';
import { useResponsive } from '../hooks/useResponsive';
import { colors, spacing, radius, font, shadow } from '../theme/theme';

export default function RatingsScreen() {
  const { user } = useAuth();
  const { readWidth } = useResponsive();
  const [dishes, setDishes] = useState([]);
  const [myRatings, setMyRatings] = useState({});
  const [topRated, setTopRated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [history, mine, top] = await Promise.all([
        fetchHistory(user),
        fetchMyRatings(user),
        fetchTopRated(10),
      ]);
      // Unique dishes this user has actually ordered.
      const seen = new Set();
      const ordered = [];
      history.forEach((o) =>
        o.items.forEach((it) => {
          if (!seen.has(it.item_name)) {
            seen.add(it.item_name);
            ordered.push(it.item_name);
          }
        })
      );
      setDishes(ordered);
      setMyRatings(mine);
      setTopRated(top);
    } catch (_) {
      setDishes([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const onRate = async (dish, stars) => {
    // Optimistic update
    setMyRatings((prev) => ({ ...prev, [dish]: { stars } }));
    try {
      await rateDish(user, dish, stars);
      load();
    } catch (e) {
      Alert.alert('Грешка', e.message);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.primary} />}
    >
      <View style={{ width: '100%', maxWidth: readWidth, alignSelf: 'center' }}>
      {/* Team top-rated */}
      {topRated.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>🏆 Топ ястия на екипа</Text>
          {topRated.map((t, i) => (
            <View key={t.item_name} style={[styles.topRow, shadow.card]}>
              <Text style={styles.rank}>{i + 1}</Text>
              <Text style={styles.topName}>{t.item_name}</Text>
              <StarRating value={t.avg_stars} size={14} showValue />
              <Text style={styles.topVotes}>{t.votes} гл.</Text>
            </View>
          ))}
        </>
      )}

      {/* My dishes to rate */}
      <Text style={styles.sectionTitle}>Оцени поръчаните ястия</Text>
      {dishes.length === 0 ? (
        <EmptyState
          emoji="⭐"
          title="Още няма какво да оцените"
          subtitle="Направете поръчка, за да можете да оценявате ястията."
        />
      ) : (
        dishes.map((dish) => {
          const mine = myRatings[dish]?.stars ?? 0;
          return (
            <View key={dish} style={[styles.rateCard, shadow.card]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.dishName}>{dish}</Text>
                {mine > 0 ? (
                  <View style={{ marginTop: 4 }}>
                    <Badge label="Оценено от вас" tone="success" />
                  </View>
                ) : (
                  <Text style={styles.tapHint}>Докоснете звездите</Text>
                )}
              </View>
              <StarRating value={mine} size={26} onRate={(n) => onRate(dish, n)} />
            </View>
          );
        })
      )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  sectionTitle: {
    fontSize: font.md,
    fontWeight: font.bold,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rank: {
    width: 24,
    fontSize: font.md,
    fontWeight: font.bold,
    color: colors.primary,
    textAlign: 'center',
  },
  topName: { flex: 1, fontSize: font.base, fontWeight: font.semibold, color: colors.text, marginLeft: spacing.sm },
  topVotes: { fontSize: font.xs, color: colors.textFaint, marginLeft: spacing.sm, minWidth: 42, textAlign: 'right' },
  rateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dishName: { fontSize: font.md, fontWeight: font.semibold, color: colors.text },
  tapHint: { fontSize: font.sm, color: colors.textFaint, marginTop: 2 },
});
