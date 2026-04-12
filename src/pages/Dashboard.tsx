import { useEffect, useState } from 'react';
import { DollarSign, Monitor, Receipt, AlertTriangle, Plus, ShoppingCart, TrendingUp, ShoppingBag, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { t, formatILS } from '@/lib/i18n';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { DeviceCard } from '@/components/devices/DeviceCard';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Legend,
} from 'recharts';

interface Device {
  id: string;
  name: string;
  type: 'playstation' | 'pc';
  location: string | null;
}

interface Session {
  id: string;
  device_id: string;
  start_time: string;
  paused_seconds: number;
  pause_started_at: string | null;
  status: 'running' | 'paused' | 'ended';
  rate_plan: {
    name: string;
    price_per_hour_ils: number;
  };
}

interface RatePlan {
  id: string;
  name: string;
  price_per_hour_ils: number;
}

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
  const [devices, setDevices] = useState<Device[]>([]);
  const [sessions, setSessions] = useState<Record<string, Session>>({});
  const [ratePlans, setRatePlans] = useState<RatePlan[]>([]);
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [yesterdayRevenue, setYesterdayRevenue] = useState(0);
  const [activeSessionCount, setActiveSessionCount] = useState(0);
  const [openTicketCount, setOpenTicketCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [weeklyRevenue, setWeeklyRevenue] = useState<WeeklyRevenue[]>([]);
  const [loading, setLoading] = useState(true);
  
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    fetchData();
    
    const channel = supabase
      .channel('dashboard-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () => {
        fetchSessions();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, () => {
        fetchDevices();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        fetchStats();
        fetchWeeklyRevenue();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchData = async () => {
    await Promise.all([
      fetchDevices(),
      fetchSessions(),
      fetchRatePlans(),
      fetchStats(),
      fetchTopProducts(),
      fetchWeeklyRevenue(),
    ]);
    setLoading(false);
  };

  const fetchDevices = async () => {
    const { data, error } = await supabase
      .from('devices')
      .select('id, name, type, location')
      .eq('is_active', true)
      .order('name');
    
    if (data) setDevices(data as Device[]);
    if (error) console.error('Error fetching devices:', error);
  };

  const fetchSessions = async () => {
    const { data, error } = await supabase
      .from('sessions')
      .select(`
        id, device_id, start_time, paused_seconds, pause_started_at, status,
        rate_plans!inner(name, price_per_hour_ils)
      `)
      .in('status', ['running', 'paused']);
    
    if (data) {
      const sessionMap: Record<string, Session> = {};
      data.forEach((s: any) => {
        sessionMap[s.device_id] = { ...s, rate_plan: s.rate_plans };
      });
      setSessions(sessionMap);
      setActiveSessionCount(data.length);
    }
    if (error) console.error('Error fetching sessions:', error);
  };

  const fetchRatePlans = async () => {
    const { data } = await supabase
      .from('rate_plans')
      .select('id, name, price_per_hour_ils')
      .eq('is_active', true);
    if (data) setRatePlans(data);
  };

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

  const handleStartSession = async (deviceId: string) => {
    const device = devices.find(d => d.id === deviceId);
    if (!device) return;
    const { data: deviceData } = await supabase
      .from('devices').select('default_rate_plan_id').eq('id', deviceId).single();
    const ratePlanId = deviceData?.default_rate_plan_id || ratePlans[0]?.id;
    if (!ratePlanId) {
      toast({ title: t('error'), description: 'لا توجد خطة تسعير', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('sessions').insert({
      device_id: deviceId, rate_plan_id: ratePlanId, created_by: user?.id,
    });
    if (error) toast({ title: t('error'), description: error.message, variant: 'destructive' });
    else { toast({ title: t('sessionStarted'), description: device.name }); fetchSessions(); }
  };

  const handlePauseSession = async (deviceId: string) => {
    const session = sessions[deviceId];
    if (!session) return;
    const { error } = await supabase.from('sessions')
      .update({ status: 'paused', pause_started_at: new Date().toISOString() })
      .eq('id', session.id);
    if (error) toast({ title: t('error'), description: error.message, variant: 'destructive' });
    else { toast({ title: t('sessionPaused') }); fetchSessions(); }
  };

  const handleResumeSession = async (deviceId: string) => {
    const session = sessions[deviceId];
    if (!session || !session.pause_started_at) return;
    const additionalPaused = Math.floor((Date.now() - new Date(session.pause_started_at).getTime()) / 1000);
    const { error } = await supabase.from('sessions')
      .update({ status: 'running', pause_started_at: null, paused_seconds: session.paused_seconds + additionalPaused })
      .eq('id', session.id);
    if (error) toast({ title: t('error'), description: error.message, variant: 'destructive' });
    else { toast({ title: t('sessionResumed') }); fetchSessions(); }
  };

  const handleEndSession = async (deviceId: string) => {
    const session = sessions[deviceId];
    if (!session) return;
    let totalPaused = session.paused_seconds;
    if (session.status === 'paused' && session.pause_started_at) {
      totalPaused += Math.floor((Date.now() - new Date(session.pause_started_at).getTime()) / 1000);
    }
    const { error } = await supabase.from('sessions')
      .update({ status: 'ended', end_time: new Date().toISOString(), paused_seconds: totalPaused, pause_started_at: null })
      .eq('id', session.id);
    if (error) toast({ title: t('error'), description: error.message, variant: 'destructive' });
    else { toast({ title: t('sessionEnded') }); fetchSessions(); }
  };

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
