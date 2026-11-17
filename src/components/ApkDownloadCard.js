import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Platform, Linking } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { Button } from './ui';
import { spacing, radius, font } from '../theme/theme';

// The Android APK lives on a fixed GitHub Release that scripts/publish-apk.js
// overwrites on every build, so the download URL never changes. The release
// title carries the version ("LunchHub 1.0.0 (build 3)") and the asset's
// updated_at is when the APK was last replaced.
const REPO = 'nkoichev/lunchhub';
const TAG = 'latest-apk';
const ASSET = 'lunchhub.apk';
const APK_URL = `https://github.com/${REPO}/releases/download/${TAG}/${ASSET}`;
const RELEASE_API = `https://api.github.com/repos/${REPO}/releases/tags/${TAG}`;

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

async function fetchApkInfo() {
  const res = await fetch(RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const release = await res.json();
  const asset = (release.assets || []).find((a) => a.name === ASSET);
  const text = `${release.name || ''}\n${release.body || ''}`;
  return {
    version: text.match(/(\d+\.\d+\.\d+)/)?.[1] ?? null,
    build: text.match(/build\s*[:=]?\s*(\d+)/i)?.[1] ?? null,
    updatedAt: asset?.updated_at ?? release.published_at ?? null,
    sizeMb: asset?.size ? Math.round(asset.size / (1024 * 1024)) : null,
  };
}

// Web only: the native app obviously doesn't need a link to itself.
export default function ApkDownloadCard() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [info, setInfo] = useState(null);
  const [showSteps, setShowSteps] = useState(false);

  const isAndroid =
    Platform.OS === 'web' &&
    typeof navigator !== 'undefined' &&
    /android/i.test(navigator.userAgent || '');

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    let alive = true;
    fetchApkInfo()
      .then((i) => alive && setInfo(i))
      .catch(() => {}); // metadata is a nice-to-have; the link works regardless
    return () => {
      alive = false;
    };
  }, []);

  if (Platform.OS !== 'web') return null;

  const onDownload = () => {
    setShowSteps(true);
    if (typeof window !== 'undefined') window.location.href = APK_URL;
    else Linking.openURL(APK_URL);
  };

  const date = info?.updatedAt ? formatDate(info.updatedAt) : null;
  const meta = [
    info?.version && `Версия ${info.version}${info.build ? ` (build ${info.build})` : ''}`,
    date && `обновена ${date}`,
    info?.sizeMb && `${info.sizeMb} MB`,
  ].filter(Boolean);

  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <Text style={styles.icon}>🤖</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Приложение за Android</Text>
          <Text style={styles.meta}>{meta.length ? meta.join(' · ') : 'Актуална версия'}</Text>
        </View>
      </View>

      <Button title="Изтегли APK" variant={isAndroid ? 'primary' : 'ghost'} onPress={onDownload} />

      {!isAndroid && (
        <Text style={styles.hint}>
          Само за Android телефони. Отворете тази страница от телефона си, за да го инсталирате.
        </Text>
      )}

      {(isAndroid || showSteps) && (
        <View style={styles.steps}>
          <Text style={styles.step}>1. Изтеглете файла и го отворете от известията или „Изтегляния“.</Text>
          <Text style={styles.step}>
            2. Ако телефонът попита, разрешете „Инсталиране от този източник“ за браузъра.
          </Text>
          <Text style={styles.step}>3. Натиснете „Инсталиране“ и отворете LunchHub.</Text>
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    card: {
      width: '100%',
      maxWidth: 420,
      alignSelf: 'center',
      marginTop: spacing.xl,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    headRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
    icon: { fontSize: 28, marginRight: spacing.md },
    title: { fontSize: font.md, fontWeight: font.semibold, color: colors.text },
    meta: { fontSize: font.sm, color: colors.textMuted, marginTop: 2 },
    hint: { fontSize: font.sm, color: colors.textFaint, textAlign: 'center', marginTop: spacing.md },
    steps: { marginTop: spacing.md },
    step: { fontSize: font.sm, color: colors.textMuted, lineHeight: 20, marginTop: spacing.xs },
  });
