import React from 'react';
import { Route } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';
import {
  MerchantLayout, MerchantDashboard, MerchantOrders, MerchantProducts,
  MerchantPromotions, MerchantAnalytics, MerchantSettings, MerchantChat, MerchantLiveSupport,
} from './pages';

export function merchantRoutes() {
  return (
    <Route path="/merchant" element={<ProtectedRoute allowedRoles={['merchant']}><MerchantLayout /></ProtectedRoute>}>
      <Route index element={<MerchantDashboard />} />
      <Route path="orders" element={<MerchantOrders />} />
      <Route path="products" element={<MerchantProducts />} />
      <Route path="promotions" element={<MerchantPromotions />} />
      <Route path="analytics" element={<MerchantAnalytics />} />
      <Route path="settings" element={<MerchantSettings />} />
      <Route path="chat" element={<MerchantChat />} />
      <Route path="live-support" element={<MerchantLiveSupport />} />
    </Route>
  );
}
