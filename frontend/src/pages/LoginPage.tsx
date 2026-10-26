import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Shield,
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, isConfigured } = useAuth();
  const { success, error: toastError } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Redirect destination after successful login
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setFormError('Please enter your registered researcher email address.');
      return;
    }
    if (!password) {
      setFormError('Please enter your security password.');
      return;
    }

    setIsSubmitting(true);
    const result = await signIn(trimmedEmail, password);
    setIsSubmitting(false);

    if (result.success) {
      success('Authentication Successful', 'Session verified. Welcome to SentinelFL workspace.');
      navigate(from, { replace: true });
    } else {
      const errorMsg = result.error || 'Invalid email or password. Please verify your credentials.';
      setFormError(errorMsg);
      toastError('Authentication Failed', errorMsg);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans selection:bg-forest-100 selection:text-forest-900">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Brand Shield */}
        <Link to="/" className="inline-flex items-center gap-2.5 mb-4 group">
          <div className="w-10 h-10 rounded-lg bg-forest-800 text-forest-100 border border-forest-700 flex items-center justify-center shadow-subtle group-hover:bg-forest-700 transition-colors">
            <Shield className="w-5 h-5 text-forest-200" />
          </div>
          <span className="font-mono text-xl font-bold tracking-tight text-charcoal-900">
            SentinelFL
          </span>
        </Link>

        <h2 className="text-2xl font-bold text-charcoal-900 tracking-tight">
          Researcher Sign In
        </h2>
        <p className="mt-1.5 text-xs text-charcoal-600 max-w-sm mx-auto">
          Access your federated IoT intrusion detection workspace, models, and empirical experiment telemetry.
        </p>

        {/* Supabase status badge */}
        <div className="mt-3 flex justify-center">
          {isConfigured ? (
            <Badge variant="forest" size="sm" dot>
              Supabase Auth Engine Connected
            </Badge>
          ) : (
            <Badge variant="amber" size="sm" dot>
              Supabase Authentication Required
            </Badge>
          )}
        </div>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <Card className="shadow-modal border-border">
          <CardContent className="p-6 sm:p-8 space-y-5">
            {formError && (
              <div className="p-3 rounded bg-mutedRed-50 border border-mutedRed-200 text-mutedRed-700 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed">{formError}</div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-charcoal-800 mb-1">
                  Work / Research Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-charcoal-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="researcher@lab.edu or institution.org"
                    required
                    autoComplete="email"
                    disabled={isSubmitting}
                    className="w-full pl-9 pr-3 py-2 text-sm rounded border border-border bg-surface text-charcoal-900 placeholder:text-charcoal-400 focus:outline-none focus:ring-1 focus:ring-forest-700 focus:border-forest-700 transition-colors disabled:opacity-60"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-charcoal-800">
                    Security Password
                  </label>
                  <Link
                    to="/forgot-password"
                    className="text-[11px] text-forest-700 hover:text-forest-900 hover:underline transition-colors"
                  >
                    Forgot key?
                  </Link>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-charcoal-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    autoComplete="current-password"
                    disabled={isSubmitting}
                    className="w-full pl-9 pr-10 py-2 text-sm rounded border border-border bg-surface text-charcoal-900 placeholder:text-charcoal-400 focus:outline-none focus:ring-1 focus:ring-forest-700 focus:border-forest-700 transition-colors disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-charcoal-400 hover:text-charcoal-600"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center gap-2 cursor-pointer select-none text-charcoal-700">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                    className="rounded border-border text-forest-700 focus:ring-forest-700"
                  />
                  <span>Remember this workstation</span>
                </label>
              </div>

              <Button
                type="submit"
                variant="primary"
                isLoading={isSubmitting}
                className="w-full h-10 text-sm font-semibold"
                rightIcon={<ArrowRight className="w-4 h-4" />}
              >
                Sign In to Workspace
              </Button>
            </form>

            {/* Register Link */}
            <div className="text-center pt-3 border-t border-border-subtle text-xs text-charcoal-600">
              New to SentinelFL?{' '}
              <Link to="/signup" className="font-semibold text-forest-800 hover:text-forest-900 hover:underline">
                Create a research account
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Back to Home Link */}
        <div className="mt-4 text-center">
          <Link
            to="/"
            className="text-xs text-charcoal-500 hover:text-charcoal-800 transition-colors font-mono"
          >
            ← Return to SentinelFL Public Overview
          </Link>
        </div>
      </div>
    </div>
  );
};
