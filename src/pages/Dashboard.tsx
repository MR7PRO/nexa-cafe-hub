import { useEffect, useState } from 'react';
import { DollarSign, Monitor, Receipt, AlertTriangle, Plus, ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { t, formatILS } from '@/lib/i18n';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { DeviceCard } from '@/components/devices/DeviceCard';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

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

export default function Dashboard() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [sessions, setSessions] = useState<Record<string, Session>>({});
  const [ratePlans, setRatePlans] = useState<RatePlan[]>([]);
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [activeSessionCount, setActiveSessionCount] = useState(0);
  const [openTicketCount, setOpenTicketCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [loading, setLoading] = useState(true);
  
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    fetchData();
    
    // Subscribe to realtime updates
    const channel = supabase
      .channel('dashboard-changes')
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
    await Promise.all([
      fetchDevices(),
      fetchSessions(),
      fetchRatePlans(),
      fetchStats(),
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
      setActiveSessionCount(data.length);
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

  const fetchStats = async () => {
    // Today's revenue
    const today = new Date().toISOString().split('T')[0];
    const { data: ticketsData } = await supabase
      .from('tickets')
      .select('total_ils')
      .eq('status', 'paid')
      .gte('created_at', today);
    
    if (ticketsData) {
      const total = ticketsData.reduce((sum, t) => sum + Number(t.total_ils), 0);
      setTodayRevenue(total);
    }

    // Open tickets count
    const { count: openCount } = await supabase
      .from('tickets')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'open');
    
    if (openCount !== null) setOpenTicketCount(openCount);

    // Low stock count
    const { data: lowStockProducts } = await supabase
      .from('products')
      .select('id')
      .lt('stock_qty', 10)
      .eq('is_active', true);
    
    if (lowStockProducts) setLowStockCount(lowStockProducts.length);
  };

  const handleStartSession = async (deviceId: string) => {
    const device = devices.find(d => d.id === deviceId);
    if (!device) return;

    // Get default rate plan
    const { data: deviceData } = await supabase
      .from('devices')
      .select('default_rate_plan_id')
      .eq('id', deviceId)
      .single();

    const ratePlanId = deviceData?.default_rate_plan_id || ratePlans[0]?.id;

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

    // Calculate additional paused time
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
            <Link to="/pos">
              <ShoppingCart className="h-4 w-4" />
              {t('pos')}
            </Link>
          </Button>
          <Button asChild className="gap-2">
            <Link to="/devices">
              <Plus className="h-4 w-4" />
              جلسة جديدة
            </Link>
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
          <Link to="/devices" className="text-sm text-primary hover:underline">
            عرض الكل
          </Link>
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
    </div>
  );
}
