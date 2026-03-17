import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './src/types';
import { HomeScreen } from './src/screens/HomeScreen';
import { ScannerScreen } from './src/screens/ScannerScreen';
import { ProductScreen } from './src/screens/ProductScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { HealthDashboardScreen } from './src/screens/HealthDashboardScreen';
import { colors } from './src/constants/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: colors.textLight,
          headerTitleStyle: { fontWeight: '700' },
        }}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Scanner"
          component={ScannerScreen}
          options={{ title: 'Scan Barcode' }}
        />
        <Stack.Screen
          name="Product"
          component={ProductScreen}
          options={{ title: 'Nutrition Info' }}
        />
        <Stack.Screen
          name="History"
          component={HistoryScreen}
          options={{ title: 'Scan History' }}
        />
        <Stack.Screen
          name="HealthDashboard"
          component={HealthDashboardScreen}
          options={{ title: 'Health Data' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
