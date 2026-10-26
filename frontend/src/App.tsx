import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from '@/components/ui/Toast';
import { BackendHealthProvider } from '@/contexts/BackendHealthContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { WorkspaceProvider } from '@/contexts/WorkspaceContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';

import { LandingPage } from '@/pages/LandingPage';
import { LoginPage } from '@/pages/LoginPage';
import { SignupPage } from '@/pages/SignupPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { DatasetsPage } from '@/pages/DatasetsPage';
import { PreprocessingPage } from '@/pages/PreprocessingPage';
import { ModelsPage } from '@/pages/ModelsPage';
import { FederatedPage } from '@/pages/FederatedPage';
import { DetectionPage } from '@/pages/DetectionPage';
import { EvaluationPage } from '@/pages/EvaluationPage';
import { LogsPage } from '@/pages/LogsPage';
import { SettingsPage } from '@/pages/SettingsPage';

export const App: React.FC = () => {
  return (
    <ToastProvider>
      <BackendHealthProvider>
        <AuthProvider>
          <WorkspaceProvider>
            <BrowserRouter>
          <Routes>
            {/* Public Landing & Authentication Pages */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* Core Protected Research Platform Shell */}
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/datasets" element={<DatasetsPage />} />
              <Route path="/preprocessing" element={<PreprocessingPage />} />
              <Route path="/models" element={<ModelsPage />} />
              <Route path="/federated-learning" element={<FederatedPage />} />
              <Route path="/detection" element={<DetectionPage />} />
              <Route path="/evaluation" element={<EvaluationPage />} />
              <Route path="/logs" element={<LogsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>

            {/* Catch-all redirect */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
        </WorkspaceProvider>
      </AuthProvider>
      </BackendHealthProvider>
    </ToastProvider>
  );
};

export default App;
