import { useEffect, useState } from 'react';
import { format, addDays, isSameDay, parseISO } from 'date-fns';
import { ar } from 'date-fns/locale';
import { CalendarDays, Plus, Phone, User, Clock, Monitor, Gamepad2, X, Check, Trash2, ChevronRight, ChevronLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { t, formatILS } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface Device {
  id: string;
  name: string;
  type: 'playstation' | 'pc';
  location: string | null;
}

interface Reservation {
  id: string;
  device_id: string;
  customer_name: string;
  customer_phone: string | null;
  reserved_date: string;
  start_time: string;
  end_time: string;
  notes: string | null;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  created_at: string;
  device?: Device;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
  confirmed: 'bg-green-500/20 text-green-500 border-green-500/30',
  cancelled: 'bg-red-500/20 text-red-500 border-red-500/30',
  completed: 'bg-blue-500/20 text-blue-500 border-blue-500/30',
};

const statusLabels: Record<string, string> = {
  pending: 'قيد الانتظار',
  confirmed: 'مؤكد',
  cancelled: 'ملغي',
  completed: 'مكتمل',
};

export default function Reservations() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  // Form state
  const [formDeviceId, setFormDeviceId] = useState('');
  const [formCustomerName, setFormCustomerName] = useState('');
  const [formCustomerPhone, setFormCustomerPhone] = useState('');
  const [formStartTime, setFormStartTime] = useState('14:00');
  const [formEndTime, setFormEndTime] = useState('16:00');
  const [formNotes, setFormNotes] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (devices.length > 0) {
      fetchReservations();
    }
  }, [selectedDate, devices]);

  const fetchData = async () => {
    const { data: devicesData } = await supabase
      .from('devices')
      .select('*')
      .eq('is_active', true)
      .order('name');
    
    if (devicesData) {
      setDevices(devicesData);
    }
    setLoading(false);
  };

  const fetchReservations = async () => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const { data } = await supabase
      .from('reservations')
      .select('*')
      .eq('reserved_date', dateStr)
      .neq('status', 'cancelled')
      .order('start_time');
    
    if (data) {
      setReservations(data as Reservation[]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDeviceId || !formCustomerName || !formStartTime || !formEndTime) {
      toast({ title: t('error'), description: 'يرجى ملء جميع الحقول المطلوبة', variant: 'destructive' });
      return;
    }

    setFormSubmitting(true);

    try {
      const { error } = await supabase.from('reservations').insert({
        device_id: formDeviceId,
        customer_name: formCustomerName,
        customer_phone: formCustomerPhone || null,
        reserved_date: format(selectedDate, 'yyyy-MM-dd'),
        start_time: formStartTime,
        end_time: formEndTime,
        notes: formNotes || null,
        status: 'confirmed',
        created_by: user?.id,
      });

      if (error) throw error;

      toast({ title: 'تم الحجز بنجاح', description: `تم حجز الجهاز لـ ${formCustomerName}` });
      setDialogOpen(false);
      resetForm();
      fetchReservations();
    } catch (error: any) {
      toast({ title: t('error'), description: error.message, variant: 'destructive' });
    }

    setFormSubmitting(false);
  };

  const resetForm = () => {
    setFormDeviceId('');
    setFormCustomerName('');
    setFormCustomerPhone('');
    setFormStartTime('14:00');
    setFormEndTime('16:00');
    setFormNotes('');
  };

  const updateReservationStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from('reservations')
      .update({ status })
      .eq('id', id);

    if (error) {
      toast({ title: t('error'), description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'تم التحديث', description: `تم تغيير حالة الحجز إلى ${statusLabels[status]}` });
      fetchReservations();
    }
  };

  const deleteReservation = async (id: string) => {
    const { error } = await supabase.from('reservations').delete().eq('id', id);

    if (error) {
      toast({ title: t('error'), description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'تم الحذف', description: 'تم حذف الحجز بنجاح' });
      fetchReservations();
    }
  };

  // Generate week days
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i - 1));

  const getDeviceReservations = (deviceId: string) => {
    return reservations.filter(r => r.device_id === deviceId);
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <CalendarDays className="h-7 w-7 text-primary" />
            الحجوزات
          </h1>
          <p className="text-muted-foreground">إدارة حجوزات الأجهزة مسبقاً</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-5 w-5" />
              حجز جديد
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>حجز جهاز جديد</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>الجهاز *</Label>
                <Select value={formDeviceId} onValueChange={setFormDeviceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الجهاز" />
                  </SelectTrigger>
                  <SelectContent>
                    {devices.map((device) => (
                      <SelectItem key={device.id} value={device.id}>
                        <span className="flex items-center gap-2">
                          {device.type === 'playstation' ? (
                            <Gamepad2 className="h-4 w-4" />
                          ) : (
                            <Monitor className="h-4 w-4" />
                          )}
                          {device.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>اسم الزبون *</Label>
                <div className="relative">
                  <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={formCustomerName}
                    onChange={(e) => setFormCustomerName(e.target.value)}
                    placeholder="أدخل اسم الزبون"
                    className="pr-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>رقم الهاتف</Label>
                <div className="relative">
                  <Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={formCustomerPhone}
                    onChange={(e) => setFormCustomerPhone(e.target.value)}
                    placeholder="05X XXX XXXX"
                    className="pr-10"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>من الساعة *</Label>
                  <Input
                    type="time"
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>إلى الساعة *</Label>
                  <Input
                    type="time"
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>ملاحظات</Label>
                <Textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="أي ملاحظات إضافية..."
                  rows={2}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="submit" className="flex-1" disabled={formSubmitting}>
                  {formSubmitting ? 'جاري الحفظ...' : 'تأكيد الحجز'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  إلغاء
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Date Selector */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSelectedDate(addDays(selectedDate, -1))}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
        
        {weekDays.map((date) => {
          const isSelected = isSameDay(date, selectedDate);
          const isToday = isSameDay(date, new Date());
          
          return (
            <button
              key={date.toISOString()}
              onClick={() => setSelectedDate(date)}
              className={cn(
                'flex flex-col items-center rounded-xl px-4 py-2 min-w-[70px] transition-all',
                isSelected
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card hover:bg-muted',
                isToday && !isSelected && 'border-2 border-primary'
              )}
            >
              <span className="text-xs opacity-70">
                {format(date, 'EEEE', { locale: ar })}
              </span>
              <span className="text-lg font-bold">
                {format(date, 'd')}
              </span>
              <span className="text-xs opacity-70">
                {format(date, 'MMM', { locale: ar })}
              </span>
            </button>
          );
        })}

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSelectedDate(addDays(selectedDate, 1))}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
      </div>

      {/* Timeline View */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          حجوزات يوم {format(selectedDate, 'EEEE d MMMM', { locale: ar })}
        </h2>

        {devices.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-muted-foreground">لا توجد أجهزة متاحة</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {devices.map((device) => {
              const deviceReservations = getDeviceReservations(device.id);
              
              return (
                <div
                  key={device.id}
                  className="rounded-xl border border-border bg-card overflow-hidden"
                >
                  {/* Device Header */}
                  <div className="flex items-center gap-3 border-b border-border bg-muted/30 px-4 py-3">
                    <div className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-xl',
                      device.type === 'playstation' 
                        ? 'bg-blue-500/20 text-blue-500' 
                        : 'bg-green-500/20 text-green-500'
                    )}>
                      {device.type === 'playstation' ? (
                        <Gamepad2 className="h-5 w-5" />
                      ) : (
                        <Monitor className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{device.name}</h3>
                      {device.location && (
                        <p className="text-xs text-muted-foreground">{device.location}</p>
                      )}
                    </div>
                  </div>

                  {/* Reservations List */}
                  <div className="p-3 space-y-2 min-h-[120px]">
                    {deviceReservations.length === 0 ? (
                      <div className="flex items-center justify-center h-[100px] text-sm text-muted-foreground">
                        لا توجد حجوزات
                      </div>
                    ) : (
                      deviceReservations.map((reservation) => (
                        <div
                          key={reservation.id}
                          className="rounded-lg bg-muted/50 p-3 space-y-2"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium text-foreground">{reservation.customer_name}</p>
                              <p className="text-sm text-primary font-mono">
                                {reservation.start_time.slice(0, 5)} - {reservation.end_time.slice(0, 5)}
                              </p>
                            </div>
                            <Badge className={cn('text-xs', statusColors[reservation.status])}>
                              {statusLabels[reservation.status]}
                            </Badge>
                          </div>
                          
                          {reservation.customer_phone && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {reservation.customer_phone}
                            </p>
                          )}
                          
                          {reservation.notes && (
                            <p className="text-xs text-muted-foreground">{reservation.notes}</p>
                          )}

                          {/* Actions */}
                          <div className="flex gap-1 pt-1">
                            {reservation.status === 'confirmed' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-blue-500 hover:text-blue-500"
                                onClick={() => updateReservationStatus(reservation.id, 'completed')}
                              >
                                <Check className="h-3 w-3 mr-1" />
                                اكتمل
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-red-500 hover:text-red-500"
                              onClick={() => updateReservationStatus(reservation.id, 'cancelled')}
                            >
                              <X className="h-3 w-3 mr-1" />
                              إلغاء
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
