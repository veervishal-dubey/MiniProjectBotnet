import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Shield,
  Mail,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  KeyRound,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';

export const ForgotPasswordPage: React.FC = () => {
  const { resetPassword } = useAuth();
  const { success, error: toastError } = useToast();

  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setFormError('Please enter your registered email address.');
      return;
    }

    setIsSubmitting(true);
    const result = await resetPassword(trimmedEmail);
    setIsSubmitting(false);

    if (result.success) {
      setIsSent(true);
      success('Recovery Email Sent', 'Check your inbox for password reset instructions.');
    } else {
      const err = result.error || 'Failed to dispatch recovery email.';
      setFormError(err);
      toastError('Reset Request Failed', err);
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
          Recover Security Key
        </h2>
        <p className="mt-1.5 text-xs text-charcoal-600 max-w-sm mx-auto">
          Enter your registered researcher email address to receive password recovery instructions.
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <Card className="shadow-modal border-border">
          <CardContent className="p-6 sm:p-8 space-y-5">
            {isSent ? (
              <div className="space-y-4 text-center py-4">
                <div className="w-12 h-12 rounded-full bg-forest-50 border border-forest-200 text-forest-800 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6 text-forest-700" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-charcoal-900">Recovery Instructions Dispatched</h3>
                  <p className="text-xs text-charcoal-600 leading-relaxed max-w-sm mx-auto">
                    We have dispatched a password reset link to <strong className="text-charcoal-800">{email}</strong>.
                    Follow the link in the email to establish a new security password.
                  </p>
                </div>
                <div className="pt-2">
                  <Link to="/login">
                    <Button variant="primary" className="w-full text-xs font-semibold">
                      Return to Researcher Sign In
                    </Button>
                  </Link>
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
                      Registered Research Email
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

                  <Button
                    type="submit"
                    variant="primary"
                    isLoading={isSubmitting}
                    className="w-full h-10 text-sm font-semibold"
                    rightIcon={<ArrowRight className="w-4 h-4" />}
                  >
                    Send Recovery Instructions
                  </Button>
                </form>

                <div className="text-center pt-3 border-t border-border-subtle text-xs text-charcoal-600">
                  Remember your password?{' '}
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
