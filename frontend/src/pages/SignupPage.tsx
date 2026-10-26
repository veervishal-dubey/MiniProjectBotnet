import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Shield,
  Lock,
  Mail,
  User,
  Building2,
  Briefcase,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';

export const SignupPage: React.FC = () => {
  const navigate = useNavigate();
  const { signUp, isConfigured } = useAuth();
  const { success, error: toastError, info } = useToast();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [specialization, setSpecialization] = useState('IoT Anomaly & Intrusion Detection');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmationNotice, setConfirmationNotice] = useState<string | null>(null);

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
    setConfirmationNotice(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      setFormError('Please provide your name or researcher handle.');
      return;
    }
    if (!trimmedEmail) {
      setFormError('Please enter your academic or work email.');
      return;
    }
    if (password.length < 6) {
      setFormError('Password must contain at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setFormError('Passwords do not match. Please re-enter.');
      return;
    }
    if (!agreeTerms) {
      setFormError('You must agree to the academic and ethical research usage terms.');
      return;
    }

    setIsSubmitting(true);
    const result = await signUp(trimmedEmail, password, {
      name: trimmedName,
      organization: organization.trim() || 'Independent IoT Lab',
      // Privileged roles cannot be self-assigned; least-privileged Researcher role is enforced
    });
    setIsSubmitting(false);

    if (result.success) {
      if (result.requiresEmailConfirmation) {
        setConfirmationNotice(
          result.message || `A verification email has been dispatched to ${trimmedEmail}. Please confirm your email address before signing in.`
        );
        info('Verification Email Sent', 'Please check your inbox to confirm your researcher account.');
      } else {
        success('Account Created', 'Welcome to SentinelFL. Your session has been verified.');
        navigate('/dashboard', { replace: true });
      }
    } else {
      const err = result.error || 'Failed to create account. Please check your credentials.';
      setFormError(err);
      toastError('Registration Failed', err);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center py-10 sm:px-6 lg:px-8 font-sans selection:bg-forest-100 selection:text-forest-900">
      <div className="sm:mx-auto sm:w-full sm:max-w-lg text-center">
        {/* Brand Shield */}
        <Link to="/" className="inline-flex items-center gap-2.5 mb-3 group">
          <div className="w-10 h-10 rounded-lg bg-forest-800 text-forest-100 border border-forest-700 flex items-center justify-center shadow-subtle group-hover:bg-forest-700 transition-colors">
            <Shield className="w-5 h-5 text-forest-200" />
          </div>
          <span className="font-mono text-xl font-bold tracking-tight text-charcoal-900">
            SentinelFL
          </span>
        </Link>

        <h2 className="text-2xl sm:text-3xl font-bold text-charcoal-900 tracking-tight">
          Create Researcher Account
        </h2>
        <p className="mt-1.5 text-xs text-charcoal-600 max-w-md mx-auto">
          Join the collaborative network security research platform for distributed IoT intrusion detection and federated learning experimentation.
        </p>

        <div className="mt-2.5 flex justify-center">
          {isConfigured ? (
            <Badge variant="forest" size="sm" dot>
              Supabase Auth Engine Active
            </Badge>
          ) : (
            <Badge variant="amber" size="sm" dot>
              Supabase Authentication Required
            </Badge>
          )}
        </div>
      </div>

      <div className="mt-5 sm:mx-auto sm:w-full sm:max-w-lg px-4 sm:px-0">
        <Card className="shadow-modal border-border">
          <CardContent className="p-6 sm:p-8 space-y-4">
            {confirmationNotice ? (
              <div className="space-y-4 text-center py-4">
                <div className="w-12 h-12 rounded-full bg-forest-50 border border-forest-200 text-forest-800 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6 text-forest-700" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-charcoal-900">Confirm Your Email Address</h3>
                  <p className="text-xs text-charcoal-600 leading-relaxed max-w-sm mx-auto">
                    {confirmationNotice}
                  </p>
                </div>
                <div className="pt-2">
                  <Link to="/login">
                    <Button variant="primary" className="w-full text-xs font-semibold">
                      Proceed to Researcher Sign In
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
                  {/* Row 1: Name & Research Focus */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-charcoal-800 mb-1">
                        Researcher Full Name
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-charcoal-400">
                          <User className="w-4 h-4" />
                        </div>
                        <input
                          type="text"
                          value={name}
                          onChange={e => setName(e.target.value)}
                          placeholder="Dr. Jordan Reed"
                          required
                          disabled={isSubmitting}
                          className="w-full pl-9 pr-3 py-2 text-sm rounded border border-border bg-surface text-charcoal-900 placeholder:text-charcoal-400 focus:outline-none focus:ring-1 focus:ring-forest-700 focus:border-forest-700 transition-colors disabled:opacity-60"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-charcoal-800 mb-1">
                        Research Focus Area
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-charcoal-400">
                          <Briefcase className="w-4 h-4" />
                        </div>
                        <select
                          value={specialization}
                          onChange={e => setSpecialization(e.target.value)}
                          disabled={isSubmitting}
                          className="w-full pl-9 pr-3 py-2 text-sm rounded border border-border bg-surface text-charcoal-900 focus:outline-none focus:ring-1 focus:ring-forest-700 focus:border-forest-700 transition-colors disabled:opacity-60"
                        >
                          <option value="IoT Anomaly & Intrusion Detection">IoT Intrusion Detection</option>
                          <option value="Federated Learning & FedAvg">Federated Learning & FedAvg</option>
                          <option value="Edge Network Telemetry">Edge Network Telemetry</option>
                          <option value="Empirical Benchmark Evaluation">Benchmark Evaluation</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Email & Institution */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-charcoal-800 mb-1">
                        Work / Academic Email
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-charcoal-400">
                          <Mail className="w-4 h-4" />
                        </div>
                        <input
                          type="email"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          placeholder="j.reed@university.edu"
                          required
                          autoComplete="email"
                          disabled={isSubmitting}
                          className="w-full pl-9 pr-3 py-2 text-sm rounded border border-border bg-surface text-charcoal-900 placeholder:text-charcoal-400 focus:outline-none focus:ring-1 focus:ring-forest-700 focus:border-forest-700 transition-colors disabled:opacity-60"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-charcoal-800 mb-1">
                        Institution / Security Lab
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-charcoal-400">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <input
                          type="text"
                          value={organization}
                          onChange={e => setOrganization(e.target.value)}
                          placeholder="Cyber Threat Institute"
                          disabled={isSubmitting}
                          className="w-full pl-9 pr-3 py-2 text-sm rounded border border-border bg-surface text-charcoal-900 placeholder:text-charcoal-400 focus:outline-none focus:ring-1 focus:ring-forest-700 focus:border-forest-700 transition-colors disabled:opacity-60"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Row 3: Password & Confirm */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-charcoal-800 mb-1">
                        Security Password
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
                          className="w-full pl-9 pr-8 py-2 text-sm rounded border border-border bg-surface text-charcoal-900 placeholder:text-charcoal-400 focus:outline-none focus:ring-1 focus:ring-forest-700 focus:border-forest-700 transition-colors disabled:opacity-60"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-charcoal-400 hover:text-charcoal-600"
                        >
                          {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-charcoal-800 mb-1">
                        Confirm Password
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-charcoal-400">
                          <Lock className="w-4 h-4" />
                        </div>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={e => setConfirmPassword(e.target.value)}
                          placeholder="Re-enter password"
                          required
                          autoComplete="new-password"
                          disabled={isSubmitting}
                          className="w-full pl-9 pr-3 py-2 text-sm rounded border border-border bg-surface text-charcoal-900 placeholder:text-charcoal-400 focus:outline-none focus:ring-1 focus:ring-forest-700 focus:border-forest-700 transition-colors disabled:opacity-60"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Password strength indicators */}
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

                  {/* Security Note on Least-Privilege */}
                  <div className="p-2.5 rounded bg-surface-subtle border border-border-subtle flex items-start gap-2 text-[11px] text-charcoal-600">
                    <Info className="w-3.5 h-3.5 text-forest-700 flex-shrink-0 mt-0.5" />
                    <span>
                      All newly registered accounts receive least-privileged <strong className="text-charcoal-800">Researcher</strong> access. Administrative and lead investigator privileges are strictly provisioned via trusted database membership.
                    </span>
                  </div>

                  {/* Research agreement checkbox */}
                  <div className="pt-1">
                    <label className="flex items-start gap-2.5 cursor-pointer select-none text-xs text-charcoal-700">
                      <input
                        type="checkbox"
                        checked={agreeTerms}
                        onChange={e => setAgreeTerms(e.target.checked)}
                        className="mt-0.5 rounded border-border text-forest-700 focus:ring-forest-700"
                      />
                      <span className="leading-snug">
                        I agree to use SentinelFL solely for defensive cybersecurity threat detection, academic benchmarking, and non-malicious federated learning research.
                      </span>
                    </label>
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    isLoading={isSubmitting}
                    className="w-full h-10 text-sm font-semibold mt-2"
                    rightIcon={<ArrowRight className="w-4 h-4" />}
                  >
                    Register Research Account
                  </Button>
                </form>

                {/* Back to Login Link */}
                <div className="text-center pt-3 border-t border-border-subtle text-xs text-charcoal-600">
                  Already registered in SentinelFL?{' '}
                  <Link to="/login" className="font-semibold text-forest-800 hover:text-forest-900 hover:underline">
                    Sign in to your account
                  </Link>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Home Link */}
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
