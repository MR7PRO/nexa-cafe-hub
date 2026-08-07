import { useCallback, useEffect, useState } from 'react';
import { DollarSign, Monitor, Receipt, AlertTriangle, Plus, ShoppingCart, TrendingUp, ShoppingBag } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { t, formatILS } from '@/lib/i18n';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { DeviceCard } from '@/components/devices/DeviceCard';
import {
  useDevicesQuery,
  useActiveSessionsQuery,
  useRatePlansQuery,
  useSessionRealtime,
} from '@/hooks/useSessions';
import { useSessionWorkflow } from '@/hooks/useSessionWorkflow';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Legend,
} from 'recharts';

interface TopProduct {
  name: string;
  quantity: number;
  revenue: number;
}

interface WeeklyRevenue {
  day: string;
  sessions: number;
  products: number;
  total: number;
}

export default function Dashboard() {
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [yesterdayRevenue, setYesterdayRevenue] = useState(0);
  const [openTicketCount, setOpenTicketCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [weeklyRevenue, setWeeklyRevenue] = useState<WeeklyRevenue[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  // Shared session data layer (same source of truth as /devices)
  const { data: devices = [], isLoading: devicesLoading } = useDevicesQuery();
  const { data: sessions = {}, isLoading: sessionsLoading } = useActiveSessionsQuery();
  const { data: ratePlans = [] } = useRatePlansQuery();

  const workflow = useSessionWorkflow({ devices, sessions, ratePlans });

  const activeSessionCount = Object.keys(sessions).length;
  const loading = statsLoading || devicesLoading || sessionsLoading;

  const refreshTicketData = useCallback(() => {
    fetchStats();
    fetchWeeklyRevenue();
  }, []);

  // Realtime: sessions/devices invalidate the shared queries, tickets refresh stats only
  useSessionRealtime({ onTickets: refreshTicketData });

  useEffect(() => {
    Promise.all([fetchStats(), fetchTopProducts(), fetchWeeklyRevenue()]).finally(() =>
      setStatsLoading(false)
    );
  }, []);


  const fetchStats = async () => {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // Today + yesterday revenue in parallel
    const [todayRes, yesterdayRes, openCount, lowStockProducts] = await Promise.all([
      supabase.from('tickets').select('total_ils').eq('status', 'paid').gte('created_at', today),
      supabase.from('tickets').select('total_ils').eq('status', 'paid').gte('created_at', yesterday).lt('created_at', today),
      supabase.from('tickets').select('*', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('products').select('id, stock_qty, low_stock_threshold').eq('is_active', true).not('stock_qty', 'is', null),
    ]);

    if (todayRes.data) {
      setTodayRevenue(todayRes.data.reduce((sum, t) => sum + Number(t.total_ils), 0));
    }
    if (yesterdayRes.data) {
      setYesterdayRevenue(yesterdayRes.data.reduce((sum, t) => sum + Number(t.total_ils), 0));
    }
    if (openCount.count !== null) setOpenTicketCount(openCount.count);
    if (lowStockProducts.data) {
      const low = lowStockProducts.data.filter(p => 
        p.stock_qty !== null && p.stock_qty <= (p.low_stock_threshold || 5)
      );
      setLowStockCount(low.length);
    }
  };

  const fetchTopProducts = async () => {
    const today = new Date().toISOString().split('T')[0];
    const { data: items } = await supabase
      .from('ticket_items')
      .select('name, qty, total_ils, tickets!inner(status, created_at)')
      .eq('item_type', 'product')
      .eq('tickets.status', 'paid')
      .gte('tickets.created_at', today);

    if (!items) return;

    const productMap: Record<string, TopProduct> = {};
    items.forEach((item: any) => {
      if (!productMap[item.name]) {
        productMap[item.name] = { name: item.name, quantity: 0, revenue: 0 };
      }
      productMap[item.name].quantity += item.qty;
      productMap[item.name].revenue += Number(item.total_ils);
    });

    setTopProducts(Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5));
  };

  const fetchWeeklyRevenue = async () => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: tickets } = await supabase
      .from('tickets')
      .select('created_at, total_ils, ticket_items(item_type, total_ils)')
      .eq('status', 'paid')
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at');

    if (!tickets) return;

    const grouped: Record<string, WeeklyRevenue> = {};
    tickets.forEach((ticket: any) => {
      const date = new Date(ticket.created_at);
      const dayKey = date.toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric' });

      if (!grouped[dayKey]) {
        grouped[dayKey] = { day: dayKey, sessions: 0, products: 0, total: 0 };
      }
      grouped[dayKey].total += Number(ticket.total_ils);
      ticket.ticket_items?.forEach((item: any) => {
        if (item.item_type === 'session') {
          grouped[dayKey].sessions += Number(item.total_ils);
        } else {
          grouped[dayKey].products += Number(item.total_ils);
        }
      });
    });

    setWeeklyRevenue(Object.values(grouped));
  };

  const revenueTrend = yesterdayRevenue > 0
    ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100)
    : 0;





  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t('dashboard')}</h1>
          <p className="mt-1 text-muted-foreground">مرحباً بك في نظام إدارة المقهى</p>
        </div>
        <div className="flex gap-3">
          <Button asChild variant="outline" className="gap-2">
            <Link to="/pos"><ShoppingCart className="h-4 w-4" />{t('pos')}</Link>
          </Button>
          <Button asChild className="gap-2">
            <Link to="/devices"><Plus className="h-4 w-4" />جلسة جديدة</Link>
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t('todayRevenue')}
          value={formatILS(todayRevenue)}
          icon={<DollarSign className="h-6 w-6" />}
          variant="primary"
          trend={revenueTrend !== 0 ? { value: Math.abs(revenueTrend), isPositive: revenueTrend > 0 } : undefined}
        />
        <StatCard
          title={t('activeSessions')}
          value={activeSessionCount}
          icon={<Monitor className="h-6 w-6" />}
          variant="success"
        />
        <StatCard
          title={t('openTickets')}
          value={openTicketCount}
          icon={<Receipt className="h-6 w-6" />}
          variant="warning"
        />
        <StatCard
          title={t('lowStock')}
          value={lowStockCount}
          icon={<AlertTriangle className="h-6 w-6" />}
          variant={lowStockCount > 0 ? 'warning' : 'default'}
        />
      </div>

      {/* Devices Grid */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground">{t('deviceGrid')}</h2>
          <Link to="/devices" className="text-sm text-primary hover:underline">عرض الكل</Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {devices.slice(0, 8).map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              session={sessions[device.id] || null}
              onStart={() => handleStartSession(device.id)}
              onPause={() => handlePauseSession(device.id)}
              onResume={() => handleResumeSession(device.id)}
              onEnd={() => handleEndSession(device.id)}
              onTransfer={() => {}}
            />
          ))}
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Weekly Revenue Chart */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">إيرادات آخر 7 أيام</h3>
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          {weeklyRevenue.length === 0 ? (
            <div className="flex h-[250px] items-center justify-center text-muted-foreground">لا توجد بيانات</div>
          ) : (
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyRevenue}>
                  <defs>
                    <linearGradient id="sessionsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="productsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={{ stroke: 'hsl(var(--border))' }} />
                  <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={{ stroke: 'hsl(var(--border))' }} tickFormatter={(v) => `${v}₪`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', direction: 'rtl' }}
                    formatter={(value: number) => [`${value.toFixed(2)} ₪`, '']}
                  />
                  <Legend wrapperStyle={{ direction: 'rtl' }} />
                  <Area type="monotone" dataKey="sessions" name="الجلسات" stroke="hsl(160, 84%, 39%)" strokeWidth={2} fill="url(#sessionsGrad)" />
                  <Area type="monotone" dataKey="products" name="المنتجات" stroke="hsl(38, 92%, 50%)" strokeWidth={2} fill="url(#productsGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Top Products Today */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">الأكثر مبيعاً اليوم</h3>
            <ShoppingBag className="h-5 w-5 text-primary" />
          </div>
          {topProducts.length === 0 ? (
            <div className="flex h-[250px] items-center justify-center text-muted-foreground text-sm">لا توجد مبيعات اليوم</div>
          ) : (
            <div className="space-y-3">
              {topProducts.map((product, index) => (
                <div key={product.name} className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 p-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-foreground">{product.name}</p>
                      <p className="text-xs text-muted-foreground">{product.quantity} وحدة</p>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-bold text-primary ils-amount">{formatILS(product.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
