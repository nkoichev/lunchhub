import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Image,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { rateDish, uploadDishPhoto } from '../services/ratingService';
import { alertMessage } from '../utils/confirm';
import { successHaptic, tapHaptic } from '../utils/haptics';
import { Button, StarRating } from './ui';
import { spacing, radius, font } from '../theme/theme';

// expo-image-picker is a native module — only present in APKs built after
// it was added. Load lazily so an OTA update on an older APK just hides the
// photo button instead of crashing.
let ImagePicker = null;
try {
  // eslint-disable-next-line global-require
  ImagePicker = require('expo-image-picker');
} catch (_) {
  ImagePicker = null;
}

const MAX_COMMENT = 280;

// Write a short review (text + optional photo) for a dish you've rated.
export default function ReviewModal({ visible, user, restaurantId, itemName, initial, onClose, onSaved }) {
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [photoUrl, setPhotoUrl] = useState(null); // already uploaded
  const [picked, setPicked] = useState(null); // { uri, base64, mimeType } not yet uploaded
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setStars(initial?.stars ?? 0);
    setComment(initial?.comment ?? '');
    setPhotoUrl(initial?.photoUrl ?? null);
    setPicked(null);
  }, [visible, initial]);

  const pickPhoto = async (fromCamera) => {
    if (!ImagePicker) return;
    try {
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          alertMessage('Няма достъп', 'Разрешете достъп до камерата от настройките на телефона.');
          return;
        }
      }
      const opts = { mediaTypes: ['images'], quality: 0.45, base64: true, allowsEditing: true, aspect: [4, 3] };
      const res = fromCamera
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      if (!a.base64) {
        alertMessage('Грешка', 'Снимката не можа да се прочете.');
        return;
      }
      tapHaptic();
      setPicked({ uri: a.uri, base64: a.base64, mimeType: a.mimeType || 'image/jpeg' });
    } catch (e) {
      alertMessage('Грешка', e.message);
    }
  };

  const save = async () => {
    if (!stars) {
      alertMessage('Звезди', 'Изберете поне една звезда.');
      return;
    }
    setSaving(true);
    try {
      let url = photoUrl;
      if (picked) url = await uploadDishPhoto(user, restaurantId, picked.base64, picked.mimeType);
      await rateDish(user, restaurantId, itemName, stars, { comment, photoUrl: url });
      successHaptic();
      onSaved?.();
      onClose();
    } catch (e) {
      alertMessage('Грешка', e.message);
    } finally {
      setSaving(false);
    }
  };

  const preview = picked?.uri || photoUrl;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={[styles.sheet, shadow.floating]}>
          <View style={styles.handle} />
          <Text style={styles.title}>✍️ Ревю</Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {itemName}
          </Text>

          <View style={{ alignItems: 'center', marginBottom: spacing.md }}>
            <StarRating value={stars} size={34} onRate={(n) => { tapHaptic(); setStars(n); }} />
          </View>

          <TextInput
            value={comment}
            onChangeText={(t) => setComment(t.slice(0, MAX_COMMENT))}
            placeholder="Как беше? „Мусаката днес е 🔥“"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            multiline
          />
          <Text style={styles.counter}>
            {comment.length}/{MAX_COMMENT}
          </Text>

          {preview ? (
            <View style={styles.photoWrap}>
              <Image source={{ uri: preview }} style={styles.photo} />
              <TouchableOpacity
                style={styles.photoRemove}
                onPress={() => {
                  setPicked(null);
                  setPhotoUrl(null);
                }}
              >
                <Text style={styles.photoRemoveText}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {ImagePicker ? (
            <View style={styles.photoBtns}>
              {Platform.OS !== 'web' && (
                <TouchableOpacity style={styles.photoBtn} onPress={() => pickPhoto(true)}>
                  <Text style={styles.photoBtnText}>📷 Снимай</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.photoBtn} onPress={() => pickPhoto(false)}>
                <Text style={styles.photoBtnText}>🖼️ От галерията</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.hint}>📷 Снимките работят след като инсталирате новата версия на приложението.</Text>
          )}

          <Button title="Запази ревюто" onPress={save} loading={saving} style={{ marginTop: spacing.md }} />
          <TouchableOpacity onPress={onClose} style={styles.cancel}>
            <Text style={styles.cancelText}>Затвори</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
      width: '100%',
      maxWidth: 640,
      alignSelf: 'center',
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
    subtitle: { fontSize: font.base, color: colors.textMuted, marginTop: 2, marginBottom: spacing.md },
    input: {
      minHeight: 80,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      fontSize: font.base,
      color: colors.text,
      backgroundColor: colors.surfaceAlt,
      textAlignVertical: 'top',
    },
    counter: { fontSize: font.xs, color: colors.textFaint, textAlign: 'right', marginTop: 2 },
    photoWrap: { marginTop: spacing.sm, alignSelf: 'flex-start' },
    photo: { width: 160, height: 120, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
    photoRemove: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    photoRemoveText: { color: '#fff', fontSize: 12, fontWeight: font.bold },
    photoBtns: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    photoBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
    },
    photoBtnText: { fontSize: font.sm, fontWeight: font.semibold, color: colors.text },
    hint: { fontSize: font.xs, color: colors.textFaint, marginTop: spacing.md },
    cancel: { alignSelf: 'center', padding: spacing.md, marginTop: spacing.xs },
    cancelText: { color: colors.textMuted, fontSize: font.base, fontWeight: font.semibold },
  });
