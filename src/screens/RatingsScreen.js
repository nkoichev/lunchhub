import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Alert, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchHistory } from '../services/orderService';
import { fetchMyRatings, rateDish, fetchTopRated } from '../services/ratingService';
import { useAuth } from '../context/AuthContext';
import { useRestaurant } from '../context/RestaurantContext';
import { useTheme } from '../context/ThemeContext';
import { StarRating, EmptyState, Badge } from '../components/ui';
import RatingDetailsModal from '../components/RatingDetailsModal';
import ReviewModal from '../components/ReviewModal';
import { tapHaptic } from '../utils/haptics';
import { invalidateFunData } from '../services/funStatsService';
import { useResponsive } from '../hooks/useResponsive';
import { spacing, radius, font } from '../theme/theme';
import LogoSpinner from '../components/LogoSpinner';

export default function RatingsScreen() {
  const { user } = useAuth();
  const { restaurants, selected, setSelected } = useRestaurant();
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { readWidth } = useResponsive();
  const [dishes, setDishes] = useState([]);
  const [myRatings, setMyRatings] = useState({});
  const [topRated, setTopRated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailsDish, setDetailsDish] = useState(null);
  const [reviewDish, setReviewDish] = useState(null);

  const load = useCallback(async () => {
    if (!selected) {
      setDishes([]);
      setMyRatings({});
      setTopRated([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const [history, mine, top] = await Promise.all([
        fetchHistory(user),
        fetchMyRatings(user, selected.id),
        fetchTopRated(selected.id, 10),
      ]);
      // Unique dishes this user has ordered from THIS restaurant — ratings
      // don't carry over between restaurants even for a same-named dish.
      const seen = new Set();
      const ordered = [];
      history
        .filter((o) => o.restaurant_id === selected.id)
        .forEach((o) =>
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
  }, [user, selected]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const onRate = async (dish, stars) => {
    tapHaptic();
    // Optimistic update (keeps any written review/photo)
    setMyRatings((prev) => ({ ...prev, [dish]: { ...prev[dish], stars } }));
    try {
      await rateDish(user, selected.id, dish, stars);
      invalidateFunData();
      load();
    } catch (e) {
      Alert.alert('Грешка', e.message);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <LogoSpinner />
      </View>
    );
  }

  return (
    <>
    <View style={styles.screen}>
      {restaurants.length > 1 && (
        <View style={styles.barWrap}>
          <View style={[styles.restaurantBar, { maxWidth: readWidth, alignSelf: 'center', width: '100%' }]}>
            {restaurants.map((r) => {
              const active = r.id === selected?.id;
              return (
                <TouchableOpacity
                  key={r.id}
                  onPress={() => setSelected(r)}
                  style={[styles.restChip, active && styles.restChipActive]}
                >
                  <Text numberOfLines={1} style={[styles.restChipText, active && styles.restChipTextActive]}>
                    {r.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.primary} />}
      >
      <View style={{ width: '100%', maxWidth: readWidth, alignSelf: 'center' }}>
      {/* Team top-rated */}
      {topRated.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>🏆 Топ ястия · {selected?.name}</Text>
          {topRated.map((t, i) => (
            <TouchableOpacity
              key={t.item_name}
              style={[styles.topRow, shadow.card]}
              activeOpacity={0.7}
              onPress={() => setDetailsDish(t.item_name)}
            >
              <Text style={styles.rank}>{i + 1}</Text>
              <Text style={styles.topName}>{t.item_name}</Text>
              <StarRating value={t.avg_stars} size={14} showValue />
              <Text style={styles.topVotes}>{t.votes} гл.</Text>
            </TouchableOpacity>
          ))}
        </>
      )}

      {/* My dishes to rate */}
      <Text style={styles.sectionTitle}>Оцени поръчаните ястия</Text>
      {dishes.length === 0 ? (
        <EmptyState
          emoji="⭐"
          title="Още няма какво да оцените"
          subtitle="Направете поръчка от този ресторант, за да можете да оценявате ястията."
        />
      ) : (
        dishes.map((dish) => {
          const mineFull = myRatings[dish];
          const mine = mineFull?.stars ?? 0;
          const hasReview = !!(mineFull?.comment || mineFull?.photoUrl);
          return (
            <View key={dish} style={[styles.rateCard, shadow.card]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.dishName}>{dish}</Text>
                {mine > 0 ? (
                  <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                    <Badge label="Оценено от вас" tone="success" />
                    <TouchableOpacity onPress={() => setReviewDish(dish)} hitSlop={6}>
                      <Text style={styles.reviewLink}>{hasReview ? '✏️ Ревю' : '✍️ Напиши ревю'}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={styles.tapHint}>Докоснете звездите</Text>
                )}
                {mineFull?.comment ? (
                  <Text style={styles.myComment} numberOfLines={2}>
                    „{mineFull.comment}“{mineFull.photoUrl ? '  📷' : ''}
                  </Text>
                ) : null}
              </View>
              <StarRating value={mine} size={26} onRate={(n) => onRate(dish, n)} />
            </View>
          );
        })
      )}
      </View>
      </ScrollView>
    </View>
    <RatingDetailsModal
      visible={!!detailsDish}
      itemName={detailsDish}
      restaurantId={selected?.id}
      user={user}
      onClose={() => setDetailsDish(null)}
      onChanged={load}
    />
    <ReviewModal
      visible={!!reviewDish}
      user={user}
      restaurantId={selected?.id}
      itemName={reviewDish}
      initial={reviewDish ? myRatings[reviewDish] : null}
      onClose={() => setReviewDish(null)}
      onSaved={() => {
        invalidateFunData();
        load();
      }}
    />
    </>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  barWrap: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  restaurantBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  restChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
    flexShrink: 0,
  },
  restChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  restChipText: { fontSize: font.sm, fontWeight: font.semibold, color: colors.textMuted },
  restChipTextActive: { color: colors.onPrimary },
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
  reviewLink: { fontSize: font.sm, fontWeight: font.semibold, color: colors.primary },
  myComment: { fontSize: font.sm, color: colors.textMuted, marginTop: 4, fontStyle: 'italic' },
  tapHint: { fontSize: font.sm, color: colors.textFaint, marginTop: 2 },
});
