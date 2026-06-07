// @ts-nocheck
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/contexts/AuthContext';
import Loading from '@/components/Loading';
import { colors } from '@/theme';
import { navigationRef } from '@/navigation/navigationRef';

import WelcomeScreen from '@/screens/auth/WelcomeScreen';
import EmailLoginScreen from '@/screens/auth/EmailLoginScreen';
import PhoneLoginScreen from '@/screens/auth/PhoneLoginScreen';
import OtpVerifyScreen from '@/screens/auth/OtpVerifyScreen';
import RegisterScreen from '@/screens/auth/RegisterScreen';

import UserHomeScreen from '@/screens/user/UserHomeScreen';
import BookingScreen from '@/screens/user/BookingScreen';
import OrdersScreen from '@/screens/user/OrdersScreen';
import WalletScreen from '@/screens/user/WalletScreen';
import ProfileScreen from '@/screens/user/ProfileScreen';
import CatalogScreen from '@/screens/user/CatalogScreen';
import RideTrackingScreen from '@/screens/user/RideTrackingScreen';
import PharmacyHomeScreen from '@/screens/user/pharmacy/PharmacyHomeScreen';
import PharmacyCatalogScreen from '@/screens/user/pharmacy/PharmacyCatalogScreen';
import PharmacyPrescriptionScreen from '@/screens/user/pharmacy/PharmacyPrescriptionScreen';
import PharmacyOrdersScreen from '@/screens/user/pharmacy/PharmacyOrdersScreen';
import RealEstateListScreen from '@/screens/user/realestate/RealEstateListScreen';
import PropertyDetailScreen from '@/screens/user/realestate/PropertyDetailScreen';
import MyPropertiesScreen from '@/screens/user/realestate/MyPropertiesScreen';
import EditProfileScreen from '@/screens/user/EditProfileScreen';
import SettingsScreen from '@/screens/user/SettingsScreen';
import DeliverySearchScreen from '@/screens/user/DeliverySearchScreen';

import DriverHomeScreen from '@/screens/driver/DriverHomeScreen';
import DriverRidesScreen from '@/screens/driver/DriverRidesScreen';
import DriverEarningsScreen from '@/screens/driver/DriverEarningsScreen';
import DriverActiveRideScreen from '@/screens/driver/DriverActiveRideScreen';
import DriverDeliveryJobsScreen from '@/screens/driver/DriverDeliveryJobsScreen';
import DriverWeeklyReportsScreen from '@/screens/driver/DriverWeeklyReportsScreen';
import { DriverMissionsProvider, useDriverMissions } from '@/contexts/DriverMissionsContext';

import MerchantHomeScreen from '@/screens/merchant/MerchantHomeScreen';

const RootStack = createNativeStackNavigator();
const AuthStack = createNativeStackNavigator();
const UserStack = createNativeStackNavigator();
const DriverStack = createNativeStackNavigator();
const MerchantStack = createNativeStackNavigator();
const UserTabs = createBottomTabNavigator();
const DriverTabs = createBottomTabNavigator();
const MerchantTabs = createBottomTabNavigator();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
      <AuthStack.Screen name="EmailLogin" component={EmailLoginScreen} />
      <AuthStack.Screen name="PhoneLogin" component={PhoneLoginScreen} />
      <AuthStack.Screen name="OtpVerify" component={OtpVerifyScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

const tabIcon =
  (name) =>
  ({ color, size }) =>
    <Ionicons name={name} size={size} color={color} />;

const tabBarOptions = {
  headerShown: false,
  tabBarActiveTintColor: colors.primaryDark,
  tabBarInactiveTintColor: colors.textMuted,
  tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 64, paddingBottom: 8, paddingTop: 6 },
};

function UserTabsNav() {
  const { t } = useTranslation();
  return (
    <UserTabs.Navigator screenOptions={tabBarOptions}>
      <UserTabs.Screen name="Home" component={UserHomeScreen} options={{ title: t('tabs.home'), tabBarIcon: tabIcon('home') }} />
      <UserTabs.Screen name="OrdersTab" component={OrdersScreen} options={{ title: t('tabs.orders'), tabBarIcon: tabIcon('receipt') }} />
      <UserTabs.Screen name="WalletTab" component={WalletScreen} options={{ title: t('tabs.wallet'), tabBarIcon: tabIcon('wallet') }} />
      <UserTabs.Screen name="ProfileTab" component={ProfileScreen} options={{ title: t('tabs.profile'), tabBarIcon: tabIcon('person') }} />
    </UserTabs.Navigator>
  );
}

function UserNavigator() {
  return (
    <UserStack.Navigator screenOptions={{ headerShown: false }}>
      <UserStack.Screen name="UserTabs" component={UserTabsNav} />
      <UserStack.Screen name="Booking" component={BookingScreen} />
      <UserStack.Screen name="RideTracking" component={RideTrackingScreen} />
      <UserStack.Screen name="Wallet" component={WalletScreen} />
      <UserStack.Screen name="Beauty" component={CatalogScreen} initialParams={{ service: 'beauty' }} />
      <UserStack.Screen name="Pet" component={CatalogScreen} initialParams={{ service: 'pet' }} />
      <UserStack.Screen name="CarCare" component={CatalogScreen} initialParams={{ service: 'car_care' }} />
      <UserStack.Screen name="Towing" component={CatalogScreen} initialParams={{ service: 'towing' }} />
      <UserStack.Screen name="Nearby" component={CatalogScreen} initialParams={{ service: 'nearby' }} />
      <UserStack.Screen name="Marketplace" component={CatalogScreen} initialParams={{ service: 'marketplace' }} />
      <UserStack.Screen name="Food" component={CatalogScreen} initialParams={{ service: 'food' }} />
      <UserStack.Screen name="DeliverySearch" component={DeliverySearchScreen} />
      <UserStack.Screen name="Delivery" component={CatalogScreen} initialParams={{ service: 'delivery' }} />
      <UserStack.Screen name="Carpool" component={CatalogScreen} initialParams={{ service: 'carpool' }} />
      <UserStack.Screen name="Runner" component={CatalogScreen} initialParams={{ service: 'on_demand' }} />
      <UserStack.Screen name="PharmacyHome" component={PharmacyHomeScreen} />
      <UserStack.Screen name="PharmacyCatalog" component={PharmacyCatalogScreen} />
      <UserStack.Screen name="PharmacyPrescription" component={PharmacyPrescriptionScreen} />
      <UserStack.Screen name="PharmacyOrders" component={PharmacyOrdersScreen} />
      <UserStack.Screen name="RealEstate" component={RealEstateListScreen} />
      <UserStack.Screen name="PropertyDetail" component={PropertyDetailScreen} />
      <UserStack.Screen name="MyProperties" component={MyPropertiesScreen} />
      <UserStack.Screen name="EditProfile" component={EditProfileScreen} />
      <UserStack.Screen name="Settings" component={SettingsScreen} />
    </UserStack.Navigator>
  );
}

function DriverTabsNav() {
  const { t } = useTranslation();
  const { availableCount } = useDriverMissions();
  return (
    <DriverTabs.Navigator screenOptions={tabBarOptions}>
      <DriverTabs.Screen name="Home" component={DriverHomeScreen} options={{ title: t('tabs.home'), tabBarIcon: tabIcon('home') }} />
      <DriverTabs.Screen name="Rides" component={DriverRidesScreen} options={{ title: t('tabs.rides'), tabBarIcon: tabIcon('car-sport') }} />
      <DriverTabs.Screen name="Jobs" component={DriverDeliveryJobsScreen} options={{ title: t('tabs.jobs'), tabBarIcon: tabIcon('cube'), tabBarBadge: availableCount > 0 ? availableCount : undefined, tabBarBadgeStyle: { backgroundColor: colors.danger, color: '#fff', fontSize: 10 } }} />
      <DriverTabs.Screen name="Earnings" component={DriverEarningsScreen} options={{ title: t('tabs.earnings'), tabBarIcon: tabIcon('cash') }} />
      <DriverTabs.Screen name="ProfileTab" component={ProfileScreen} options={{ title: t('tabs.profile'), tabBarIcon: tabIcon('person') }} />
    </DriverTabs.Navigator>
  );
}

function DriverNavigator() {
  return (
    <DriverMissionsProvider>
      <DriverStack.Navigator screenOptions={{ headerShown: false }}>
        <DriverStack.Screen name="DriverTabs" component={DriverTabsNav} />
        <DriverStack.Screen name="ActiveRide" component={DriverActiveRideScreen} />
        <DriverStack.Screen name="WeeklyReports" component={DriverWeeklyReportsScreen} />
      </DriverStack.Navigator>
    </DriverMissionsProvider>
  );
}

function MerchantTabsNav() {
  const { t } = useTranslation();
  return (
    <MerchantTabs.Navigator screenOptions={tabBarOptions}>
      <MerchantTabs.Screen name="Dashboard" component={MerchantHomeScreen} options={{ title: t('tabs.dashboard'), tabBarIcon: tabIcon('grid') }} />
      <MerchantTabs.Screen name="ProfileTab" component={ProfileScreen} options={{ title: t('tabs.profile'), tabBarIcon: tabIcon('person') }} />
    </MerchantTabs.Navigator>
  );
}

function MerchantNavigator() {
  return (
    <MerchantStack.Navigator screenOptions={{ headerShown: false }}>
      <MerchantStack.Screen name="MerchantTabs" component={MerchantTabsNav} />
    </MerchantStack.Navigator>
  );
}

export default function RootNavigator() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;

  return (
    <NavigationContainer ref={navigationRef}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <RootStack.Screen name="Auth" component={AuthNavigator} />
        ) : user.role === 'driver' ? (
          <RootStack.Screen name="Driver" component={DriverNavigator} />
        ) : user.role === 'merchant' ? (
          <RootStack.Screen name="Merchant" component={MerchantNavigator} />
        ) : (
          <RootStack.Screen name="User" component={UserNavigator} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
