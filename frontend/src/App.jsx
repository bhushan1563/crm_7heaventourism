import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import GuestListPage from './pages/GuestListPage';
import QuotationListPage from './pages/QuotationListPage';
import QuotationBuilderPage from './pages/QuotationBuilderPage';
import SupplierListPage from './pages/SupplierListPage';
import UserManagementPage from './pages/UserManagementPage';
import RightsPage from './pages/RightsPage';
import MobileScannerPage from './pages/MobileScannerPage';
import NotFoundPage from './pages/NotFoundPage';

export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
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
                <Route path="/users" element={<UserManagementPage />} />
                <Route path="/rights" element={<RightsPage />} />
                <Route path="/scanner" element={<MobileScannerPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
