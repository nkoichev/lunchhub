import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, Platform, Pressable, Animated, Easing } from 'react-native';
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
import { DensityProvider } from './src/context/DensityContext';
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

// Fully custom tab bar (rather than tabBarIcon/tabBarButton screenOptions)
// so the selection pill can be a single Animated.View that slides and
// resizes to the active tab, instead of each tab drawing its own static
// border — wrapping the default per-item content in a border made icon and
// label overlap because it fought the default renderer's own layout.
function AnimatedTabBar({ state, descriptors, navigation, colors }) {
  const [layouts, setLayouts] = useState({});
  const indicatorX = useRef(new Animated.Value(0)).current;
  const indicatorW = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const l = layouts[state.index];
    if (!l) return;
    const config = {
      duration: 320,
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: false,
    };
    Animated.timing(indicatorX, { ...config, toValue: l.x + 4 }).start();
    Animated.timing(indicatorW, { ...config, toValue: l.width - 8 }).start();
  }, [state.index, layouts]);

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        height: 62,
        paddingTop: 6,
        paddingBottom: 8,
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 2,
          bottom: 2,
          borderRadius: 14,
          borderWidth: 1.5,
          borderColor: colors.primary,
          backgroundColor: colors.primaryLight,
          transform: [{ translateX: indicatorX }],
          width: indicatorW,
        }}
      />
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const badge = options.tabBarBadge;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            onLayout={(e) => {
              const { x, width } = e.nativeEvent.layout;
              setLayouts((prev) => ({ ...prev, [index]: { x, width } }));
            }}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.45 }}>{TAB_ICON[route.name]}</Text>
              {badge ? (
                <View
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -10,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    paddingHorizontal: 3,
                    backgroundColor: colors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: font.semibold, color: '#fff' }}>{badge}</Text>
                </View>
              ) : null}
            </View>
            <Text
              style={{
                fontSize: 11,
                fontWeight: font.semibold,
                marginTop: 2,
                color: focused ? colors.primary : colors.textFaint,
              }}
            >
              {options.title ?? route.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
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
        screenOptions={{ headerShown: false }}
        tabBar={(props) => <AnimatedTabBar {...props} colors={colors} />}
      >
        <Tab.Screen
          name="MenuTab"
          component={MenuStack}
          options={{
            title: 'Меню',
            tabBarBadge: count > 0 ? count : undefined,
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
        <DensityProvider>
          <AppShell />
        </DensityProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
