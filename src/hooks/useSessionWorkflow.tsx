import { useState } from 'react';
import { StartSessionDialog, type StartSessionPrefill } from '@/components/devices/StartSessionDialog';
import { TransferSessionDialog } from '@/components/devices/TransferSessionDialog';
import { ExtendTimerDialog } from '@/components/devices/ExtendTimerDialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  useSessionMutations,
  getElapsedMinutes,
  type ActiveSession,
  type SessionDevice,
  type SessionRatePlan,
  type StartSessionOptions,
} from '@/hooks/useSessions';

interface UseSessionWorkflowArgs {
  devices: SessionDevice[];
  sessions: Record<string, ActiveSession>;
  ratePlans: SessionRatePlan[];
}

/**
 * Shared session workflow (dialogs + actions) used by /devices, the dashboard
 * and reservations so a given action behaves identically everywhere.
 */
export function useSessionWorkflow({ devices, sessions, ratePlans }: UseSessionWorkflowArgs) {
  const { startSession, pauseSession, resumeSession, endSession, transferSession, extendTimer } =
    useSessionMutations();

  const [startDeviceId, setStartDeviceId] = useState<string | null>(null);
  const [startPrefill, setStartPrefill] = useState<StartSessionPrefill | null>(null);
  const [endDeviceId, setEndDeviceId] = useState<string | null>(null);
  const [transferDeviceId, setTransferDeviceId] = useState<string | null>(null);
  const [extendDeviceId, setExtendDeviceId] = useState<string | null>(null);

  const deviceById = (id: string | null) => devices.find((d) => d.id === id) || null;

  const openStart = (deviceId: string, prefill?: StartSessionPrefill | null) => {
    setStartPrefill(prefill || null);
    setStartDeviceId(deviceId);
  };
  const openEnd = (deviceId: string) => setEndDeviceId(deviceId);
  const openTransfer = (deviceId: string) => setTransferDeviceId(deviceId);
  const openExtendTimer = (deviceId: string) => setExtendDeviceId(deviceId);

  const pause = (deviceId: string) => {
    const session = sessions[deviceId];
    if (session) pauseSession.mutate(session.id);
  };

  const resume = (deviceId: string) => {
    const session = sessions[deviceId];
    if (session) resumeSession.mutate(session.id);
  };

  const handleStart = async (options: StartSessionOptions) => {
    if (!startDeviceId) return;
    try {
      await startSession.mutateAsync({ deviceId: startDeviceId, options });
      setStartDeviceId(null);
    } catch {
      /* toast handled in mutation */
    }
  };

  const handleConfirmEnd = async () => {
    const session = endDeviceId ? sessions[endDeviceId] : null;
    if (!session) return;
    try {
      await endSession.mutateAsync(session.id);
      setEndDeviceId(null);
    } catch {
      /* toast handled in mutation */
    }
  };

  const handleTransfer = async (targetDeviceId: string) => {
    const session = transferDeviceId ? sessions[transferDeviceId] : null;
    if (!session) return;
    try {
      await transferSession.mutateAsync({ sessionId: session.id, targetDeviceId });
      setTransferDeviceId(null);
    } catch {
      /* toast handled in mutation */
    }
  };

  const handleExtend = async (additionalMinutes: number) => {
    const session = extendDeviceId ? sessions[extendDeviceId] : null;
    if (!session || session.session_mode !== 'timer') return;
    try {
      await extendTimer.mutateAsync({
        sessionId: session.id,
        currentTimerMinutes: session.timer_minutes || 0,
        additionalMinutes,
      });
      setExtendDeviceId(null);
    } catch {
      /* toast handled in mutation */
    }
  };

  const dialogs = (
    <>
      <StartSessionDialog
        open={!!startDeviceId}
        onOpenChange={(open) => !open && setStartDeviceId(null)}
        device={deviceById(startDeviceId)}
        ratePlans={ratePlans}
        onStart={handleStart}
        isLoading={startSession.isPending}
      />

      <ConfirmDialog
        open={!!endDeviceId}
        onOpenChange={(open) => !open && setEndDeviceId(null)}
        title="إنهاء الجلسة"
        description={`هل أنت متأكد من إنهاء جلسة ${deviceById(endDeviceId)?.name || ''}؟ سيتم احتساب التكلفة النهائية.`}
        confirmText="إنهاء الجلسة"
        onConfirm={handleConfirmEnd}
        variant="destructive"
        isLoading={endSession.isPending}
      />

      <TransferSessionDialog
        open={!!transferDeviceId}
        onOpenChange={(open) => !open && setTransferDeviceId(null)}
        sourceDevice={deviceById(transferDeviceId)}
        availableDevices={devices.filter((d) => d.id !== transferDeviceId && !sessions[d.id])}
        onTransfer={handleTransfer}
        isLoading={transferSession.isPending}
      />

      <ExtendTimerDialog
        open={!!extendDeviceId}
        onOpenChange={(open) => !open && setExtendDeviceId(null)}
        deviceName={deviceById(extendDeviceId)?.name || ''}
        currentTimerMinutes={sessions[extendDeviceId || '']?.timer_minutes || 0}
        elapsedMinutes={getElapsedMinutes(sessions[extendDeviceId || ''])}
        onExtend={handleExtend}
        isLoading={extendTimer.isPending}
      />
    </>
  );

  return { openStart, openEnd, openTransfer, openExtendTimer, pause, resume, dialogs };
}
