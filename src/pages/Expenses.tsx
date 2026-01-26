import { useState, useEffect } from 'react';
import { Wallet, Plus, TrendingUp, TrendingDown, DollarSign, Calendar, FileText } from 'lucide-react';
import { t, formatILS } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { StatCard } from '@/components/ui/stat-card';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';
import { ar } from 'date-fns/locale';

interface Expense {
  id: string;
  title: string;
  amount_ils: number;
  note: string | null;
  created_at: string;
  created_by: string | null;
  creator_name?: string;
}

interface ProfitStats {
  grossRevenue: number;
  totalExpenses: number;
  netProfit: number;
  todayExpenses: number;
}

export default function Expenses() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [stats, setStats] = useState<ProfitStats>({
    grossRevenue: 0,
    totalExpenses: 0,
    netProfit: 0,
    todayExpenses: 0,
  });
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({});

  // Form state
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, [dateFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch expenses
      let expensesQuery = supabase
        .from('expenses')
        .select('*')
        .order('created_at', { ascending: false });

      if (dateFilter) {
        const dayStart = startOfDay(dateFilter).toISOString();
        const dayEnd = endOfDay(dateFilter).toISOString();
        expensesQuery = expensesQuery.gte('created_at', dayStart).lte('created_at', dayEnd);
      }

      const { data: expensesData } = await expensesQuery;

      // Fetch creator profiles
      if (expensesData && expensesData.length > 0) {
        const creatorIds = [...new Set(expensesData.filter(e => e.created_by).map(e => e.created_by!))];
        if (creatorIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, name')
            .in('id', creatorIds);

          if (profiles) {
            const map: Record<string, string> = {};
            profiles.forEach(p => { map[p.id] = p.name; });
            setProfilesMap(map);
          }
        }
      }

      setExpenses(expensesData || []);

      // Calculate stats for current month
      const monthStart = startOfMonth(new Date()).toISOString();
      const monthEnd = endOfMonth(new Date()).toISOString();
      const todayStart = startOfDay(new Date()).toISOString();
      const todayEnd = endOfDay(new Date()).toISOString();

      // Get monthly revenue from paid tickets
      const { data: revenueData } = await supabase
        .from('tickets')
        .select('total_ils')
        .eq('status', 'paid')
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd);

      const grossRevenue = revenueData?.reduce((sum, t) => sum + Number(t.total_ils), 0) || 0;

      // Get monthly expenses
      const { data: monthlyExpenses } = await supabase
        .from('expenses')
        .select('amount_ils')
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd);

      const totalExpenses = monthlyExpenses?.reduce((sum, e) => sum + Number(e.amount_ils), 0) || 0;

      // Get today's expenses
      const { data: todayExpensesData } = await supabase
        .from('expenses')
        .select('amount_ils')
        .gte('created_at', todayStart)
        .lte('created_at', todayEnd);

      const todayExpenses = todayExpensesData?.reduce((sum, e) => sum + Number(e.amount_ils), 0) || 0;

      setStats({
        grossRevenue,
        totalExpenses,
        netProfit: grossRevenue - totalExpenses,
        todayExpenses,
      });
    } catch (error) {
      console.error('Error fetching expenses:', error);
      toast.error(t('error'));
    } finally {
      setLoading(false);
    }
  };

  const handleAddExpense = async () => {
    if (!title.trim() || !amount) return;

    const amountValue = parseFloat(amount);
    if (isNaN(amountValue) || amountValue <= 0) {
      toast.error('أدخل مبلغ صحيح');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('expenses')
        .insert({
          title: title.trim(),
          amount_ils: amountValue,
          note: note.trim() || null,
          created_by: user?.id,
        });

      if (error) throw error;

      toast.success(t('expenseAdded'));
      setIsAddDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      console.error('Error adding expense:', error);
      toast.error(t('error'));
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setAmount('');
    setNote('');
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('expenses')}</h1>
          <p className="text-muted-foreground">تتبع المصروفات وحساب الأرباح</p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          {t('addExpense')}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          title={t('grossRevenue')}
          value={formatILS(stats.grossRevenue)}
          icon={<TrendingUp className="h-6 w-6" />}
          variant="success"
        />
        <StatCard
          title={t('totalExpenses')}
          value={formatILS(stats.totalExpenses)}
          icon={<TrendingDown className="h-6 w-6" />}
          variant="warning"
        />
        <StatCard
          title={t('netProfit')}
          value={formatILS(stats.netProfit)}
          icon={<DollarSign className="h-6 w-6" />}
          variant={stats.netProfit >= 0 ? 'success' : 'warning'}
        />
        <StatCard
          title={t('todayExpenses')}
          value={formatILS(stats.todayExpenses)}
          icon={<Wallet className="h-6 w-6" />}
          variant="default"
        />
      </div>

      {/* Profit Visualization */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            ملخص الربح الشهري
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Revenue Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('grossRevenue')}</span>
                <span className="font-medium text-success">{formatILS(stats.grossRevenue)}</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-muted">
                <div 
                  className="h-full rounded-full bg-success transition-all"
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            {/* Expenses Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('totalExpenses')}</span>
                <span className="font-medium text-destructive">{formatILS(stats.totalExpenses)}</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-muted">
                <div 
                  className="h-full rounded-full bg-destructive transition-all"
                  style={{ 
                    width: stats.grossRevenue > 0 
                      ? `${Math.min((stats.totalExpenses / stats.grossRevenue) * 100, 100)}%` 
                      : '0%' 
                  }}
                />
              </div>
            </div>

            {/* Net Profit */}
            <div className="mt-4 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <span className="text-lg font-medium">{t('netProfit')}</span>
                <span className={cn(
                  'text-2xl font-bold',
                  stats.netProfit >= 0 ? 'text-success' : 'text-destructive'
                )}>
                  {stats.netProfit >= 0 ? '+' : ''}{formatILS(stats.netProfit)}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                نسبة الربح: {stats.grossRevenue > 0 
                  ? `${((stats.netProfit / stats.grossRevenue) * 100).toFixed(1)}%`
                  : '0%'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Expenses List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              سجل المصروفات
            </CardTitle>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Calendar className="h-4 w-4" />
                  {dateFilter ? format(dateFilter, 'yyyy/MM/dd', { locale: ar }) : 'فلترة بالتاريخ'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <CalendarComponent
                  mode="single"
                  selected={dateFilter}
                  onSelect={setDateFilter}
                  locale={ar}
                  className="pointer-events-auto"
                />
                {dateFilter && (
                  <div className="border-t p-2">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="w-full" 
                      onClick={() => setDateFilter(undefined)}
                    >
                      مسح الفلتر
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </CardHeader>
        <CardContent>
          {expenses.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <Wallet className="h-8 w-8" />
              <p>{t('noExpenses')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('expenseTitle')}</TableHead>
                    <TableHead>{t('expenseAmount')}</TableHead>
                    <TableHead>{t('expenseNote')}</TableHead>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>بواسطة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell className="font-medium">{expense.title}</TableCell>
                      <TableCell className="text-destructive font-mono">
                        -{formatILS(expense.amount_ils)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {expense.note || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{format(new Date(expense.created_at), 'yyyy/MM/dd', { locale: ar })}</div>
                          <div className="text-muted-foreground">
                            {format(new Date(expense.created_at), 'HH:mm', { locale: ar })}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {expense.created_by ? (
                          <div className="flex items-center gap-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                              {profilesMap[expense.created_by]?.charAt(0) || '?'}
                            </div>
                            <span className="text-sm">{profilesMap[expense.created_by] || 'غير معروف'}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Expense Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              {t('addExpense')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">{t('expenseTitle')}</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثال: شراء مستلزمات"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">{t('expenseAmount')}</Label>
              <div className="relative">
                <DollarSign className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="pr-10 text-left"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="note">{t('expenseNote')} (اختياري)</Label>
              <Textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="أضف ملاحظة..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setIsAddDialogOpen(false); resetForm(); }}>
              {t('cancel')}
            </Button>
            <Button onClick={handleAddExpense} disabled={!title.trim() || !amount || submitting}>
              {submitting ? 'جاري الإضافة...' : t('add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
