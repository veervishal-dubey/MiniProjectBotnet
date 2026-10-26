import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Shield,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';

export const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const { updatePassword } = useAuth();
  const { success, error: toastError } = useToast();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isUpdated, setIsUpdated] = useState(false);

  const calculatePasswordStrength = (pass: string) => {
    let score = 0;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;
    return score;
  };

  const strength = calculatePasswordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (password.length < 6) {
      setFormError('New password must contain at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setFormError('Passwords do not match. Please re-enter.');
      return;
    }

    setIsSubmitting(true);
    const result = await updatePassword(password);
    setIsSubmitting(false);

    if (result.success) {
      setIsUpdated(true);
      success('Password Updated', 'Your security key has been successfully changed.');
    } else {
      const err = result.error || 'Failed to update security key. The recovery link may have expired.';
      setFormError(err);
      toastError('Update Failed', err);
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
          Set New Security Key
        </h2>
        <p className="mt-1.5 text-xs text-charcoal-600 max-w-sm mx-auto">
          Establish a new security password for your SentinelFL research workspace.
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <Card className="shadow-modal border-border">
          <CardContent className="p-6 sm:p-8 space-y-5">
            {isUpdated ? (
              <div className="space-y-4 text-center py-4">
                <div className="w-12 h-12 rounded-full bg-forest-50 border border-forest-200 text-forest-800 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6 text-forest-700" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-charcoal-900">Password Successfully Updated</h3>
                  <p className="text-xs text-charcoal-600 leading-relaxed max-w-sm mx-auto">
                    Your account security credentials have been updated. You can now access your workspace.
                  </p>
                </div>
                <div className="pt-2">
                  <Button
                    variant="primary"
                    onClick={() => navigate('/dashboard', { replace: true })}
                    className="w-full text-xs font-semibold"
                  >
                    Enter Research Workspace
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {formError && (
                  <div className="p-3 rounded bg-mutedRed-50 border border-mutedRed-200 text-mutedRed-700 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 leading-relaxed">{formError}</div>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-charcoal-800 mb-1">
                      New Security Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-charcoal-400">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Min 6 characters"
                        required
                        autoComplete="new-password"
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

                  <div>
                    <label className="block text-xs font-semibold text-charcoal-800 mb-1">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-charcoal-400">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter new password"
                        required
                        autoComplete="new-password"
                        disabled={isSubmitting}
                        className="w-full pl-9 pr-3 py-2 text-sm rounded border border-border bg-surface text-charcoal-900 placeholder:text-charcoal-400 focus:outline-none focus:ring-1 focus:ring-forest-700 focus:border-forest-700 transition-colors disabled:opacity-60"
                      />
                    </div>
                  </div>

                  {password && (
                    <div className="space-y-1">
                      <div className="flex gap-1 h-1.5 w-full">
                        <div
                          className={`h-full flex-1 rounded-sm ${
                            strength >= 1 ? 'bg-mutedRed-500' : 'bg-charcoal-200'
                          }`}
                        />
                        <div
                          className={`h-full flex-1 rounded-sm ${
                            strength >= 2 ? 'bg-warmAmber-500' : 'bg-charcoal-200'
                          }`}
                        />
                        <div
                          className={`h-full flex-1 rounded-sm ${
                            strength >= 3 ? 'bg-forest-500' : 'bg-charcoal-200'
                          }`}
                        />
                        <div
                          className={`h-full flex-1 rounded-sm ${
                            strength >= 4 ? 'bg-forest-700' : 'bg-charcoal-200'
                          }`}
                        />
                      </div>
                      <p className="text-[10px] text-charcoal-500 font-mono">
                        Strength: {strength <= 1 ? 'Weak' : strength <= 2 ? 'Moderate' : strength <= 3 ? 'Strong' : 'Very Strong'}
                      </p>
                    </div>
                  )}

                  <Button
                    type="submit"
                    variant="primary"
                    isLoading={isSubmitting}
                    className="w-full h-10 text-sm font-semibold"
                    rightIcon={<ArrowRight className="w-4 h-4" />}
                  >
                    Save New Password
                  </Button>
                </form>

                <div className="text-center pt-3 border-t border-border-subtle text-xs text-charcoal-600">
                  <Link to="/login" className="font-semibold text-forest-800 hover:text-forest-900 hover:underline">
                    Back to Sign In
                  </Link>
                </div>
              </>
            )}
          </CardContent>
        </Card>

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
