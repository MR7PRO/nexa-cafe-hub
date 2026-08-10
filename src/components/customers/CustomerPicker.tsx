import { useState } from 'react';
import { Search, User, Wallet, X, UserPlus, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useCustomerSearch, useFindOrCreateCustomer, type CustomerSummary } from '@/hooks/useCustomers';

interface CustomerPickerProps {
  value: CustomerSummary | null;
  onChange: (customer: CustomerSummary | null) => void;
  /** Optional label; picking a customer is never required. */
  label?: string;
  placeholder?: string;
  className?: string;
  /** Allow creating a new customer inline (de-duplicated by phone server-side). */
  allowCreate?: boolean;
}

/**
 * Shared customer lookup used by reservations, sessions and the POS.
 * Always optional — walk-in sales never require a customer.
 */
export function CustomerPicker({
  value,
  onChange,
  label,
  placeholder = 'ابحث بالاسم أو رقم الهاتف',
  className,
  allowCreate = true,
}: CustomerPickerProps) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [creating, setCreating] = useState(false);

  const { data: results = [], isLoading } = useCustomerSearch(term, open);
  const findOrCreate = useFindOrCreateCustomer();

  const pick = (customer: CustomerSummary) => {
    onChange(customer);
    setOpen(false);
    setTerm('');
    setCreating(false);
  };

  const handleCreate = async () => {
    if (!newName.trim() && !newPhone.trim()) return;
    try {
      const id = await findOrCreate.mutateAsync({ name: newName.trim(), phone: newPhone.trim() });
      pick({
        id,
        name: newName.trim() || newPhone.trim(),
        phone: newPhone.trim() || null,
        remaining_minutes: 0,
        primary_balance_id: null,
      });
      setNewName('');
      setNewPhone('');
    } catch {
      /* toast handled in mutation */
    }
  };

  return (
    <div className={cn('space-y-2', className)}>
      {label && <Label className="text-sm">{label}</Label>}

      {value ? (
        <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-medium text-foreground">
              <User className="h-4 w-4 text-primary" />
              <span className="truncate">{value.name}</span>
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {value.phone && (
                <span className="flex items-center gap-1" dir="ltr">
                  <Phone className="h-3 w-3" />
                  {value.phone}
                </span>
              )}
              {value.remaining_minutes > 0 && (
                <span className="flex items-center gap-1 text-accent">
                  <Wallet className="h-3 w-3" />
                  رصيد {value.remaining_minutes} دقيقة
                </span>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => onChange(null)} title="إزالة الزبون">
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-start gap-2">
              <Search className="h-4 w-4" />
              {placeholder}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[320px] p-3" dir="rtl">
            {creating ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">اسم الزبون</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">رقم الهاتف</Label>
                  <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} dir="ltr" />
                </div>
                <p className="text-xs text-muted-foreground">
                  إذا كان الرقم مسجلاً مسبقاً سيتم استخدام نفس الزبون بدون تكرار.
                </p>
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={handleCreate}
                    disabled={findOrCreate.isPending || (!newName.trim() && !newPhone.trim())}
                  >
                    حفظ واختيار
                  </Button>
                  <Button variant="ghost" onClick={() => setCreating(false)}>
                    رجوع
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  autoFocus
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder={placeholder}
                />
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {isLoading && <p className="p-2 text-sm text-muted-foreground">جاري البحث...</p>}
                  {!isLoading && results.length === 0 && (
                    <p className="p-2 text-sm text-muted-foreground">لا يوجد زبائن مطابقون</p>
                  )}
                  {results.map((customer) => (
                    <button
                      key={customer.id}
                      onClick={() => pick(customer)}
                      className="flex w-full items-center justify-between rounded-lg p-2 text-right hover:bg-muted"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {customer.name}
                        </span>
                        {customer.phone && (
                          <span className="block text-xs text-muted-foreground" dir="ltr">
                            {customer.phone}
                          </span>
                        )}
                      </span>
                      {customer.remaining_minutes > 0 && (
                        <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent">
                          {customer.remaining_minutes} د
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                {allowCreate && (
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => {
                      setCreating(true);
                      setNewName(term);
                    }}
                  >
                    <UserPlus className="h-4 w-4" />
                    زبون جديد
                  </Button>
                )}
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
