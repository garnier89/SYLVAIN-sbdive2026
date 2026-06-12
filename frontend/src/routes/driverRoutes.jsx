import React from 'react';
import { Route, Navigate } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';
import {
  ChauffeurWelcome, ChauffeurLogin, ChauffeurRegister, DriverHome, DriverBookingsPage,
  DriverEarningsPage, DriverWeeklyReportsPage, DriverHistoryPage, DriverProfilePage,
  DriverRewardsPage, DriverScorePage, DriverSubscriptions, DriverSupportPage, DriverWalletPage,
  DriverDocumentsPage, DriverNotificationsPage, NewsFeedPage, LiveChatPage,
  ManageVehiclesPage, BankDetailsPage, DriverEarningsStatsPage, DriverGalleryPage,
  DriverAvailabilityPage, DriverReviewsPage, DriverChangePasswordPage,
  DriverRegisterPage,
} from './pages';
const DriverReportPage = React.lazy(() => import('../pages/driver/DriverReportPage'));

export function driverRoutes(user) {
  return (
    <>
      <Route path="/chauffeur" element={user && user.role === 'driver' ? <Navigate to="/chauffeur/home" replace /> : !user ? <ChauffeurWelcome /> : <Navigate to="/" replace />} />
      <Route path="/chauffeur/login" element={user ? <Navigate to="/chauffeur/home" replace /> : <ChauffeurLogin />} />
      <Route path="/chauffeur/register" element={user ? <Navigate to="/chauffeur/home" replace /> : <ChauffeurRegister />} />
      <Route path="/chauffeur/home" element={<ProtectedRoute allowedRoles={['driver']}><DriverHome /></ProtectedRoute>} />
      <Route path="/chauffeur/reservations" element={<ProtectedRoute allowedRoles={['driver']}><DriverBookingsPage /></ProtectedRoute>} />
      <Route path="/chauffeur/earnings" element={<ProtectedRoute allowedRoles={['driver']}><DriverEarningsPage /></ProtectedRoute>} />
      <Route path="/chauffeur/reports" element={<ProtectedRoute allowedRoles={['driver']}><DriverWeeklyReportsPage /></ProtectedRoute>} />
      <Route path="/chauffeur/rapport" element={<ProtectedRoute allowedRoles={['driver']}><DriverReportPage /></ProtectedRoute>} />
      <Route path="/chauffeur/history" element={<ProtectedRoute allowedRoles={['driver']}><DriverHistoryPage /></ProtectedRoute>} />
      <Route path="/chauffeur/profile" element={<ProtectedRoute allowedRoles={['driver']}><DriverProfilePage /></ProtectedRoute>} />
      <Route path="/chauffeur/rewards" element={<ProtectedRoute allowedRoles={['driver']}><DriverRewardsPage /></ProtectedRoute>} />
      <Route path="/chauffeur/score" element={<ProtectedRoute allowedRoles={['driver']}><DriverScorePage /></ProtectedRoute>} />
      <Route path="/chauffeur/subscriptions" element={<ProtectedRoute allowedRoles={['driver']}><DriverSubscriptions /></ProtectedRoute>} />
      <Route path="/chauffeur/support/:section" element={<ProtectedRoute allowedRoles={['driver']}><DriverSupportPage /></ProtectedRoute>} />
      <Route path="/chauffeur/wallet" element={<ProtectedRoute allowedRoles={['driver']}><DriverWalletPage /></ProtectedRoute>} />
      <Route path="/chauffeur/documents" element={<ProtectedRoute allowedRoles={['driver']}><DriverDocumentsPage /></ProtectedRoute>} />
      <Route path="/chauffeur/notifications" element={<ProtectedRoute allowedRoles={['driver']}><DriverNotificationsPage /></ProtectedRoute>} />
      <Route path="/chauffeur/actualites" element={<ProtectedRoute allowedRoles={['driver']}><NewsFeedPage /></ProtectedRoute>} />
      <Route path="/chauffeur/livechat" element={<ProtectedRoute allowedRoles={['driver']}><LiveChatPage /></ProtectedRoute>} />
      {/* Pack B — Driver Pro */}
      <Route path="/chauffeur/vehicles" element={<ProtectedRoute allowedRoles={['driver']}><ManageVehiclesPage /></ProtectedRoute>} />
      <Route path="/chauffeur/bank" element={<ProtectedRoute allowedRoles={['driver']}><BankDetailsPage /></ProtectedRoute>} />
      <Route path="/chauffeur/earnings/stats" element={<ProtectedRoute allowedRoles={['driver']}><DriverEarningsStatsPage /></ProtectedRoute>} />
      <Route path="/chauffeur/gallery" element={<ProtectedRoute allowedRoles={['driver']}><DriverGalleryPage /></ProtectedRoute>} />
      <Route path="/chauffeur/availability" element={<ProtectedRoute allowedRoles={['driver']}><DriverAvailabilityPage /></ProtectedRoute>} />
      <Route path="/chauffeur/reviews" element={<ProtectedRoute allowedRoles={['driver']}><DriverReviewsPage /></ProtectedRoute>} />
      <Route path="/chauffeur/change-password" element={<ProtectedRoute allowedRoles={['driver']}><DriverChangePasswordPage /></ProtectedRoute>} />
      <Route path="/driver/register" element={<ProtectedRoute allowedRoles={['user', 'driver']}><DriverRegisterPage /></ProtectedRoute>} />
    </>
  );
}
