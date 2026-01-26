import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Monitor, 
  ShoppingCart, 
  Receipt, 
  Package, 
  Clock, 
  Wallet, 
  BarChart3, 
  Settings,
  LogOut,
  Gamepad2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { t } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';

const navItems: Array<{ href: string; icon: typeof LayoutDashboard; label: string; adminOnly?: boolean }> = [
  { href: '/', icon: LayoutDashboard, label: 'dashboard' },
  { href: '/devices', icon: Monitor, label: 'devices' },
  { href: '/pos', icon: ShoppingCart, label: 'pos' },
  { href: '/tickets', icon: Receipt, label: 'tickets' },
  { href: '/products', icon: Package, label: 'products' },
  { href: '/shifts', icon: Clock, label: 'shifts' },
  { href: '/expenses', icon: Wallet, label: 'expenses' },
  { href: '/reports', icon: BarChart3, label: 'reports' },
  { href: '/settings', icon: Settings, label: 'settings', adminOnly: true },
];

export function Sidebar() {
  const location = useLocation();
  const { profile, role, signOut } = useAuth();

  const roleLabel = role ? t(role) : '';
  const roleColor = role === 'admin' ? 'text-primary' : role === 'manager' ? 'text-accent' : 'text-muted-foreground';

  return (
    <aside className="fixed right-0 top-0 z-40 h-screen w-64 border-l border-border bg-sidebar">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex items-center gap-3 border-b border-border px-6 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Gamepad2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">{t('appName')}</h1>
            <p className="text-xs text-muted-foreground">نظام إدارة المقهى</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          {navItems.map((item) => {
            if (item.adminOnly && role !== 'admin') return null;
            
            const isActive = location.pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-primary/10 text-primary shadow-glow-cyan'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{t(item.label as any)}</span>
              </Link>
            );
          })}
        </nav>

        {/* User Info */}
        <div className="border-t border-border p-4">
          <div className="mb-3 flex items-center gap-3 rounded-lg bg-card/50 p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
              {profile?.name?.charAt(0) || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {profile?.name || 'مستخدم'}
              </p>
              <p className={cn('text-xs', roleColor)}>{roleLabel}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
            {t('logout')}
          </Button>
        </div>
      </div>
    </aside>
  );
}
