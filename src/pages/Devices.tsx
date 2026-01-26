import { useEffect, useState } from 'react';
import { Plus, Monitor, Gamepad2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { t } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { DeviceCard } from '@/components/devices/DeviceCard';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Device {
  id: string;
  name: string;
  type: 'playstation' | 'pc';
  location: string | null;
  default_rate_plan_id: string | null;
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

export default function Devices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [sessions, setSessions] = useState<Record<string, Session>>({});
  const [ratePlans, setRatePlans] = useState<RatePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'playstation' | 'pc'>('all');
  
  // New device form
  const [newDevice, setNewDevice] = useState({
    name: '',
    type: 'playstation' as 'playstation' | 'pc',
    location: '',
    default_rate_plan_id: '',
  });
  
  const { toast } = useToast();
  const { user, role } = useAuth();

  useEffect(() => {
    fetchData();
    
    const channel = supabase
      .channel('devices-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () => {
        fetchSessions();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, () => {
        fetchDevices();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchData = async () => {
    await Promise.all([fetchDevices(), fetchSessions(), fetchRatePlans()]);
    setLoading(false);
  };

  const fetchDevices = async () => {
    const { data, error } = await supabase
      .from('devices')
      .select('*')
      .eq('is_active', true)
      .order('name');
    
    if (data) setDevices(data as Device[]);
    if (error) console.error('Error fetching devices:', error);
  };

  const fetchSessions = async () => {
    const { data, error } = await supabase
      .from('sessions')
      .select(`
        id,
        device_id,
        start_time,
        paused_seconds,
        pause_started_at,
        status,
        rate_plans!inner (
          name,
          price_per_hour_ils
        )
      `)
      .in('status', ['running', 'paused']);
    
    if (data) {
      const sessionMap: Record<string, Session> = {};
      data.forEach((s: any) => {
        sessionMap[s.device_id] = {
          ...s,
          rate_plan: s.rate_plans,
        };
      });
      setSessions(sessionMap);
    }
    if (error) console.error('Error fetching sessions:', error);
  };

  const fetchRatePlans = async () => {
    const { data, error } = await supabase
      .from('rate_plans')
      .select('id, name, price_per_hour_ils')
      .eq('is_active', true);
    
    if (data) setRatePlans(data);
    if (error) console.error('Error fetching rate plans:', error);
  };

  const handleAddDevice = async () => {
    if (!newDevice.name) {
      toast({ title: t('error'), description: 'يرجى إدخال اسم الجهاز', variant: 'destructive' });
      return;
    }

    const { error } = await supabase.from('devices').insert({
      name: newDevice.name,
      type: newDevice.type,
      location: newDevice.location || null,
      default_rate_plan_id: newDevice.default_rate_plan_id || null,
    });

    if (error) {
      toast({ title: t('error'), description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'تمت الإضافة', description: 'تم إضافة الجهاز بنجاح' });
      setDialogOpen(false);
      setNewDevice({ name: '', type: 'playstation', location: '', default_rate_plan_id: '' });
      fetchDevices();
    }
  };

  const handleStartSession = async (deviceId: string) => {
    const device = devices.find(d => d.id === deviceId);
    if (!device) return;

    const ratePlanId = device.default_rate_plan_id || ratePlans[0]?.id;

    if (!ratePlanId) {
      toast({ title: t('error'), description: 'لا توجد خطة تسعير', variant: 'destructive' });
      return;
    }

    const { error } = await supabase.from('sessions').insert({
      device_id: deviceId,
      rate_plan_id: ratePlanId,
      created_by: user?.id,
    });

    if (error) {
      toast({ title: t('error'), description: error.message, variant: 'destructive' });
    } else {
      toast({ title: t('sessionStarted'), description: device.name });
      fetchSessions();
    }
  };

  const handlePauseSession = async (deviceId: string) => {
    const session = sessions[deviceId];
    if (!session) return;

    const { error } = await supabase
      .from('sessions')
      .update({ 
        status: 'paused',
        pause_started_at: new Date().toISOString(),
      })
      .eq('id', session.id);

    if (error) {
      toast({ title: t('error'), description: error.message, variant: 'destructive' });
    } else {
      toast({ title: t('sessionPaused') });
      fetchSessions();
    }
  };

  const handleResumeSession = async (deviceId: string) => {
    const session = sessions[deviceId];
    if (!session || !session.pause_started_at) return;

    const pauseStart = new Date(session.pause_started_at).getTime();
    const additionalPaused = Math.floor((Date.now() - pauseStart) / 1000);

    const { error } = await supabase
      .from('sessions')
      .update({ 
        status: 'running',
        pause_started_at: null,
        paused_seconds: session.paused_seconds + additionalPaused,
      })
      .eq('id', session.id);

    if (error) {
      toast({ title: t('error'), description: error.message, variant: 'destructive' });
    } else {
      toast({ title: t('sessionResumed') });
      fetchSessions();
    }
  };

  const handleEndSession = async (deviceId: string) => {
    const session = sessions[deviceId];
    if (!session) return;

    let totalPaused = session.paused_seconds;
    if (session.status === 'paused' && session.pause_started_at) {
      const pauseStart = new Date(session.pause_started_at).getTime();
      totalPaused += Math.floor((Date.now() - pauseStart) / 1000);
    }

    const { error } = await supabase
      .from('sessions')
      .update({ 
        status: 'ended',
        end_time: new Date().toISOString(),
        paused_seconds: totalPaused,
        pause_started_at: null,
      })
      .eq('id', session.id);

    if (error) {
      toast({ title: t('error'), description: error.message, variant: 'destructive' });
    } else {
      toast({ title: t('sessionEnded') });
      fetchSessions();
    }
  };

  const filteredDevices = devices.filter(d => {
    if (filter === 'all') return true;
    return d.type === filter;
  });

  const canManageDevices = role === 'admin' || role === 'manager';

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
          <h1 className="text-3xl font-bold text-foreground">{t('deviceGrid')}</h1>
          <p className="mt-1 text-muted-foreground">
            {devices.length} جهاز • {Object.keys(sessions).length} نشط
          </p>
        </div>
        <div className="flex gap-3">
          {/* Filter */}
          <div className="flex gap-2 rounded-lg border border-border bg-card p-1">
            <button
              onClick={() => setFilter('all')}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                filter === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              الكل
            </button>
            <button
              onClick={() => setFilter('playstation')}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                filter === 'playstation' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Gamepad2 className="h-4 w-4" />
              PS
            </button>
            <button
              onClick={() => setFilter('pc')}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                filter === 'pc' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Monitor className="h-4 w-4" />
              PC
            </button>
          </div>

          {/* Add Device Button */}
          {canManageDevices && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  إضافة جهاز
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>إضافة جهاز جديد</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>اسم الجهاز</Label>
                    <Input
                      value={newDevice.name}
                      onChange={(e) => setNewDevice({ ...newDevice, name: e.target.value })}
                      placeholder="مثال: PS4"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>نوع الجهاز</Label>
                    <Select
                      value={newDevice.type}
                      onValueChange={(v: 'playstation' | 'pc') => setNewDevice({ ...newDevice, type: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="playstation">
                          <div className="flex items-center gap-2">
                            <Gamepad2 className="h-4 w-4" />
                            بلايستيشن
                          </div>
                        </SelectItem>
                        <SelectItem value="pc">
                          <div className="flex items-center gap-2">
                            <Monitor className="h-4 w-4" />
                            كمبيوتر
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>الموقع</Label>
                    <Input
                      value={newDevice.location}
                      onChange={(e) => setNewDevice({ ...newDevice, location: e.target.value })}
                      placeholder="مثال: الصالة الرئيسية"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>خطة التسعير الافتراضية</Label>
                    <Select
                      value={newDevice.default_rate_plan_id}
                      onValueChange={(v) => setNewDevice({ ...newDevice, default_rate_plan_id: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="اختر خطة التسعير" />
                      </SelectTrigger>
                      <SelectContent>
                        {ratePlans.map((plan) => (
                          <SelectItem key={plan.id} value={plan.id}>
                            {plan.name} - {plan.price_per_hour_ils} ₪/ساعة
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleAddDevice} className="w-full">
                    إضافة الجهاز
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Devices Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredDevices.map((device) => (
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

      {filteredDevices.length === 0 && (
        <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
          <Monitor className="h-16 w-16 text-muted-foreground/50" />
          <p className="mt-4 text-lg text-muted-foreground">لا توجد أجهزة</p>
          {canManageDevices && (
            <Button onClick={() => setDialogOpen(true)} className="mt-4 gap-2">
              <Plus className="h-4 w-4" />
              إضافة جهاز
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
