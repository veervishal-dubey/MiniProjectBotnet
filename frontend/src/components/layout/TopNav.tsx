import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Menu,
  Activity,
  Bell,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  User,
  LogIn,
  UserPlus,
  LogOut,
  Settings,
  ChevronDown,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useBackendHealth } from '@/contexts/BackendHealthContext';

interface TopNavProps {
  onMenuClick: () => void;
  title: string;
  description?: string;
}

export const TopNav: React.FC<TopNavProps> = ({
  onMenuClick,
  title,
  description,
}) => {
  const navigate = useNavigate();
  const { info } = useToast();
  const { profile, isAuthenticated, signOut } = useAuth();
  const { workspace } = useWorkspace();
  const { status: healthStatus, isChecking: isCheckingHealth, checkHealth } = useBackendHealth();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    setShowUserMenu(false);
    await signOut();
    info('Signed Out', 'You have been signed out of your researcher session.');
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur-xs border-b border-border px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4">
      {/* Left: Mobile hamburger + Page Title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-1.5 text-charcoal-600 hover:text-charcoal-900 rounded border border-border bg-surface hover:bg-surface-subtle"
          aria-label="Open sidebar"
        >
          <Menu className="w-4 h-4" />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-base sm:text-lg font-semibold text-charcoal-900 tracking-tight truncate">
              {title}
            </h1>
            {workspace && (
              <span className="hidden xl:inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-forest-200 bg-forest-50/70 text-forest-800 text-[11px] font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-forest-600" />
                <span className="truncate max-w-[150px]">{workspace.name}</span>
              </span>
            )}
          </div>
          {description && (
            <p className="text-xs text-charcoal-500 truncate hidden sm:block">
              {description}
            </p>
          )}
        </div>
      </div>

      {/* Right: Status Pill, Demo Toggle, Notifications, User Menu */}
      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
        {/* Backend Status indicator */}
        <button
          onClick={() => checkHealth(undefined, true)}
          disabled={isCheckingHealth}
          title="Click to check FastAPI backend connectivity"
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded border border-border bg-surface-subtle hover:bg-surface-muted transition-colors text-xs font-mono"
        >
          <Activity
            className={`w-3.5 h-3.5 ${
              healthStatus === 'online'
                ? 'text-forest-600'
                : healthStatus === 'loading'
                ? 'text-warmAmber-500'
                : 'text-charcoal-400'
            } ${isCheckingHealth ? 'animate-spin' : ''}`}
          />
          <span className="text-charcoal-700">
            {isCheckingHealth || healthStatus === 'loading'
              ? 'API: Checking...'
              : healthStatus === 'online'
              ? 'API: Online'
              : healthStatus === 'error'
              ? 'API: Error'
              : 'API: Offline'}
          </span>
          <RefreshCw className={`w-2.5 h-2.5 text-charcoal-400 ${isCheckingHealth ? 'animate-spin' : ''}`} />
        </button>

        {/* Notifications Icon with Popover */}
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 h-8 w-8 text-charcoal-600 hover:text-charcoal-900"
            aria-label="View system alerts"
          >
            <Bell className="w-4 h-4" />
          </Button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-surface border border-border rounded shadow-modal z-50 p-3">
              <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
                <span className="text-xs font-semibold text-charcoal-900">System Notifications</span>
                <Badge variant="forest" size="sm">Operational</Badge>
              </div>
              <div className="py-2 space-y-2 text-xs">
                <div className="p-2 rounded bg-surface-subtle border border-border-subtle">
                  <div className="flex items-center gap-1.5 font-medium text-charcoal-800">
                    <CheckCircle2 className="w-3.5 h-3.5 text-forest-700" />
                    Authentication System Ready
                  </div>
                  <p className="text-[11px] text-charcoal-500 mt-0.5">
                    Real Supabase Authentication active with session guard protection.
                  </p>
                </div>
                <div className="p-2 rounded bg-surface-subtle border border-border-subtle">
                  <div className="flex items-center gap-1.5 font-medium text-charcoal-800">
                    <CheckCircle2 className="w-3.5 h-3.5 text-forest-700" />
                    FastAPI Engine Operational
                  </div>
                  <p className="text-[11px] text-charcoal-500 mt-0.5">
                    FastAPI backend configured for dataset validation and leak-free preprocessing.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowNotifications(false)}
                className="w-full text-center text-[11px] text-forest-700 hover:underline pt-1 border-t border-border-subtle"
              >
                Close
              </button>
            </div>
          )}
        </div>

        {/* Authentication & User Dropdown */}
        <div className="relative pl-1 border-l border-border-subtle" ref={userMenuRef}>
          {isAuthenticated && profile ? (
            <div>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 p-1 pl-2 pr-2.5 rounded border border-border bg-surface hover:bg-surface-subtle transition-colors text-xs"
                aria-label="User menu"
              >
                <div className="w-6 h-6 rounded-full bg-forest-800 text-forest-100 flex items-center justify-center font-bold text-[11px]">
                  {profile.name.charAt(0).toUpperCase()}
                </div>
                <div className="hidden md:block text-left">
                  <span className="block font-medium text-charcoal-900 leading-none truncate max-w-[120px]">
                    {profile.name}
                  </span>
                </div>
                <ChevronDown className="w-3 h-3 text-charcoal-400" />
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-64 bg-surface border border-border rounded shadow-modal z-50 p-2 text-xs">
                  <div className="p-2 border-b border-border-subtle mb-1">
                    <p className="font-semibold text-charcoal-900 truncate">{profile.name}</p>
                    <p className="text-[11px] text-charcoal-500 font-mono truncate">{profile.email}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge variant="forest" size="sm">
                        {profile.role}
                      </Badge>
                      {workspace && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-subtle border border-border text-charcoal-700 truncate max-w-[150px]">
                          {workspace.name}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <Link
                      to="/settings"
                      onClick={() => setShowUserMenu(false)}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-surface-subtle text-charcoal-700"
                    >
                      <Settings className="w-3.5 h-3.5 opacity-70" />
                      <span>Account Settings</span>
                    </Link>
                    <Link
                      to="/login"
                      onClick={() => setShowUserMenu(false)}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-surface-subtle text-charcoal-700"
                    >
                      <LogIn className="w-3.5 h-3.5 opacity-70" />
                      <span>Switch / Sign In</span>
                    </Link>
                    <Link
                      to="/signup"
                      onClick={() => setShowUserMenu(false)}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-surface-subtle text-charcoal-700"
                    >
                      <UserPlus className="w-3.5 h-3.5 opacity-70" />
                      <span>Register New User</span>
                    </Link>
                  </div>

                  <div className="pt-1 mt-1 border-t border-border-subtle">
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-mutedRed-600 hover:bg-mutedRed-50 text-left transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Link to="/login">
                <Button variant="ghost" size="sm" className="text-xs h-8 px-2.5" leftIcon={<LogIn className="w-3.5 h-3.5" />}>
                  Sign In
                </Button>
              </Link>
              <Link to="/signup" className="hidden sm:inline-block">
                <Button variant="primary" size="sm" className="text-xs h-8 px-2.5" leftIcon={<UserPlus className="w-3.5 h-3.5" />}>
                  Register
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
