import { useState, useEffect } from 'react';
import { Clock, DollarSign, Play, Square, TrendingUp, TrendingDown, Minus, Calendar, User } from 'lucide-react';
import { t, formatILS, formatDuration } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, startOfDay, endOfDay, differenceInMinutes } from 'date-fns';
import { ar } from 'date-fns/locale';

interface Shift {
  id: string;
  employee_id: string;
  open_time: string;
  close_time: string | null;
  opening_cash_ils: number;
  closing_cash_ils: number | null;
  expected_cash_ils: number | null;
  difference_ils: number | null;
  employee_name?: string;
}

interface ShiftStats {
  cashIn: number;
  cashOut: number;
  expectedCash: number;
}

export default function Shifts() {
  const { user, profile } = useAuth();
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [shiftHistory, setShiftHistory] = useState<Shift[]>([]);
  const [shiftStats, setShiftStats] = useState<ShiftStats>({ cashIn: 0, cashOut: 0, expectedCash: 0 });
  const [loading, setLoading] = useState(true);
  const [isOpenDialogOpen, setIsOpenDialogOpen] = useState(false);
  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
  const [openingCash, setOpeningCash] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchData();
  }, [user, dateFilter]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Fetch current open shift for this user
      const { data: openShift } = await supabase
        .from('shifts')
        .select('*')
        .eq('employee_id', user.id)
        .is('close_time', null)
        .maybeSingle();

      setCurrentShift(openShift);

      // If there's an open shift, calculate expected cash
      if (openShift) {
        await calculateShiftStats(openShift);
      }

      // Fetch shift history
      let historyQuery = supabase
        .from('shifts')
        .select('*')
        .not('close_time', 'is', null)
        .order('close_time', { ascending: false })
        .limit(50);

      if (dateFilter) {
        const dayStart = startOfDay(dateFilter).toISOString();
        const dayEnd = endOfDay(dateFilter).toISOString();
        historyQuery = historyQuery.gte('open_time', dayStart).lte('open_time', dayEnd);
      }

      const { data: history } = await historyQuery;
      
      // Fetch all unique employee IDs from history
      if (history && history.length > 0) {
        const employeeIds = [...new Set(history.map(s => s.employee_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, name')
          .in('id', employeeIds);
        
        if (profiles) {
          const map: Record<string, string> = {};
          profiles.forEach(p => { map[p.id] = p.name; });
          setProfilesMap(map);
        }
      }

      setShiftHistory(history || []);
    } catch (error) {
      console.error('Error fetching shifts:', error);
      toast.error(t('error'));
    } finally {
      setLoading(false);
    }
  };

  const calculateShiftStats = async (shift: Shift) => {
    try {
      // Get cash payments during this shift
      const { data: cashPayments } = await supabase
        .from('payments')
        .select('amount_ils, tickets!inner(status, created_at)')
        .eq('method', 'cash')
        .gte('created_at', shift.open_time);

      const cashIn = cashPayments
        ?.filter(p => (p.tickets as any)?.status === 'paid')
        .reduce((sum, p) => sum + Number(p.amount_ils), 0) || 0;

      // Get expenses during this shift
      const { data: expenses } = await supabase
        .from('expenses')
        .select('amount_ils')
        .gte('created_at', shift.open_time);

      const cashOut = expenses?.reduce((sum, e) => sum + Number(e.amount_ils), 0) || 0;

      const expectedCash = shift.opening_cash_ils + cashIn - cashOut;

      setShiftStats({ cashIn, cashOut, expectedCash });
    } catch (error) {
      console.error('Error calculating shift stats:', error);
    }
  };

  const handleOpenShift = async () => {
    if (!user || !openingCash) return;

    const amount = parseFloat(openingCash);
    if (isNaN(amount) || amount < 0) {
      toast.error('أدخل مبلغ صحيح');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('shifts')
        .insert({
          employee_id: user.id,
          opening_cash_ils: amount,
        })
        .select()
        .single();

      if (error) throw error;

      setCurrentShift(data);
      setShiftStats({ cashIn: 0, cashOut: 0, expectedCash: amount });
      setIsOpenDialogOpen(false);
      setOpeningCash('');
      toast.success(t('shiftOpened'));
    } catch (error) {
      console.error('Error opening shift:', error);
      toast.error(t('error'));
    }
  };

  const handleCloseShift = async () => {
    if (!currentShift || !closingCash) return;

    const amount = parseFloat(closingCash);
    if (isNaN(amount) || amount < 0) {
      toast.error('أدخل مبلغ صحيح');
      return;
    }

    const difference = amount - shiftStats.expectedCash;

    try {
      const { error } = await supabase
        .from('shifts')
        .update({
          close_time: new Date().toISOString(),
          closing_cash_ils: amount,
          expected_cash_ils: shiftStats.expectedCash,
          difference_ils: difference,
        })
        .eq('id', currentShift.id);

      if (error) throw error;

      setCurrentShift(null);
      setShiftStats({ cashIn: 0, cashOut: 0, expectedCash: 0 });
      setIsCloseDialogOpen(false);
      setClosingCash('');
      toast.success(t('shiftClosed'));
      fetchData();
    } catch (error) {
      console.error('Error closing shift:', error);
      toast.error(t('error'));
    }
  };

  const getShiftDuration = (openTime: string, closeTime: string | null) => {
    const start = new Date(openTime);
    const end = closeTime ? new Date(closeTime) : new Date();
    const minutes = differenceInMinutes(end, start);
    return formatDuration(minutes);
  };

  const getDifferenceDisplay = (difference: number | null) => {
    if (difference === null) return '-';
    if (difference > 0) {
      return (
        <span className="flex items-center gap-1 text-success">
          <TrendingUp className="h-4 w-4" />
          +{formatILS(difference)} ({t('surplus')})
        </span>
      );
    } else if (difference < 0) {
      return (
        <span className="flex items-center gap-1 text-destructive">
          <TrendingDown className="h-4 w-4" />
          {formatILS(difference)} ({t('shortage')})
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-muted-foreground">
        <Minus className="h-4 w-4" />
        {t('balanced')}
      </span>
    );
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
          <h1 className="text-2xl font-bold text-foreground">{t('shifts')}</h1>
          <p className="text-muted-foreground">إدارة الورديات وتتبع النقد</p>
        </div>
      </div>

      {/* Current Shift Card */}
      <Card className={cn(
        'border-2 transition-all',
        currentShift ? 'border-success bg-success/5' : 'border-dashed border-muted-foreground/30'
      )}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t('currentShift')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {currentShift ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-lg bg-muted/50 p-4 text-center">
                  <p className="text-sm text-muted-foreground">{t('openTime')}</p>
                  <p className="text-lg font-bold text-foreground">
                    {format(new Date(currentShift.open_time), 'HH:mm', { locale: ar })}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 p-4 text-center">
                  <p className="text-sm text-muted-foreground">{t('shiftDuration')}</p>
                  <p className="text-lg font-bold text-foreground">
                    {getShiftDuration(currentShift.open_time, null)}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 p-4 text-center">
                  <p className="text-sm text-muted-foreground">{t('openingCash')}</p>
                  <p className="text-lg font-bold text-foreground">
                    {formatILS(currentShift.opening_cash_ils)}
                  </p>
                </div>
                <div className="rounded-lg bg-primary/10 p-4 text-center">
                  <p className="text-sm text-muted-foreground">{t('expectedCash')}</p>
                  <p className="text-lg font-bold text-primary">
                    {formatILS(shiftStats.expectedCash)}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-center justify-between rounded-lg bg-success/10 p-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-success" />
                    <span className="text-muted-foreground">{t('cashIn')}</span>
                  </div>
                  <span className="font-bold text-success">{formatILS(shiftStats.cashIn)}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-destructive/10 p-4">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-5 w-5 text-destructive" />
                    <span className="text-muted-foreground">{t('cashOut')}</span>
                  </div>
                  <span className="font-bold text-destructive">{formatILS(shiftStats.cashOut)}</span>
                </div>
              </div>

              <Button 
                onClick={() => setIsCloseDialogOpen(true)} 
                variant="destructive" 
                className="w-full gap-2"
              >
                <Square className="h-4 w-4" />
                {t('closeShift')}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="rounded-full bg-muted p-4">
                <Clock className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">{t('noOpenShift')}</p>
              <Button onClick={() => setIsOpenDialogOpen(true)} className="gap-2">
                <Play className="h-4 w-4" />
                {t('openShift')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Shift History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {t('shiftHistory')}
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
          {shiftHistory.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <Clock className="h-8 w-8" />
              <p>{t('noShifts')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('employee')}</TableHead>
                    <TableHead>{t('openTime')}</TableHead>
                    <TableHead>{t('closeTime')}</TableHead>
                    <TableHead>{t('shiftDuration')}</TableHead>
                    <TableHead>{t('openingCash')}</TableHead>
                    <TableHead>{t('expectedCash')}</TableHead>
                    <TableHead>{t('closingCash')}</TableHead>
                    <TableHead>{t('difference')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shiftHistory.map((shift) => (
                    <TableRow key={shift.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                            {profilesMap[shift.employee_id]?.charAt(0) || '?'}
                          </div>
                          <span>{profilesMap[shift.employee_id] || 'غير معروف'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{format(new Date(shift.open_time), 'yyyy/MM/dd', { locale: ar })}</div>
                          <div className="text-muted-foreground">
                            {format(new Date(shift.open_time), 'HH:mm', { locale: ar })}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {shift.close_time && (
                          <div className="text-sm">
                            <div>{format(new Date(shift.close_time), 'yyyy/MM/dd', { locale: ar })}</div>
                            <div className="text-muted-foreground">
                              {format(new Date(shift.close_time), 'HH:mm', { locale: ar })}
                            </div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {getShiftDuration(shift.open_time, shift.close_time)}
                      </TableCell>
                      <TableCell>{formatILS(shift.opening_cash_ils)}</TableCell>
                      <TableCell>{shift.expected_cash_ils !== null ? formatILS(shift.expected_cash_ils) : '-'}</TableCell>
                      <TableCell>{shift.closing_cash_ils !== null ? formatILS(shift.closing_cash_ils) : '-'}</TableCell>
                      <TableCell>{getDifferenceDisplay(shift.difference_ils)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Open Shift Dialog */}
      <Dialog open={isOpenDialogOpen} onOpenChange={setIsOpenDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="h-5 w-5 text-success" />
              {t('openShift')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="openingCash">{t('openingCash')}</Label>
              <div className="relative">
                <DollarSign className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="openingCash"
                  type="number"
                  step="0.01"
                  min="0"
                  value={openingCash}
                  onChange={(e) => setOpeningCash(e.target.value)}
                  placeholder="0.00"
                  className="pr-10 text-left"
                  dir="ltr"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                أدخل المبلغ النقدي الموجود في الدرج عند بداية الوردية
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsOpenDialogOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={handleOpenShift} disabled={!openingCash}>
              {t('openShift')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Shift Dialog */}
      <Dialog open={isCloseDialogOpen} onOpenChange={setIsCloseDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Square className="h-5 w-5 text-destructive" />
              {t('closeShift')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Shift Summary */}
            <div className="space-y-3 rounded-lg bg-muted/50 p-4">
              <h4 className="font-medium">{t('shiftSummary')}</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('openingCash')}</span>
                  <span>{formatILS(currentShift?.opening_cash_ils || 0)}</span>
                </div>
                <div className="flex justify-between text-success">
                  <span>+ {t('cashIn')}</span>
                  <span>{formatILS(shiftStats.cashIn)}</span>
                </div>
                <div className="flex justify-between text-destructive">
                  <span>- {t('cashOut')}</span>
                  <span>{formatILS(shiftStats.cashOut)}</span>
                </div>
                <div className="border-t pt-2">
                  <div className="flex justify-between font-bold">
                    <span>{t('expectedCash')}</span>
                    <span className="text-primary">{formatILS(shiftStats.expectedCash)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="closingCash">{t('actualCash')}</Label>
              <div className="relative">
                <DollarSign className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="closingCash"
                  type="number"
                  step="0.01"
                  min="0"
                  value={closingCash}
                  onChange={(e) => setClosingCash(e.target.value)}
                  placeholder="0.00"
                  className="pr-10 text-left"
                  dir="ltr"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                أدخل المبلغ النقدي الفعلي الموجود في الدرج الآن
              </p>
            </div>

            {/* Show difference preview */}
            {closingCash && !isNaN(parseFloat(closingCash)) && (
              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('difference')}</span>
                  {getDifferenceDisplay(parseFloat(closingCash) - shiftStats.expectedCash)}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsCloseDialogOpen(false)}>
              {t('cancel')}
            </Button>
            <Button variant="destructive" onClick={handleCloseShift} disabled={!closingCash}>
              {t('closeShift')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
