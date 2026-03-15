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
  CalendarDays,
  Heart,
  Sparkles,
  AlertTriangle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { t } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useLowStockProducts } from '@/hooks/useLowStockProducts';
import logo from '@/assets/logo.png';

const navItems: Array<{ href: string; icon: typeof LayoutDashboard; label: string; labelAr?: string; adminOnly?: boolean }> = [
  { href: '/', icon: LayoutDashboard, label: 'dashboard' },
  { href: '/devices', icon: Monitor, label: 'devices' },
  { href: '/pos', icon: ShoppingCart, label: 'pos' },
  { href: '/tickets', icon: Receipt, label: 'tickets' },
  { href: '/products', icon: Package, label: 'products' },
  { href: '/reservations', icon: CalendarDays, label: 'reservations' },
  { href: '/loyalty', icon: Heart, label: 'loyalty' },
  { href: '/promotions', icon: Sparkles, label: 'promotions', labelAr: 'العروض' },
  { href: '/shifts', icon: Clock, label: 'shifts' },
  { href: '/expenses', icon: Wallet, label: 'expenses' },
  { href: '/reports', icon: BarChart3, label: 'reports' },
  { href: '/settings', icon: Settings, label: 'settings', adminOnly: true },
];

export function Sidebar() {
  const location = useLocation();
  const { profile, role, signOut } = useAuth();
  const { lowStockCount } = useLowStockProducts();

  const roleLabel = role ? (role === 'super_admin' ? 'مدير النظام' : t(role as any)) : '';
  const roleColor = role === 'admin' || role === 'super_admin' ? 'text-primary' : role === 'manager' ? 'text-accent' : 'text-muted-foreground';

  return (
    <aside className="fixed right-0 top-0 z-40 h-screen w-64 border-l border-border bg-sidebar/95 backdrop-blur-xl">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex items-center gap-3 border-b border-border/50 px-5 py-4">
          <img 
            src={logo} 
            alt="Nexa Cafe" 
            width={48}
            height={48}
            className="w-12 h-12"
            style={{ filter: 'drop-shadow(0 0 10px hsl(190 100% 50% / 0.3))' }}
          />
          <div>
            <h1 className="text-lg font-bold text-gradient-logo font-gaming tracking-wider">NexaCafe</h1>
            <p className="text-[10px] text-muted-foreground">نيكسا كافيه • نظام إدارة مقهى</p>
          </div>
        </div>

        {/* Low Stock Alert Banner */}
        {lowStockCount > 0 && (
          <Link
            to="/products"
            className="mx-3 mt-3 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning transition-colors hover:bg-warning/20"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{lowStockCount} منتج بمخزون منخفض</span>
          </Link>
        )}

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {navItems.map((item) => {
            if (item.adminOnly && role !== 'admin') return null;
            
            const isActive = location.pathname === item.href;
            const Icon = item.icon;
            const showBadge = item.href === '/products' && lowStockCount > 0;

            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-gradient-to-l from-primary/20 to-accent/10 text-primary border border-primary/20'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
                )}
                style={isActive ? { boxShadow: '0 0 20px hsl(190 100% 50% / 0.15)' } : undefined}
              >
                <Icon className={cn("h-5 w-5", isActive && "text-primary")} />
                <span className="flex-1">{item.labelAr || t(item.label as any)}</span>
                {showBadge && (
                  <Badge variant="destructive" className="h-5 min-w-5 px-1 text-[10px]">
                    {lowStockCount}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Info */}
        <div className="border-t border-border/50 p-3">
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-gradient-to-l from-card to-card/50 p-3 border border-border/30">
            <div 
              className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold text-primary-foreground"
              style={{ background: 'linear-gradient(135deg, hsl(190 100% 50%), hsl(270 80% 60%))' }}
            >
              {profile?.name?.charAt(0) || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-bold text-foreground">
                {profile?.name || 'مستخدم'}
              </p>
              <p className={cn('text-xs font-medium', roleColor)}>{roleLabel}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl"
          >
            <LogOut className="h-4 w-4" />
            {t('logout')}
          </Button>
        </div>
      </div>
    </aside>
  );
}
