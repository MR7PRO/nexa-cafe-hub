import { useMemo, useState } from 'react';
import {
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
  Package,
} from 'lucide-react';
import { exportReportPDF, exportReportExcel } from '@/lib/reportExport';
import { t, formatILS } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { useReportMetrics, type ReportPeriod } from '@/hooks/useReportMetrics';
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
  Legend,
  AreaChart,
  Area,
} from 'recharts';

const COLORS = ['hsl(187, 100%, 50%)', 'hsl(160, 84%, 39%)', 'hsl(38, 92%, 50%)', 'hsl(270, 70%, 55%)', 'hsl(0, 72%, 55%)'];

const periodLabels: Record<ReportPeriod, string> = {
  daily: 'آخر 7 أيام',
  weekly: 'آخر 4 أسابيع',
  monthly: 'آخر 6 أشهر',
  custom: 'فترة مخصصة',
};

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function Reports() {
  const [period, setPeriod] = useState<ReportPeriod>('daily');
  const [customFrom, setCustomFrom] = useState(todayStr());
  const [customTo, setCustomTo] = useState(todayStr());
  const { toast } = useToast();

  const { data, isLoading } = useReportMetrics(period, { from: customFrom, to: customTo });

  const m = data;

  const totalRevenue = m?.total_revenue ?? 0;
  const sessionRevenue = m?.session_revenue ?? 0;
  const productRevenue = m?.product_revenue ?? 0;
  const totalTickets = m?.total_tickets ?? 0;
  const avgTicket = m?.avg_ticket_value ?? 0;
  const cogs = m?.product_cogs ?? 0;
  const grossProductProfit = m?.product_gross_profit ?? 0;
  const expenses = m?.operating_expenses ?? 0;
  // Operating result = revenue - product cost of goods - operating expenses
  const operatingResult = Math.round((totalRevenue - cogs - expenses) * 100) / 100;
  const margin = totalRevenue > 0 ? (operatingResult / totalRevenue) * 100 : 0;

  const revenueData = useMemo(() => {
    const series = m?.revenue_series ?? [];
    return series.map((row) => {
      const date = new Date(`${row.bucket}T00:00:00`);
      let label: string;
      if (period === 'monthly') label = date.toLocaleDateString('ar-EG', { month: 'short' });
      else if (period === 'weekly') label = date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
      else label = date.toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric' });
      return {
        date: label,
        sessions: Number(row.sessions),
        products: Number(row.products),
        total: Number(row.total),
      };
    });
  }, [m?.revenue_series, period]);

  const deviceStats = useMemo(
    () => (m?.devices ?? []).filter((d) => d.sessions > 0).slice(0, 5),
    [m?.devices]
  );

  const hourlyData = useMemo(
    () => (m?.peak_hours ?? []).map((h) => ({ hour: `${h.hour}:00`, sessions: Number(h.sessions) })),
    [m?.peak_hours]
  );

  const topProducts = m?.top_products ?? [];
  const topByQty = m?.top_products_by_qty ?? [];
  const topByProfit = m?.top_products_by_profit ?? [];
  const employeeStats = useMemo(
    () =>
      (m?.staff ?? []).map((s) => ({
        name: s.name,
        sessionsStarted: s.sessions_started,
        ticketsClosed: s.tickets_closed,
        totalRevenue: Number(s.revenue),
      })),
    [m?.staff]
  );

  const periodLabel =
    period === 'custom' ? `${customFrom} → ${customTo}` : periodLabels[period];

  const getExportData = () => ({
    revenueData,
    totalRevenue,
    sessionRevenue,
    productRevenue,
    totalTickets,
    avgTicketValue: avgTicket,
    cogs,
    grossProductProfit,
    operatingExpenses: expenses,
    operatingResult,
    profitMargin: margin,
    sessionsCount: m?.sessions_count ?? 0,
    avgSessionMinutes: m?.avg_session_minutes ?? 0,
    lowStockCount: m?.low_stock_count ?? 0,
    shiftCashDifference: m?.shift_cash_difference ?? 0,
    devices: (m?.devices ?? []).map((d) => ({
      name: d.name,
      sessions: d.sessions,
      revenue: Number(d.revenue),
      utilization: Number(d.utilization_pct),
    })),
    employeeStats,
    topProducts: topProducts.map((p) => ({
      name: p.name,
      quantity: p.quantity,
      revenue: Number(p.revenue ?? 0),
      profit: Number(p.profit ?? 0),
    })),
    expenses: [],
    periodLabel,
  });

  const handleExportPDF = () => {
    exportReportPDF(getExportData());
    toast({ title: 'تم التصدير', description: 'تم تصدير التقرير كـ PDF' });
  };

  const handleExportExcel = () => {
    exportReportExcel(getExportData());
    toast({ title: 'تم التصدير', description: 'تم تصدير التقرير كـ Excel' });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t('reports')}</h1>
          <p className="mt-1 text-muted-foreground">تحليلات وإحصائيات المبيعات</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {period === 'custom' && (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-[150px]"
              />
              <span className="text-muted-foreground">-</span>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-[150px]"
              />
            </div>
          )}
          <Select value={period} onValueChange={(v: ReportPeriod) => setPeriod(v)}>
            <SelectTrigger className="w-[180px]">
              <Calendar className="ml-2 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">آخر 7 أيام</SelectItem>
              <SelectItem value="weekly">آخر 4 أسابيع</SelectItem>
              <SelectItem value="monthly">آخر 6 أشهر</SelectItem>
              <SelectItem value="custom">فترة مخصصة</SelectItem>
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
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-lg border border-border/50 bg-muted/30 p-4 text-center">
            <p className="text-sm text-muted-foreground">إجمالي الإيرادات</p>
            <p className="mt-1 text-2xl font-bold text-success ils-amount">{formatILS(totalRevenue)}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-muted/30 p-4 text-center">
            <p className="text-sm text-muted-foreground">تكلفة المنتجات المباعة</p>
            <p className="mt-1 text-2xl font-bold text-destructive ils-amount">{formatILS(cogs)}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-muted/30 p-4 text-center">
            <p className="text-sm text-muted-foreground">ربح المنتجات الإجمالي</p>
            <p className="mt-1 text-2xl font-bold text-primary ils-amount">{formatILS(grossProductProfit)}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-muted/30 p-4 text-center">
            <p className="text-sm text-muted-foreground">المصروفات التشغيلية</p>
            <p className="mt-1 text-2xl font-bold text-destructive ils-amount">{formatILS(expenses)}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-muted/30 p-4 text-center">
            <p className="text-sm text-muted-foreground">الناتج التشغيلي</p>
            <p className={cn('mt-1 text-2xl font-bold ils-amount', operatingResult >= 0 ? 'text-success' : 'text-destructive')}>
              {formatILS(operatingResult)}
            </p>
          </div>
          <div className="rounded-lg border border-border/50 bg-muted/30 p-4 text-center">
            <p className="text-sm text-muted-foreground">هامش الربح</p>
            <p className={cn('mt-1 text-2xl font-bold', totalRevenue > 0 ? 'text-primary' : 'text-muted-foreground')}>
              {totalRevenue > 0 ? `${margin.toFixed(1)}%` : '0%'}
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          الناتج التشغيلي = الإيرادات المحصّلة − تكلفة المنتجات المباعة − المصروفات التشغيلية (لا يشمل الرواتب أو الأصول غير المسجّلة كمصروفات)
        </p>
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

      {/* Operations Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-sm text-muted-foreground">متوسط قيمة الفاتورة</p>
          <p className="mt-1 text-xl font-bold text-foreground ils-amount">{formatILS(avgTicket)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-sm text-muted-foreground">عدد الجلسات</p>
          <p className="mt-1 text-xl font-bold text-foreground">{m?.sessions_count ?? 0}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-sm text-muted-foreground">متوسط مدة الجلسة</p>
          <p className="mt-1 text-xl font-bold text-foreground">{Math.round(m?.avg_session_minutes ?? 0)} د</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-sm text-muted-foreground">منتجات منخفضة المخزون</p>
          <p className="mt-1 text-xl font-bold text-warning">{m?.low_stock_count ?? 0}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-sm text-muted-foreground">فروقات الورديات النقدية</p>
          <p className={cn('mt-1 text-xl font-bold ils-amount', (m?.shift_cash_difference ?? 0) < 0 ? 'text-destructive' : 'text-success')}>
            {formatILS(m?.shift_cash_difference ?? 0)}
          </p>
        </div>
      </div>

      {/* Revenue Chart */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">الإيرادات - {periodLabel}</h3>
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
                    formatter={(value: number) => [`${Number(value).toFixed(2)} ₪`, 'الإيرادات']}
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
                  <span className="text-muted-foreground">{Number(device.utilization_pct).toFixed(0)}% استخدام</span>
                  <span className="font-mono font-medium">{formatILS(Number(device.revenue))}</span>
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
            {topProducts.slice(0, 5).map((product, index) => (
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
                  {formatILS(Number(product.revenue ?? 0))}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  ربح: {formatILS(Number(product.profit ?? 0))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top by quantity / profit */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">الأكثر مبيعاً بالكمية</h3>
            <Package className="h-5 w-5 text-primary" />
          </div>
          <div className="space-y-2">
            {topByQty.slice(0, 5).map((p) => (
              <div key={p.name} className="flex items-center justify-between text-sm">
                <span className="text-foreground">{p.name}</span>
                <span className="text-muted-foreground">{p.quantity} وحدة</span>
              </div>
            ))}
            {topByQty.length === 0 && <p className="text-sm text-muted-foreground">لا توجد بيانات</p>}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">الأعلى ربحية</h3>
            <Download className="h-5 w-5 text-primary" />
          </div>
          <div className="space-y-2">
            {topByProfit.slice(0, 5).map((p) => (
              <div key={p.name} className="flex items-center justify-between text-sm">
                <span className="text-foreground">{p.name}</span>
                <span className="font-mono font-medium text-success">{formatILS(Number(p.profit ?? 0))}</span>
              </div>
            ))}
            {topByProfit.length === 0 && <p className="text-sm text-muted-foreground">لا توجد بيانات</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
