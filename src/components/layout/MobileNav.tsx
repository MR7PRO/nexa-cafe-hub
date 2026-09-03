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
  CalendarDays,
  Heart,
  Sparkles,
  Shield,
  ScrollText,
  Menu,
  X,
  User,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { t } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useLowStockProducts } from '@/hooks/useLowStockProducts';
import { useState } from 'react';

const navItems = [
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
  { href: '/activity', icon: ScrollText, label: 'activity', labelAr: 'سجل الحركات', managerOnly: true },
  { href: '/settings', icon: Settings, label: 'settings', adminOnly: true },
  { href: '/super-admin', icon: Shield, label: 'إدارة النظام', labelAr: 'إدارة النظام', superAdminOnly: true },
];

// Bottom tab bar items (most used)
const bottomTabs = [
  { href: '/', icon: LayoutDashboard, label: 'الرئيسية' },
  { href: '/devices', icon: Monitor, label: 'الأجهزة' },
  { href: '/pos', icon: ShoppingCart, label: 'POS' },
  { href: '/tickets', icon: Receipt, label: 'الفواتير' },
];

export function MobileNav() {
  const location = useLocation();
  const { profile, role, signOut } = useAuth();
  const { lowStockCount } = useLowStockProducts();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-card/95 backdrop-blur-xl safe-area-bottom">
        <div className="flex items-center justify-around px-1 py-1">
          {bottomTabs.map((tab) => {
            const isActive = location.pathname === tab.href;
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                to={tab.href}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-xl px-3 py-2 text-[10px] font-medium transition-colors min-w-[60px]',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground'
                )}
              >
                <Icon className={cn("h-5 w-5", isActive && "text-primary")} />
                <span>{tab.label}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex flex-col items-center gap-0.5 rounded-xl px-3 py-2 text-[10px] font-medium text-muted-foreground min-w-[60px]"
          >
            <Menu className="h-5 w-5" />
            <span>المزيد</span>
          </button>
        </div>
      </nav>

      {/* Full-screen Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-xl animate-in slide-in-from-bottom duration-200">
          <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9 border-2 border-primary/20">
                  {profile?.avatar_url ? (
                    <AvatarImage src={profile.avatar_url} alt={profile?.name || ''} />
                  ) : null}
                  <AvatarFallback
                    className="text-xs font-bold text-primary-foreground"
                    style={{ background: 'linear-gradient(135deg, hsl(190 100% 50%), hsl(270 80% 60%))' }}
                  >
                    {profile?.name?.charAt(0) || '?'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-bold text-foreground">{profile?.name || 'مستخدم'}</p>
                  <p className="text-xs text-muted-foreground">{role ? t(role as any) : ''}</p>
                </div>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="إغلاق القائمة"
                className="rounded-xl p-2 text-muted-foreground hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Nav Items */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {navItems.map((item) => {
                if ((item as any).adminOnly && role !== 'admin' && role !== 'super_admin') return null;
                if ((item as any).superAdminOnly && role !== 'super_admin') return null;

                const isActive = location.pathname === item.href;
                const Icon = item.icon;
                const showBadge = item.href === '/products' && lowStockCount > 0;

                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    onClick={() => setDrawerOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all',
                      isActive
                        ? 'bg-primary/10 text-primary border border-primary/20'
                        : 'text-foreground hover:bg-muted'
                    )}
                  >
                    <Icon className={cn("h-5 w-5", isActive && "text-primary")} />
                    <span className="flex-1">{(item as any).labelAr || t(item.label as any)}</span>
                    {showBadge && (
                      <Badge variant="destructive" className="h-5 min-w-5 px-1 text-[10px]">
                        {lowStockCount}
                      </Badge>
                    )}
                  </Link>
                );
              })}

              {/* Profile link */}
              <Link
                to="/profile"
                onClick={() => setDrawerOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all',
                  location.pathname === '/profile'
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'text-foreground hover:bg-muted'
                )}
              >
                <User className="h-5 w-5" />
                <span>الملف الشخصي</span>
              </Link>
            </div>

            {/* Logout */}
            <div className="border-t border-border/50 p-3">
              <button
                onClick={() => { signOut(); setDrawerOpen(false); }}
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="h-5 w-5" />
                <span>{t('logout')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
