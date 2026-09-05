import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { t } from '@/lib/i18n';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface StockAdjustDialogProps {
  product: { id: string; name: string; stock_qty: number | null } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

const TYPES = [
  { value: 'manual_adjustment', label: 'تعديل يدوي' },
  { value: 'damaged', label: 'تالف' },
  { value: 'expired', label: 'منتهي الصلاحية' },
];

export function StockAdjustDialog({
  product,
  open,
  onOpenChange,
  onDone,
}: StockAdjustDialogProps) {
  const { toast } = useToast();
  const [type, setType] = useState('manual_adjustment');
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setType('manual_adjustment');
    setDelta('');
    setReason('');
  };

  const submit = async () => {
    const change = parseInt(delta, 10);
    if (!product || !change || Number.isNaN(change)) {
      toast({ title: t('error'), description: 'أدخل قيمة تعديل صحيحة', variant: 'destructive' });
      return;
    }
    if (!reason.trim()) {
      toast({ title: t('error'), description: 'السبب مطلوب', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc('adjust_stock', {
      p_product_id: product.id,
      p_movement_type: type,
      p_quantity_change: change,
      p_reason: reason.trim(),
    });
    setSaving(false);
    if (error) {
      toast({ title: t('error'), description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'تم التعديل', description: `تم تحديث مخزون ${product.name}` });
    reset();
    onOpenChange(false);
    onDone();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تعديل المخزون</DialogTitle>
          <DialogDescription>
            {product?.name} — الكمية الحالية: {product?.stock_qty ?? '-'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>نوع التعديل</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>مقدار التغيير (سالب للنقص) *</Label>
            <Input
              type="number"
              dir="ltr"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              placeholder="-2"
            />
          </div>
          <div className="space-y-2">
            <Label>السبب *</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثال: كسر زجاجة"
            />
          </div>
          <Button onClick={submit} disabled={saving} className="w-full">
            {saving ? '...' : 'حفظ التعديل'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
