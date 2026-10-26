import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Shield } from 'lucide-react';

interface ProtectedRouteProps {
  children?: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading: isLoadingAuth } = useAuth();
  const { isLoadingWorkspace } = useWorkspace();
  const location = useLocation();

  if (isLoadingAuth || (isAuthenticated && isLoadingWorkspace)) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center font-sans">
        <div className="w-12 h-12 rounded-xl bg-forest-800 text-forest-100 flex items-center justify-center shadow-subtle animate-pulse mb-4">
          <Shield className="w-6 h-6 text-forest-200" />
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-charcoal-600">
          <div className="w-2 h-2 rounded-full bg-forest-600 animate-ping" />
          <span>Verifying researcher authentication session and personal workspace...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Preserve attempted location for post-login redirection
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};
