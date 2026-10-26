import React from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Database,
  Sliders,
  Cpu,
  Network,
  ShieldAlert,
  BarChart3,
  Terminal,
  Settings,
  Shield,
  Home,
  X,
  ExternalLink,
  LogIn,
  UserPlus,
  LogOut,
  UserCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isDemoMode: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, isDemoMode }) => {
  const navigate = useNavigate();
  const { profile, isAuthenticated, isConfigured, signOut } = useAuth();
  const { workspace } = useWorkspace();

  const navItems = [
    { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
    { to: '/datasets', label: 'Datasets', icon: Database, badge: '3' },
    { to: '/preprocessing', label: 'Preprocessing', icon: Sliders },
    { to: '/models', label: 'Model Registry', icon: Cpu },
    { to: '/federated-learning', label: 'Federated Learning', icon: Network, highlight: true },
    { to: '/detection', label: 'Flow Detection', icon: ShieldAlert },
    { to: '/evaluation', label: 'Evaluation', icon: BarChart3 },
    { to: '/logs', label: 'System Logs', icon: Terminal },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-charcoal-950/60 z-40 lg:hidden backdrop-blur-xs"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-surface-sidebar text-charcoal-200 flex flex-col border-r border-surface-sidebar-hover transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-0 -translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <Link to="/" onClick={onClose} className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-forest-800 border border-forest-600 flex items-center justify-center text-forest-100 shadow-sm">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-sm tracking-tight text-white font-mono">
                  SentinelFL
                </span>
                <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-white/10 text-charcoal-300">
                  v0.1
                </span>
              </div>
              <p className="text-[11px] text-charcoal-400 leading-tight">
                Federated IoT Threat Intel
              </p>
            </div>
          </Link>
          <button
            onClick={onClose}
            className="lg:hidden text-charcoal-400 hover:text-white p-1 rounded"
            aria-label="Close navigation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-charcoal-500">
            Platform Workspace
          </div>
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3 py-2 rounded text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-forest-900/70 text-forest-200 border-l-2 border-forest-400 font-semibold pl-2.5'
                      : 'text-charcoal-300 hover:text-white hover:bg-surface-sidebar-hover'
                  } ${item.highlight ? 'border-r border-forest-700/20' : ''}`
                }
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 flex-shrink-0 opacity-80" />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge && (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/10 text-charcoal-300">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}

          <div className="pt-4 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-charcoal-500">
            Security & Authentication
          </div>
          <NavLink
            to="/login"
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center justify-between px-3 py-2 rounded text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-forest-900/70 text-forest-200 font-semibold'
                  : 'text-charcoal-300 hover:text-white hover:bg-surface-sidebar-hover'
              }`
            }
          >
            <div className="flex items-center gap-2.5">
              <LogIn className="w-4 h-4 opacity-80" />
              <span>Researcher Login</span>
            </div>
            {isAuthenticated && (
              <span className="w-1.5 h-1.5 rounded-full bg-forest-400" />
            )}
          </NavLink>

          <NavLink
            to="/signup"
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center justify-between px-3 py-2 rounded text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-forest-900/70 text-forest-200 font-semibold'
                  : 'text-charcoal-300 hover:text-white hover:bg-surface-sidebar-hover'
              }`
            }
          >
            <div className="flex items-center gap-2.5">
              <UserPlus className="w-4 h-4 opacity-80" />
              <span>Register Account</span>
            </div>
          </NavLink>

          <div className="pt-4 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-charcoal-500">
            Documentation & Entry
          </div>
          <NavLink
            to="/"
            onClick={onClose}
            className="flex items-center justify-between px-3 py-2 rounded text-xs font-medium text-charcoal-400 hover:text-white hover:bg-surface-sidebar-hover transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <Home className="w-4 h-4 opacity-70" />
              <span>Landing Page</span>
            </div>
            <ExternalLink className="w-3 h-3 opacity-50" />
          </NavLink>
        </nav>

        {/* Footer info & Account Card */}
        <div className="p-3 border-t border-white/5 bg-charcoal-950/40">
          <div className="flex items-center gap-2.5 p-2 rounded hover:bg-surface-sidebar-hover transition-colors">
            <div className="w-7 h-7 rounded-full bg-forest-800 text-forest-200 flex items-center justify-center text-xs font-medium flex-shrink-0">
              {profile?.name ? profile.name.charAt(0).toUpperCase() : 'R'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">
                {profile?.name || 'Researcher'}
              </p>
              <p className="text-[10px] text-charcoal-400 font-mono truncate" title={workspace?.name}>
                {workspace?.name ? workspace.name : (profile?.role || 'Personal Workspace')}
              </p>
            </div>
            {isAuthenticated ? (
              <button
                onClick={async () => {
                  await signOut();
                  navigate('/login', { replace: true });
                }}
                title="Sign out"
                className="text-charcoal-400 hover:text-mutedRed-400 p-1 rounded"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            ) : (
              <Link to="/login" className="text-[10px] text-forest-400 hover:underline font-mono">
                Sign In
              </Link>
            )}
          </div>
          <div className="flex items-center justify-between px-2 pt-2 border-t border-white/5 text-[10px] text-charcoal-500 font-mono">
            <span>Supabase Authenticated</span>
            <span>FedAvg • v0.1</span>
          </div>
        </div>
      </aside>
    </>
  );
};
