import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import PageLoader from './components/PageLoader';

// Each screen is its own chunk, so the login page and shell load fast and the rest is fetched on first visit.
const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const GuestListPage = lazy(() => import('./pages/GuestListPage'));
const QuotationListPage = lazy(() => import('./pages/QuotationListPage'));
const QuotationBuilderPage = lazy(() => import('./pages/QuotationBuilderPage'));
const SupplierListPage = lazy(() => import('./pages/SupplierListPage'));
const HotelListPage = lazy(() => import('./pages/HotelListPage'));
const HotelEditorPage = lazy(() => import('./pages/HotelEditorPage'));
const ItineraryListPage = lazy(() => import('./pages/ItineraryListPage'));
const ItineraryEditorPage = lazy(() => import('./pages/ItineraryEditorPage'));
const VisaListPage = lazy(() => import('./pages/VisaListPage'));
const VisaEditorPage = lazy(() => import('./pages/VisaEditorPage'));
const ConfirmationListPage = lazy(() => import('./pages/ConfirmationListPage'));
const ConfirmationEditorPage = lazy(() => import('./pages/ConfirmationEditorPage'));
const UserManagementPage = lazy(() => import('./pages/UserManagementPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const RightsPage = lazy(() => import('./pages/RightsPage'));
const MobileScannerPage = lazy(() => import('./pages/MobileScannerPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

export function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <ErrorBoundary>
            <Suspense fallback={<PageLoader fullScreen />}>
              <Routes>
                {/* Public Login Route */}
                <Route path="/login" element={<LoginPage />} />

                {/* Protected App Routes */}
                <Route element={<ProtectedRoute />}>
                  <Route element={<Layout />}>
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/guests" element={<GuestListPage />} />
                    <Route path="/quotations" element={<QuotationListPage />} />
                    <Route path="/quotations/new" element={<QuotationBuilderPage />} />
                    <Route path="/quotations/:id/edit" element={<QuotationBuilderPage />} />
                    <Route path="/suppliers" element={<SupplierListPage />} />
                    <Route path="/hotels" element={<HotelListPage />} />
                    <Route path="/hotels/new" element={<HotelEditorPage />} />
                    <Route path="/hotels/:id/edit" element={<HotelEditorPage />} />
                    <Route path="/visas" element={<VisaListPage />} />
                    <Route path="/visas/new" element={<VisaEditorPage />} />
                    <Route path="/visas/:id/edit" element={<VisaEditorPage />} />
                    <Route path="/itineraries" element={<ItineraryListPage />} />
                    <Route path="/itineraries/new" element={<ItineraryEditorPage />} />
                    <Route path="/itineraries/:id/edit" element={<ItineraryEditorPage />} />
                    <Route path="/confirmations" element={<ConfirmationListPage />} />
                    <Route path="/confirmations/:id" element={<ConfirmationEditorPage />} />
                    <Route path="/users" element={<UserManagementPage />} />
                    <Route path="/rights" element={<RightsPage />} />
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route path="/scanner" element={<MobileScannerPage />} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                </Route>

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/login" replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </AuthProvider>
      </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
