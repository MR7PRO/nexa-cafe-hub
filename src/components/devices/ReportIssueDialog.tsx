import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ISSUE_TYPE_LABELS, type MaintenanceIssueType } from '@/hooks/useMaintenance';

interface ReportIssueDialogProps {
  open: boolean;
  deviceName?: string;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (issueType: MaintenanceIssueType, description: string) => void;
}

export function ReportIssueDialog({
  open,
  deviceName,
  submitting,
  onClose,
  onSubmit,
}: ReportIssueDialogProps) {
  const [issueType, setIssueType] = useState<MaintenanceIssueType>('hardware');
  const [description, setDescription] = useState('');

  const handleSubmit = () => {
    onSubmit(issueType, description.trim());
    setIssueType('hardware');
    setDescription('');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>تسجيل عطل{deviceName ? ` — ${deviceName}` : ''}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>نوع العطل</Label>
            <Select value={issueType} onValueChange={(v: MaintenanceIssueType) => setIssueType(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ISSUE_TYPE_LABELS) as MaintenanceIssueType[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {ISSUE_TYPE_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>وصف مختصر (اختياري)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="مثال: الدراع الثاني لا يعمل"
              rows={3}
            />
          </div>
          <Button className="w-full touch-target" onClick={handleSubmit} disabled={submitting}>
            تسجيل العطل
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
