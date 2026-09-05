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

interface RestockDialogProps {
  product: { id: string; name: string; cost_price_ils: number | null } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

export function RestockDialog({ product, open, onOpenChange, onDone }: RestockDialogProps) {
  const { toast } = useToast();
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState('');
  const [supplier, setSupplier] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setQty('');
    setCost('');
    setSupplier('');
    setNote('');
  };

  const submit = async () => {
    const quantity = parseInt(qty, 10);
    if (!product || !quantity || quantity <= 0) {
      toast({ title: t('error'), description: 'أدخل كمية صحيحة', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc('restock_product', {
      p_product_id: product.id,
      p_quantity: quantity,
      p_unit_cost_ils: cost ? parseFloat(cost) : undefined,
      p_supplier: supplier || undefined,
      p_note: note || undefined,
    });
    setSaving(false);
    if (error) {
      toast({ title: t('error'), description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'تم التوريد', description: `تمت إضافة ${quantity} إلى ${product.name}` });
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
          <DialogTitle>توريد مخزون</DialogTitle>
          <DialogDescription>{product?.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>الكمية *</Label>
              <Input
                type="number"
                dir="ltr"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="24"
              />
            </div>
            <div className="space-y-2">
              <Label>سعر الشراء للوحدة (₪)</Label>
              <Input
                type="number"
                dir="ltr"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="2.50"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>المورد</Label>
            <Input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="اسم المورد أو رقم الفاتورة"
            />
          </div>
          <div className="space-y-2">
            <Label>ملاحظة</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="اختياري" />
          </div>
          <Button onClick={submit} disabled={saving} className="w-full">
            {saving ? '...' : 'تأكيد التوريد'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
