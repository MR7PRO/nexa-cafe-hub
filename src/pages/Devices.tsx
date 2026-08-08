import { useState, useCallback } from 'react';
import { Plus, Monitor, Gamepad2, Tv, Wallet } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { t } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { DeviceCard } from '@/components/devices/DeviceCard';
import { TVModeView } from '@/components/devices/TVModeView';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import {
  useDevicesQuery,
  useActiveSessionsQuery,
  useRatePlansQuery,
  useSessionRealtime,
  sessionKeys,
} from '@/hooks/useSessions';
import { useSessionWorkflow } from '@/hooks/useSessionWorkflow';
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

export default function Devices() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'playstation' | 'pc'>('all');
  const [tvMode, setTvMode] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  // New device form
  const [newDevice, setNewDevice] = useState({
    name: '',
    type: 'playstation' as 'playstation' | 'pc',
    location: '',
    default_rate_plan_id: '',
  });

  const { toast } = useToast();
  const { role } = useAuth();
  const queryClient = useQueryClient();

  const { data: devices = [], isLoading: devicesLoading } = useDevicesQuery();
  const { data: sessions = {}, isLoading: sessionsLoading } = useActiveSessionsQuery();
  const { data: ratePlans = [], isLoading: plansLoading } = useRatePlansQuery();

  useSessionRealtime();

  const workflow = useSessionWorkflow({ devices, sessions, ratePlans });

  const loading = devicesLoading || sessionsLoading || plansLoading;

  // Keyboard shortcut handlers
  const handleKeyboardStartSession = useCallback(() => {
    const targetDevice = selectedDeviceId
      ? devices.find(d => d.id === selectedDeviceId && !sessions[d.id])
      : devices.find(d => !sessions[d.id]);
    if (targetDevice) workflow.openStart(targetDevice.id);
  }, [devices, sessions, selectedDeviceId, workflow]);

  const handleKeyboardEndSession = useCallback(() => {
    const targetDevice = selectedDeviceId
      ? devices.find(d => d.id === selectedDeviceId && sessions[d.id])
      : devices.find(d => sessions[d.id]?.status === 'running' || sessions[d.id]?.status === 'paused');
    if (targetDevice) workflow.openEnd(targetDevice.id);
  }, [devices, sessions, selectedDeviceId, workflow]);

  const handleKeyboardPauseSession = useCallback(() => {
    const targetDevice = selectedDeviceId
      ? devices.find(d => d.id === selectedDeviceId && sessions[d.id]?.status === 'running')
      : devices.find(d => sessions[d.id]?.status === 'running');
    if (targetDevice) workflow.pause(targetDevice.id);
  }, [devices, sessions, selectedDeviceId, workflow]);

  useKeyboardShortcuts({
    onStartSession: handleKeyboardStartSession,
    onEndSession: handleKeyboardEndSession,
    onPauseSession: handleKeyboardPauseSession,
  });

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
      queryClient.invalidateQueries({ queryKey: sessionKeys.devices });
    }
  };

  const filteredDevices = devices.filter(d => {
    if (filter === 'all') return true;
    return d.type === filter;
  });

  const canManageDevices = role === 'admin' || role === 'manager' || role === 'super_admin';

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* TV Mode */}
      {tvMode && (
        <TVModeView
          devices={filteredDevices}
          sessions={sessions}
          onExit={() => setTvMode(false)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t('deviceGrid')}</h1>
          <p className="mt-1 text-muted-foreground">
            {devices.length} جهاز • {Object.keys(sessions).length} نشط
          </p>
        </div>
        <div className="flex gap-3">
          {/* TV Mode */}
          <Button variant="outline" className="gap-2" onClick={() => setTvMode(true)}>
            <Tv className="h-4 w-4" />
            وضع العرض
          </Button>
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
            onStart={() => workflow.openStart(device.id)}
            onPause={() => workflow.pause(device.id)}
            onResume={() => workflow.resume(device.id)}
            onEnd={() => workflow.openEnd(device.id)}
            onTransfer={() => workflow.openTransfer(device.id)}
            onExtendTimer={() => workflow.openExtendTimer(device.id)}
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

      {/* Ended sessions awaiting payment collection */}
      {pendingSettlements.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">جلسات بانتظار التحصيل</h2>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-sm text-primary">
              {pendingSettlements.length}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {pendingSettlements.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-xl bg-muted/50 p-3"
              >
                <div>
                  <p className="font-medium text-foreground">{s.device?.name || 'جهاز'}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.end_time ? new Date(s.end_time).toLocaleString('ar') : ''}
                  </p>
                </div>
                <Button size="sm" onClick={() => setSettleSessionId(s.id)}>
                  تحصيل
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shared session dialogs (start / end / transfer / extend) */}
      {workflow.dialogs}

      <SettleSessionDialog
        sessionId={settleSessionId}
        onOpenChange={(open) => !open && setSettleSessionId(null)}
      />
    </div>
  );
}
