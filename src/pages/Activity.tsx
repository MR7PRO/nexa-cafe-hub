import { useEffect, useMemo, useState } from 'react';
import { ScrollText, Search, ChevronRight, ChevronLeft, ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { canViewAudit } from '@/lib/permissions';
import { useAuditEvents, auditActionLabel, AUDIT_ACTION_LABELS } from '@/hooks/useAuditEvents';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatILS } from '@/lib/i18n';

const PAGE_SIZE = 25;
const ALL = '__all__';

const MONEY_KEYS = ['amount_ils', 'total_ils', 'refund_amount_ils', 'expected_cash_ils', 'closing_cash_ils'];

function describe(metadata: Record<string, unknown> | null): string {
  if (!metadata) return '-';
  const parts: string[] = [];
  if (metadata.ticket_no) parts.push(`فاتورة ${metadata.ticket_no}`);
  if (metadata.title) parts.push(String(metadata.title));
  if (metadata.key) parts.push(String(metadata.key));
  if (metadata.role) parts.push(`صلاحية: ${metadata.role}`);
  for (const k of MONEY_KEYS) {
    const v = metadata[k];
    if (v !== undefined && v !== null && Number(v) > 0) parts.push(formatILS(Number(v)));
  }
  if (metadata.reason) parts.push(`السبب: ${metadata.reason}`);
  if (!parts.length) return Object.keys(metadata).length ? JSON.stringify(metadata) : '-';
  return parts.join(' • ');
}

function actionVariant(action: string) {
  if (action.includes('void') || action.includes('refund')) return 'bg-destructive/15 text-destructive border-destructive/30';
  if (action.includes('paid') || action.includes('settled')) return 'bg-success/15 text-success border-success/30';
  if (action.includes('role') || action.includes('setting')) return 'bg-warning/15 text-warning border-warning/30';
  return 'bg-muted text-muted-foreground border-border';
}

export default function Activity() {
  const { role } = useAuth();
  const allowed = canViewAudit(role);

  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [actor, setActor] = useState(ALL);
  const [action, setAction] = useState(ALL);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [staff, setStaff] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (!allowed) return;
    supabase
      .from('profiles')
      .select('id, name')
      .order('name')
      .then(({ data }) => setStaff(data ?? []));
  }, [allowed]);

  // Debounce free-text search so typing doesn't hammer the RPC.
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 400);
    return () => clearTimeout(id);
  }, [searchInput]);

  const { data, isLoading, error } = useAuditEvents(
    {
      start: start || undefined,
      end: end || undefined,
      actor: actor === ALL ? undefined : actor,
      action: action === ALL ? undefined : action,
      search: search || undefined,
      page,
      pageSize: PAGE_SIZE,
    },
    allowed
  );

  const events = data?.events ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  const actionOptions = useMemo(() => Object.keys(AUDIT_ACTION_LABELS), []);

  if (!allowed) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
        <ShieldAlert className="h-10 w-10 text-warning" />
        <h1 className="text-xl font-bold">سجل الحركات</h1>
        <p className="text-muted-foreground">هذه الصفحة تتطلب صلاحية مدير</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <ScrollText className="h-6 w-6 text-primary" />
          سجل الحركات المالية
        </h1>
        <p className="text-muted-foreground">تتبع الفواتير المدفوعة والإلغاءات والاسترداد والورديات والإعدادات</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">تصفية</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1">
            <Label className="text-xs">من تاريخ</Label>
            <Input type="date" value={start} onChange={(e) => { setStart(e.target.value); setPage(0); }} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">إلى تاريخ</Label>
            <Input type="date" value={end} onChange={(e) => { setEnd(e.target.value); setPage(0); }} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">الموظف</Label>
            <Select value={actor} onValueChange={(v) => { setActor(v); setPage(0); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>الكل</SelectItem>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">نوع الحركة</Label>
            <Select value={action} onValueChange={(v) => { setAction(v); setPage(0); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>الكل</SelectItem>
                {actionOptions.map((a) => (
                  <SelectItem key={a} value={a}>{auditActionLabel(a)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">بحث (رقم فاتورة / مرجع)</Label>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pr-9"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="بحث..."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">
            {total} حركة
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage((p) => Math.max(p - 1, 0))}
              disabled={page === 0 || isLoading}
              aria-label="الصفحة السابقة"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">{page + 1} / {pageCount}</span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage((p) => (p + 1 < pageCount ? p + 1 : p))}
              disabled={page + 1 >= pageCount || isLoading}
              aria-label="الصفحة التالية"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="py-8 text-center text-destructive">{(error as Error).message}</p>
          ) : isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : events.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">لا توجد حركات مطابقة</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>الحركة</TableHead>
                    <TableHead>الموظف</TableHead>
                    <TableHead>التفاصيل</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((ev) => (
                    <TableRow key={ev.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        <div>{format(new Date(ev.created_at), 'yyyy/MM/dd')}</div>
                        <div className="text-muted-foreground">{format(new Date(ev.created_at), 'HH:mm')}</div>
                      </TableCell>
                      <TableCell>
                        <Badge className={actionVariant(ev.action)}>{auditActionLabel(ev.action)}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{ev.actor_name || 'النظام'}</TableCell>
                      <TableCell className="max-w-[420px] truncate text-sm text-muted-foreground" title={describe(ev.metadata)}>
                        {describe(ev.metadata)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
