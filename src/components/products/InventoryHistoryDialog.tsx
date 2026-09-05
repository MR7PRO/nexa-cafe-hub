import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatILS } from '@/lib/i18n';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useInventoryHistory, movementLabel } from '@/hooks/useInventory';

interface InventoryHistoryDialogProps {
  product: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InventoryHistoryDialog({
  product,
  open,
  onOpenChange,
}: InventoryHistoryDialogProps) {
  const history = useInventoryHistory(product?.id ?? null);

  useEffect(() => {
    if (open && product) history.fetchPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product?.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>سجل حركة المخزون</DialogTitle>
          <DialogDescription>
            {product?.name} — {history.total} حركة
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto pt-2">
          {history.loading && <p className="text-muted-foreground">جارٍ التحميل...</p>}
          {history.error && <p className="text-destructive">{history.error}</p>}
          {!history.loading && history.movements.length === 0 && (
            <p className="text-muted-foreground">لا توجد حركات مسجلة</p>
          )}
          {history.movements.map((m) => (
            <div key={m.id} className="rounded-lg border border-border bg-muted/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{movementLabel(m.movement_type)}</Badge>
                  <span
                    className={
                      m.quantity_change >= 0
                        ? 'font-mono font-bold text-success'
                        : 'font-mono font-bold text-destructive'
                    }
                    dir="ltr"
                  >
                    {m.quantity_change > 0 ? `+${m.quantity_change}` : m.quantity_change}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                    {m.quantity_before ?? '-'} → {m.quantity_after ?? '-'}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground" dir="ltr">
                  {new Date(m.created_at).toLocaleString('ar-EG')}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                {m.performed_by_name && <span>بواسطة: {m.performed_by_name}</span>}
                {m.supplier && <span>المورد: {m.supplier}</span>}
                {m.unit_cost_ils !== null && <span>التكلفة: {formatILS(m.unit_cost_ils)}</span>}
                {m.reason && <span>السبب: {m.reason}</span>}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={history.page === 0 || history.loading}
            onClick={() => history.fetchPage(history.page - 1)}
          >
            السابق
          </Button>
          <span className="text-sm text-muted-foreground">
            صفحة {history.page + 1} من {history.pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={history.page + 1 >= history.pageCount || history.loading}
            onClick={() => history.fetchPage(history.page + 1)}
          >
            التالي
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
