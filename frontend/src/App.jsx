import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import PageLoader from './components/PageLoader';
import InstallPrompt from './components/InstallPrompt';
import { lazyWithReload } from './utils/lazyWithReload';

// Each screen is its own chunk, so the login page and shell load fast and the rest is fetched on first visit.
const LoginPage = lazyWithReload(() => import('./pages/LoginPage'));
const DashboardPage = lazyWithReload(() => import('./pages/DashboardPage'));
const GuestListPage = lazyWithReload(() => import('./pages/GuestListPage'));
const QuotationListPage = lazyWithReload(() => import('./pages/QuotationListPage'));
const QuotationBuilderPage = lazyWithReload(() => import('./pages/QuotationBuilderPage'));
const SupplierListPage = lazyWithReload(() => import('./pages/SupplierListPage'));
const HotelListPage = lazyWithReload(() => import('./pages/HotelListPage'));
const HotelEditorPage = lazyWithReload(() => import('./pages/HotelEditorPage'));
const HotelFinderPage = lazyWithReload(() => import('./pages/HotelFinderPage'));
const FoundHotelPage = lazyWithReload(() => import('./pages/FoundHotelPage'));
const ItineraryListPage = lazyWithReload(() => import('./pages/ItineraryListPage'));
const ItineraryEditorPage = lazyWithReload(() => import('./pages/ItineraryEditorPage'));
const VisaListPage = lazyWithReload(() => import('./pages/VisaListPage'));
const VisaEditorPage = lazyWithReload(() => import('./pages/VisaEditorPage'));
const TravelCalendarPage = lazyWithReload(() => import('./pages/TravelCalendarPage'));
const ClientsPage = lazyWithReload(() => import('./pages/ClientsPage'));
const ConfirmationListPage = lazyWithReload(() => import('./pages/ConfirmationListPage'));
const ConfirmationEditorPage = lazyWithReload(() => import('./pages/ConfirmationEditorPage'));
const UserManagementPage = lazyWithReload(() => import('./pages/UserManagementPage'));
const ProfilePage = lazyWithReload(() => import('./pages/ProfilePage'));
const RightsPage = lazyWithReload(() => import('./pages/RightsPage'));
const MasterTextPage = lazyWithReload(() => import('./pages/MasterTextPage'));
const MobileScannerPage = lazyWithReload(() => import('./pages/MobileScannerPage'));
const NotFoundPage = lazyWithReload(() => import('./pages/NotFoundPage'));

export function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <ErrorBoundary>
            <InstallPrompt />
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
                    <Route path="/hotels/find" element={<HotelFinderPage />} />
                    <Route path="/hotels/found/:id" element={<FoundHotelPage />} />
                    <Route path="/hotels/:id/edit" element={<HotelEditorPage />} />
                    <Route path="/visas" element={<VisaListPage />} />
                    <Route path="/visas/new" element={<VisaEditorPage />} />
                    <Route path="/visas/:id/edit" element={<VisaEditorPage />} />
                    <Route path="/itineraries" element={<ItineraryListPage />} />
                    <Route path="/itineraries/new" element={<ItineraryEditorPage />} />
                    <Route path="/itineraries/:id/edit" element={<ItineraryEditorPage />} />
                    <Route path="/calendar" element={<TravelCalendarPage />} />
                    <Route path="/clients" element={<ClientsPage />} />
                    <Route path="/confirmations" element={<ConfirmationListPage />} />
                    <Route path="/confirmations/:id" element={<ConfirmationEditorPage />} />
                    <Route path="/users" element={<UserManagementPage />} />
                    <Route path="/rights" element={<RightsPage />} />
                    <Route path="/notes-policies" element={<MasterTextPage />} />
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
