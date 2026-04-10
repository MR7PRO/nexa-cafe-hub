import { useEffect, useState } from 'react';
import { 
  BarChart3, 
  Download, 
  Calendar, 
  TrendingUp, 
  Monitor, 
  Clock, 
  ShoppingBag,
  DollarSign,
  Gamepad2,
  Users,
  UserCheck,
  FileText,
  FileSpreadsheet,
  TrendingDown,
  MinusCircle,
} from 'lucide-react';
import { exportReportPDF, exportReportExcel } from '@/lib/reportExport';
import { supabase } from '@/integrations/supabase/client';
import { t, formatILS } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatCard } from '@/components/ui/stat-card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
  AreaChart,
  Area,
} from 'recharts';

type Period = 'daily' | 'weekly' | 'monthly';

interface RevenueData {
  date: string;
  sessions: number;
  products: number;
  total: number;
}

interface DeviceStats {
  name: string;
  revenue: number;
  sessions: number;
}

interface HourlyData {
  hour: string;
  sessions: number;
}

interface ProductStats {
  name: string;
  quantity: number;
  revenue: number;
}

interface EmployeeStats {
  name: string;
  sessionsStarted: number;
  ticketsClosed: number;
  totalRevenue: number;
}

const COLORS = ['hsl(187, 100%, 50%)', 'hsl(160, 84%, 39%)', 'hsl(38, 92%, 50%)', 'hsl(270, 70%, 55%)', 'hsl(0, 72%, 55%)'];

export default function Reports() {
  const [period, setPeriod] = useState<Period>('daily');
  const [loading, setLoading] = useState(true);
  
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [sessionRevenue, setSessionRevenue] = useState(0);
  const [productRevenue, setProductRevenue] = useState(0);
  const [totalTickets, setTotalTickets] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  
  const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
  const [deviceStats, setDeviceStats] = useState<DeviceStats[]>([]);
  const [hourlyData, setHourlyData] = useState<HourlyData[]>([]);
  const [topProducts, setTopProducts] = useState<ProductStats[]>([]);
  const [employeeStats, setEmployeeStats] = useState<EmployeeStats[]>([]);
  
  const { toast } = useToast();

  useEffect(() => {
    fetchReports();
  }, [period]);

  const getDateRange = () => {
    const now = new Date();
    let startDate: Date;
    
    switch (period) {
      case 'daily':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'weekly':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 28);
        break;
      case 'monthly':
        startDate = new Date(now);
        startDate.setMonth(startDate.getMonth() - 6);
        break;
    }
    
    return { startDate, endDate: now };
  };

  const fetchReports = async () => {
    setLoading(true);
    const { startDate, endDate } = getDateRange();
    
    await Promise.all([
      fetchRevenueSummary(startDate),
      fetchRevenueChart(startDate, endDate),
      fetchDeviceStats(startDate),
      fetchHourlyStats(startDate),
      fetchTopProducts(startDate),
      fetchEmployeeStats(startDate),
      fetchExpenses(startDate),
    ]);
    
    setLoading(false);
  };

  const fetchRevenueSummary = async (startDate: Date) => {
    const { data: tickets } = await supabase
      .from('tickets')
      .select('total_ils, ticket_items(item_type, total_ils)')
      .eq('status', 'paid')
      .gte('created_at', startDate.toISOString());

    if (tickets) {
      let total = 0;
      let sessions = 0;
      let products = 0;

      tickets.forEach((ticket: any) => {
        total += Number(ticket.total_ils);
        ticket.ticket_items?.forEach((item: any) => {
          if (item.item_type === 'session') {
            sessions += Number(item.total_ils);
          } else {
            products += Number(item.total_ils);
          }
        });
      });

      setTotalRevenue(total);
      setSessionRevenue(sessions);
      setProductRevenue(products);
      setTotalTickets(tickets.length);
    }
  };

  const fetchRevenueChart = async (startDate: Date, endDate: Date) => {
    const { data: tickets } = await supabase
      .from('tickets')
      .select('created_at, total_ils, ticket_items(item_type, total_ils)')
      .eq('status', 'paid')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at');

    if (!tickets) return;

    const groupedData: Record<string, RevenueData> = {};

    tickets.forEach((ticket: any) => {
      let dateKey: string;
      const date = new Date(ticket.created_at);

      switch (period) {
        case 'daily':
          dateKey = date.toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric' });
          break;
        case 'weekly':
          const weekNum = Math.floor((date.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
          dateKey = `أسبوع ${weekNum + 1}`;
          break;
        case 'monthly':
          dateKey = date.toLocaleDateString('ar-EG', { month: 'short' });
          break;
      }

      if (!groupedData[dateKey]) {
        groupedData[dateKey] = { date: dateKey, sessions: 0, products: 0, total: 0 };
      }

      groupedData[dateKey].total += Number(ticket.total_ils);
      
      ticket.ticket_items?.forEach((item: any) => {
        if (item.item_type === 'session') {
          groupedData[dateKey].sessions += Number(item.total_ils);
        } else {
          groupedData[dateKey].products += Number(item.total_ils);
        }
      });
    });

    setRevenueData(Object.values(groupedData));
  };

  const fetchDeviceStats = async (startDate: Date) => {
    const { data: sessions } = await supabase
      .from('sessions')
      .select(`
        device_id,
        devices(name),
        rate_plans(price_per_hour_ils),
        start_time,
        end_time,
        paused_seconds
      `)
      .eq('status', 'ended')
      .gte('created_at', startDate.toISOString());

    if (!sessions) return;

    const deviceMap: Record<string, DeviceStats> = {};

    sessions.forEach((session: any) => {
      const deviceName = session.devices?.name || 'غير معروف';
      
      if (!deviceMap[deviceName]) {
        deviceMap[deviceName] = { name: deviceName, revenue: 0, sessions: 0 };
      }

      deviceMap[deviceName].sessions += 1;

      if (session.end_time && session.start_time) {
        const startTime = new Date(session.start_time).getTime();
        const endTime = new Date(session.end_time).getTime();
        const pausedMs = (session.paused_seconds || 0) * 1000;
        const activeMs = endTime - startTime - pausedMs;
        const hours = activeMs / (1000 * 60 * 60);
        const pricePerHour = session.rate_plans?.price_per_hour_ils || 15;
        deviceMap[deviceName].revenue += hours * pricePerHour;
      }
    });

    const sorted = Object.values(deviceMap).sort((a, b) => b.revenue - a.revenue);
    setDeviceStats(sorted.slice(0, 5));
  };

  const fetchHourlyStats = async (startDate: Date) => {
    const { data: sessions } = await supabase
      .from('sessions')
      .select('start_time')
      .gte('created_at', startDate.toISOString());

    if (!sessions) return;

    const hourlyMap: Record<number, number> = {};
    
    for (let i = 0; i < 24; i++) {
      hourlyMap[i] = 0;
    }

    sessions.forEach((session: any) => {
      const hour = new Date(session.start_time).getHours();
      hourlyMap[hour] += 1;
    });

    const data = Object.entries(hourlyMap).map(([hour, sessions]) => ({
      hour: `${hour}:00`,
      sessions,
    }));

    setHourlyData(data);
  };

  const fetchTopProducts = async (startDate: Date) => {
    const { data: items } = await supabase
      .from('ticket_items')
      .select('name, qty, total_ils, tickets!inner(status, created_at)')
      .eq('item_type', 'product')
      .eq('tickets.status', 'paid')
      .gte('tickets.created_at', startDate.toISOString());

    if (!items) return;

    const productMap: Record<string, ProductStats> = {};

    items.forEach((item: any) => {
      if (!productMap[item.name]) {
        productMap[item.name] = { name: item.name, quantity: 0, revenue: 0 };
      }
      productMap[item.name].quantity += item.qty;
      productMap[item.name].revenue += Number(item.total_ils);
    });

    const sorted = Object.values(productMap).sort((a, b) => b.revenue - a.revenue);
    setTopProducts(sorted.slice(0, 5));
  };

  const fetchEmployeeStats = async (startDate: Date) => {
    // Fetch profiles for name mapping
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name');

    if (!profiles) return;

    const profileMap = new Map(profiles.map(p => [p.id, p.name]));

    // Fetch sessions created by employees
    const { data: sessions } = await supabase
      .from('sessions')
      .select('created_by')
      .gte('created_at', startDate.toISOString());

    // Fetch tickets closed by employees
    const { data: tickets } = await supabase
      .from('tickets')
      .select('created_by, total_ils')
      .eq('status', 'paid')
      .gte('created_at', startDate.toISOString());

    const empMap: Record<string, EmployeeStats> = {};

    sessions?.forEach((s: any) => {
      if (!s.created_by) return;
      const name = profileMap.get(s.created_by) || 'غير معروف';
      if (!empMap[s.created_by]) {
        empMap[s.created_by] = { name, sessionsStarted: 0, ticketsClosed: 0, totalRevenue: 0 };
      }
      empMap[s.created_by].sessionsStarted += 1;
    });

    tickets?.forEach((t: any) => {
      if (!t.created_by) return;
      const name = profileMap.get(t.created_by) || 'غير معروف';
      if (!empMap[t.created_by]) {
        empMap[t.created_by] = { name, sessionsStarted: 0, ticketsClosed: 0, totalRevenue: 0 };
      }
      empMap[t.created_by].ticketsClosed += 1;
      empMap[t.created_by].totalRevenue += Number(t.total_ils);
    });

    const sorted = Object.values(empMap).sort((a, b) => b.totalRevenue - a.totalRevenue);
    setEmployeeStats(sorted);
  };

  const fetchExpenses = async (startDate: Date) => {
    const { data } = await supabase
      .from('expenses')
      .select('amount_ils')
      .gte('created_at', startDate.toISOString());

    if (data) {
      setTotalExpenses(data.reduce((sum, e) => sum + Number(e.amount_ils), 0));
    }
  };

  const getExportData = () => ({
    revenueData,
    totalRevenue,
    sessionRevenue,
    productRevenue,
    totalTickets,
    employeeStats,
    topProducts: topProducts.map(p => ({ name: p.name, quantity: p.quantity, revenue: p.revenue })),
    expenses: [],
    periodLabel: periodLabels[period],
  });

  const handleExportPDF = () => {
    exportReportPDF(getExportData());
    toast({ title: 'تم التصدير', description: 'تم تصدير التقرير كـ PDF' });
  };

  const handleExportExcel = () => {
    exportReportExcel(getExportData());
    toast({ title: 'تم التصدير', description: 'تم تصدير التقرير كـ Excel' });
  };

  const periodLabels = {
    daily: 'آخر 7 أيام',
    weekly: 'آخر 4 أسابيع',
    monthly: 'آخر 6 أشهر',
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t('reports')}</h1>
          <p className="mt-1 text-muted-foreground">تحليلات وإحصائيات المبيعات</p>
        </div>
        <div className="flex gap-3">
          <Select value={period} onValueChange={(v: Period) => setPeriod(v)}>
            <SelectTrigger className="w-[180px]">
              <Calendar className="ml-2 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">آخر 7 أيام</SelectItem>
              <SelectItem value="weekly">آخر 4 أسابيع</SelectItem>
              <SelectItem value="monthly">آخر 6 أشهر</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleExportPDF} variant="outline" className="gap-2">
            <FileText className="h-4 w-4" />
            PDF
          </Button>
          <Button onClick={handleExportExcel} variant="outline" className="gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </Button>
        </div>
      </div>

      {/* Profit & Loss Summary */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">ملخص الأرباح والخسائر</h3>
          <TrendingDown className="h-5 w-5 text-primary" />
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="rounded-lg border border-border/50 bg-muted/30 p-4 text-center">
            <p className="text-sm text-muted-foreground">إجمالي الإيرادات</p>
            <p className="mt-1 text-2xl font-bold text-success ils-amount">{formatILS(totalRevenue)}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-muted/30 p-4 text-center">
            <p className="text-sm text-muted-foreground">إجمالي المصروفات</p>
            <p className="mt-1 text-2xl font-bold text-destructive ils-amount">{formatILS(totalExpenses)}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-muted/30 p-4 text-center">
            <p className="text-sm text-muted-foreground">صافي الربح</p>
            <p className={cn('mt-1 text-2xl font-bold ils-amount', totalRevenue - totalExpenses >= 0 ? 'text-success' : 'text-destructive')}>
              {formatILS(totalRevenue - totalExpenses)}
            </p>
          </div>
          <div className="rounded-lg border border-border/50 bg-muted/30 p-4 text-center">
            <p className="text-sm text-muted-foreground">هامش الربح</p>
            <p className={cn('mt-1 text-2xl font-bold', totalRevenue > 0 ? 'text-primary' : 'text-muted-foreground')}>
              {totalRevenue > 0 ? `${(((totalRevenue - totalExpenses) / totalRevenue) * 100).toFixed(1)}%` : '0%'}
            </p>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="إجمالي الإيرادات"
          value={formatILS(totalRevenue)}
          icon={<DollarSign className="h-6 w-6" />}
          variant="primary"
        />
        <StatCard
          title="إيرادات الجلسات"
          value={formatILS(sessionRevenue)}
          icon={<Gamepad2 className="h-6 w-6" />}
          variant="success"
        />
        <StatCard
          title="إيرادات المنتجات"
          value={formatILS(productRevenue)}
          icon={<ShoppingBag className="h-6 w-6" />}
          variant="warning"
        />
        <StatCard
          title="عدد الفواتير"
          value={totalTickets}
          icon={<Users className="h-6 w-6" />}
        />
      </div>

      {/* Revenue Chart */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">الإيرادات - {periodLabels[period]}</h3>
          <TrendingUp className="h-5 w-5 text-primary" />
        </div>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={revenueData} layout="horizontal">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="date" 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
              />
              <YAxis 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickFormatter={(value) => `${value}₪`}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  direction: 'rtl',
                }}
                formatter={(value: number) => [`${value.toFixed(2)} ₪`, '']}
              />
              <Legend 
                wrapperStyle={{ direction: 'rtl' }}
                formatter={(value) => value === 'sessions' ? 'الجلسات' : value === 'products' ? 'المنتجات' : value}
              />
              <Bar dataKey="sessions" name="الجلسات" fill="hsl(160, 84%, 39%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="products" name="المنتجات" fill="hsl(38, 92%, 50%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Two Column Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Devices */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">أفضل الأجهزة</h3>
            <Monitor className="h-5 w-5 text-primary" />
          </div>
          {deviceStats.length === 0 ? (
            <div className="flex h-[250px] items-center justify-center text-muted-foreground">
              لا توجد بيانات
            </div>
          ) : (
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={deviceStats}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="revenue"
                    nameKey="name"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={false}
                  >
                    {deviceStats.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number) => [`${value.toFixed(2)} ₪`, 'الإيرادات']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-4 space-y-2">
            {deviceStats.map((device, index) => (
              <div key={device.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div 
                    className="h-3 w-3 rounded-full" 
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span>{device.name}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-muted-foreground">{device.sessions} جلسة</span>
                  <span className="font-mono font-medium">{formatILS(device.revenue)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Peak Hours */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">ساعات الذروة</h3>
            <Clock className="h-5 w-5 text-primary" />
          </div>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlyData}>
                <defs>
                  <linearGradient id="peakGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(187, 100%, 50%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(187, 100%, 50%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="hour" 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  interval={2}
                />
                <YAxis 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => [`${value} جلسة`, 'عدد الجلسات']}
                />
                <Area 
                  type="monotone" 
                  dataKey="sessions" 
                  stroke="hsl(187, 100%, 50%)" 
                  strokeWidth={2}
                  fill="url(#peakGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 text-center text-sm text-muted-foreground">
            {hourlyData.length > 0 && (
              <>
                ذروة النشاط: {' '}
                <span className="font-medium text-primary">
                  {hourlyData.reduce((max, curr) => curr.sessions > max.sessions ? curr : max, hourlyData[0]).hour}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Employee Performance */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">أداء الموظفين</h3>
          <UserCheck className="h-5 w-5 text-primary" />
        </div>
        {employeeStats.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            لا توجد بيانات
          </div>
        ) : (
          <>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={employeeStats} layout="horizontal">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                  />
                  <YAxis 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      direction: 'rtl',
                    }}
                  />
                  <Legend wrapperStyle={{ direction: 'rtl' }} />
                  <Bar dataKey="sessionsStarted" name="جلسات بدأها" fill="hsl(187, 100%, 50%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="ticketsClosed" name="فواتير أغلقها" fill="hsl(270, 70%, 55%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-2 text-right font-medium text-muted-foreground">الموظف</th>
                    <th className="pb-2 text-center font-medium text-muted-foreground">جلسات بدأها</th>
                    <th className="pb-2 text-center font-medium text-muted-foreground">فواتير أغلقها</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">إجمالي الإيرادات</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeStats.map((emp, idx) => (
                    <tr key={idx} className="border-b border-border/50">
                      <td className="py-2 font-medium text-foreground">{emp.name}</td>
                      <td className="py-2 text-center text-muted-foreground">{emp.sessionsStarted}</td>
                      <td className="py-2 text-center text-muted-foreground">{emp.ticketsClosed}</td>
                      <td className="py-2 text-left font-mono font-bold text-primary">{formatILS(emp.totalRevenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Top Products */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">أفضل المنتجات مبيعاً</h3>
          <ShoppingBag className="h-5 w-5 text-primary" />
        </div>
        {topProducts.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            لا توجد بيانات
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {topProducts.map((product, index) => (
              <div 
                key={product.name}
                className={cn(
                  'rounded-lg border p-4 text-center transition-all',
                  index === 0 ? 'border-primary/50 bg-primary/5' : 'border-border bg-muted/30'
                )}
              >
                <div className="mb-2 text-2xl font-bold text-foreground">#{index + 1}</div>
                <div className="font-medium text-foreground">{product.name}</div>
                <div className="mt-2 text-sm text-muted-foreground">{product.quantity} وحدة</div>
                <div className="mt-1 font-mono text-lg font-bold text-primary">
                  {formatILS(product.revenue)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
