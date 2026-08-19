import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { CartProvider, useCart } from './src/context/CartContext';
import { RestaurantProvider } from './src/context/RestaurantContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import AppHeader from './src/components/AppHeader';

import PinGateScreen from './src/screens/PinGateScreen';
import LoginScreen from './src/screens/LoginScreen';
import MenuScreen from './src/screens/MenuScreen';
import CartScreen from './src/screens/CartScreen';
import TodayScreen from './src/screens/TodayScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import RatingsScreen from './src/screens/RatingsScreen';
import EditOrderScreen from './src/screens/EditOrderScreen';
import ManageScreen from './src/screens/ManageScreen';

import { font } from './src/theme/theme';

// Show a banner/alert even while the app is in the foreground — a "someone
// ordered" notification is useless if it only appears when backgrounded.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

const PIN_STORAGE_KEY = 'lunchhub.pinVerified';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TAB_ICON = {
  MenuTab: '🍽️',
  Today: '👥',
  History: '📜',
  Ratings: '⭐',
  Manage: '📝',
};

function TabIcon({ route, focused }) {
  return (
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.45 }}>
      {TAB_ICON[route.name]}
    </Text>
  );
}

// Menu tab is itself a stack so it can push the Cart screen.
function MenuStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Menu" component={MenuScreen} />
      <Stack.Screen
        name="Cart"
        component={CartScreen}
        options={{
          headerShown: true,
          title: 'Кошница',
          headerTintColor: colors.text,
          headerStyle: { backgroundColor: colors.surface },
        }}
      />
    </Stack.Navigator>
  );
}

function MainTabs() {
  const { count } = useCart();
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textFaint,
          tabBarLabelStyle: { fontSize: 11, fontWeight: font.semibold },
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            height: 62,
            paddingBottom: 8,
            paddingTop: 6,
          },
          tabBarIcon: ({ focused }) => <TabIcon route={route} focused={focused} />,
        })}
      >
        <Tab.Screen
          name="MenuTab"
          component={MenuStack}
          options={{
            title: 'Меню',
            tabBarBadge: count > 0 ? count : undefined,
            tabBarBadgeStyle: { backgroundColor: colors.primary },
          }}
        />
        <Tab.Screen name="Today" component={TodayScreen} options={{ title: 'Днес' }} />
        <Tab.Screen name="History" component={HistoryScreen} options={{ title: 'История' }} />
        <Tab.Screen name="Ratings" component={RatingsScreen} options={{ title: 'Оценки' }} />
        <Tab.Screen name="Manage" component={ManageScreen} options={{ title: 'Ястия' }} />
      </Tab.Navigator>
    </View>
  );
}

// Root stack lets any tab open the full-screen EditOrder screen.
function RootNavigator() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator>
      <Stack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen
        name="EditOrder"
        component={EditOrderScreen}
        options={{
          title: 'Редакция на поръчка',
          presentation: 'modal',
          headerTintColor: colors.text,
          headerStyle: { backgroundColor: colors.surface },
        }}
      />
    </Stack.Navigator>
  );
}

function Gate() {
  const { user, booting } = useAuth();
  const { colors } = useTheme();
  const [pinVerified, setPinVerified] = useState(null); // null = still checking

  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem(PIN_STORAGE_KEY);
        setPinVerified(v === 'true');
      } catch (_) {
        setPinVerified(false);
      }
    })();
  }, []);

  const onPinVerified = async () => {
    try {
      await AsyncStorage.setItem(PIN_STORAGE_KEY, 'true');
    } catch (_) {}
    setPinVerified(true);
  };

  const spinner = (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );

  if (pinVerified === null) return spinner;
  if (!pinVerified) return <PinGateScreen onVerified={onPinVerified} />;
  if (booting) return spinner;

  return (
    <NavigationContainer>
      {user ? <RootNavigator /> : <LoginScreen />}
    </NavigationContainer>
  );
}

function AppShell() {
  const { colors } = useTheme();
  return (
    <>
      <StatusBar style={colors.statusBar} />
      <AuthProvider>
        <RestaurantProvider>
          <CartProvider>
            <Gate />
          </CartProvider>
        </RestaurantProvider>
      </AuthProvider>
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppShell />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
