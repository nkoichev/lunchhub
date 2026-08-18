import { Alert, Platform } from 'react-native';

// Alert.alert with multiple buttons doesn't fire callbacks on react-native-web,
// so on web we fall back to window.confirm. Native keeps the nice dialog.
export function confirmDialog({
  title,
  message,
  confirmText = 'OK',
  cancelText = 'Отказ',
  destructive = false,
  onConfirm,
}) {
  if (Platform.OS === 'web') {
    const ok = window.confirm(message ? `${title}\n\n${message}` : title);
    if (ok) onConfirm?.();
    return;
  }
  Alert.alert(title, message, [
    { text: cancelText, style: 'cancel' },
    {
      text: confirmText,
      style: destructive ? 'destructive' : 'default',
      onPress: () => onConfirm?.(),
    },
  ]);
}

// Simple message (works on both platforms).
export function alertMessage(title, message) {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
