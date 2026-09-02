import { useEffect, useState, useRef } from 'react';
import { Search, Filter, Printer, RotateCcw, Eye, X, Calendar, Receipt } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { t, formatILS } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
import { canRefundTicket } from '@/lib/permissions';
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';

interface TicketItem {
  id: string;
  name: string;
  qty: number;
  unit_price_ils: number;
  total_ils: number;
  item_type: 'session' | 'product';
}

interface Ticket {
  id: string;
  ticket_no: string;
  status: 'open' | 'paid' | 'void';
  total_ils: number;
  discount_ils: number;
  created_at: string;
  closed_at: string | null;
  created_by: string | null;
  profiles?: { name: string } | null;
  ticket_items?: TicketItem[];
  payments?: { method: string; amount_ils: number }[];
}

type StatusFilter = 'all' | 'open' | 'paid' | 'void';

export default function Tickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  // Detail dialog
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  
  // Refund dialog
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundTicket, setRefundTicket] = useState<Ticket | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundPin, setRefundPin] = useState('');
  const [refundProcessing, setRefundProcessing] = useState(false);
  
  // Print ref
  const printRef = useRef<HTMLDivElement>(null);
  
  const { toast } = useToast();
  const { user, role } = useAuth();
  const canRefund = canRefundTicket(role);

  useEffect(() => {
    fetchTickets();
  }, [statusFilter, dateFrom, dateTo]);

  const fetchTickets = async () => {
    setLoading(true);
    
    let query = supabase
      .from('tickets')
      .select(`
        *,
        ticket_items(*),
        payments(*)
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }

    if (dateTo) {
      query = query.lte('created_at', `${dateTo}T23:59:59`);
    }

    const { data, error } = await query;

    if (data) {
      // Fetch profiles separately for created_by users
      const userIds = [...new Set(data.map(t => t.created_by).filter(Boolean))];
      let profilesMap: Record<string, { name: string }> = {};
      
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, name')
          .in('id', userIds);
        
        if (profiles) {
          profiles.forEach((p: any) => {
            profilesMap[p.id] = { name: p.name };
          });
        }
      }

      const ticketsWithProfiles = data.map((t: any) => ({
        ...t,
        profiles: t.created_by ? profilesMap[t.created_by] : null,
      }));

      setTickets(ticketsWithProfiles as Ticket[]);
    }
    if (error) {
      console.error('Error fetching tickets:', error);
    }
    
    setLoading(false);
  };

  const filteredTickets = tickets.filter((ticket) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      ticket.ticket_no.toLowerCase().includes(query) ||
      ticket.profiles?.name?.toLowerCase().includes(query)
    );
  });

  const openDetail = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setDetailOpen(true);
  };

  const handlePrint = (ticket: Ticket) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({ title: t('error'), description: 'تعذر فتح نافذة الطباعة', variant: 'destructive' });
      return;
    }

    const receiptHTML = generateReceiptHTML(ticket);
    printWindow.document.write(receiptHTML);
    printWindow.document.close();
    printWindow.print();
  };

  const generateReceiptHTML = (ticket: Ticket) => {
    const items = ticket.ticket_items || [];
    const itemsHTML = items.map(item => `
      <tr>
        <td style="text-align: right; padding: 4px 0;">${item.name}</td>
        <td style="text-align: center; padding: 4px 8px;">${item.qty}</td>
        <td style="text-align: left; padding: 4px 0; font-family: monospace;">${item.total_ils.toFixed(2)} ₪</td>
      </tr>
    `).join('');

    return `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>فاتورة ${ticket.ticket_no}</title>
        <style>
          body {
            font-family: 'Arial', sans-serif;
            max-width: 300px;
            margin: 0 auto;
            padding: 20px;
            font-size: 14px;
          }
          .header {
            text-align: center;
            margin-bottom: 20px;
          }
          .header h1 {
            font-size: 24px;
            margin: 0;
          }
          .header p {
            color: #666;
            margin: 4px 0;
          }
          .divider {
            border-top: 1px dashed #ccc;
            margin: 12px 0;
          }
          .info {
            display: flex;
            justify-content: space-between;
            margin: 8px 0;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          .total {
            font-size: 18px;
            font-weight: bold;
            text-align: center;
            margin-top: 16px;
            padding: 12px;
            background: #f0f0f0;
            border-radius: 8px;
          }
          .footer {
            text-align: center;
            margin-top: 20px;
            color: #666;
            font-size: 12px;
          }
          @media print {
            body { margin: 0; padding: 10px; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>نيكسا كافيه</h1>
          <p>نظام إدارة المقهى</p>
        </div>
        
        <div class="divider"></div>
        
        <div class="info">
          <span>رقم الفاتورة:</span>
          <span style="font-family: monospace;">${ticket.ticket_no}</span>
        </div>
        <div class="info">
          <span>التاريخ:</span>
          <span>${new Date(ticket.created_at).toLocaleDateString('ar-EG')}</span>
        </div>
        <div class="info">
          <span>الوقت:</span>
          <span>${new Date(ticket.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        
        <div class="divider"></div>
        
        <table>
          <thead>
            <tr>
              <th style="text-align: right;">الصنف</th>
              <th style="text-align: center;">الكمية</th>
              <th style="text-align: left;">السعر</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>
        
        <div class="divider"></div>
        
        ${ticket.discount_ils > 0 ? `
          <div class="info">
            <span>الخصم:</span>
            <span style="font-family: monospace; color: #e74c3c;">-${ticket.discount_ils.toFixed(2)} ₪</span>
          </div>
        ` : ''}
        
        <div class="total">
          الإجمالي: ${ticket.total_ils.toFixed(2)} ₪
        </div>
        
        <div class="footer">
          <p>شكراً لزيارتكم</p>
          <p>نتمنى لكم وقتاً ممتعاً</p>
        </div>
      </body>
      </html>
    `;
  };

  const openRefund = (ticket: Ticket) => {
    if (!canRefund) {
      toast({ title: t('error'), description: 'ليس لديك صلاحية الاسترداد', variant: 'destructive' });
      return;
    }
    if (ticket.status !== 'paid') {
      toast({ title: t('error'), description: 'لا يمكن استرداد فاتورة غير مدفوعة', variant: 'destructive' });
      return;
    }
    setRefundTicket(ticket);
    setRefundReason('');
    setRefundPin('');
    setRefundOpen(true);
  };

  const processRefund = async () => {
    if (!refundTicket) return;
    
    // Validate PIN (simple validation - in production use proper hash comparison)
    if (refundPin.length !== 4) {
      toast({ title: t('error'), description: 'يرجى إدخال رمز PIN صحيح', variant: 'destructive' });
      return;
    }
    
    if (!refundReason.trim()) {
      toast({ title: t('error'), description: 'يرجى إدخال سبب الاسترداد', variant: 'destructive' });
      return;
    }
    
    setRefundProcessing(true);

    try {
      // Update ticket status to void
      const { error: ticketError } = await supabase
        .from('tickets')
        .update({ status: 'void' })
        .eq('id', refundTicket.id);

      if (ticketError) throw ticketError;

      // Create audit log
      const { error: auditError } = await supabase.from('audit_logs').insert({
        user_id: user?.id,
        action: 'refund',
        entity: 'tickets',
        entity_id: refundTicket.id,
        details_json: {
          ticket_no: refundTicket.ticket_no,
          amount: refundTicket.total_ils,
          reason: refundReason,
        },
      });

      if (auditError) console.error('Audit log error:', auditError);

      toast({
        title: 'تم الاسترداد',
        description: `تم استرداد الفاتورة ${refundTicket.ticket_no}`,
      });

      setRefundOpen(false);
      setRefundTicket(null);
      fetchTickets();
    } catch (error: any) {
      toast({
        title: t('error'),
        description: error.message,
        variant: 'destructive',
      });
    }

    setRefundProcessing(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-success/20 text-success border-success/30">مدفوعة</Badge>;
      case 'open':
        return <Badge className="bg-warning/20 text-warning border-warning/30">مفتوحة</Badge>;
      case 'void':
        return <Badge className="bg-destructive/20 text-destructive border-destructive/30">ملغاة</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
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
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">{t('tickets')}</h1>
        <p className="mt-1 text-muted-foreground">سجل الفواتير والمعاملات</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 rounded-xl border border-border bg-card p-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="بحث برقم الفاتورة أو اسم الموظف..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-10"
          />
        </div>

        {/* Status Filter */}
        <Select value={statusFilter} onValueChange={(v: StatusFilter) => setStatusFilter(v)}>
          <SelectTrigger className="w-[160px]">
            <Filter className="ml-2 h-4 w-4" />
            <SelectValue placeholder="الحالة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="paid">مدفوعة</SelectItem>
            <SelectItem value="open">مفتوحة</SelectItem>
            <SelectItem value="void">ملغاة</SelectItem>
          </SelectContent>
        </Select>

        {/* Date From */}
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-[160px]"
            dir="ltr"
          />
        </div>

        {/* Date To */}
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">إلى</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-[160px]"
            dir="ltr"
          />
        </div>

        {/* Clear Filters */}
        {(searchQuery || statusFilter !== 'all' || dateFrom || dateTo) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('all');
              setDateFrom('');
              setDateTo('');
            }}
            className="gap-2"
          >
            <X className="h-4 w-4" />
            مسح الفلاتر
          </Button>
        )}
      </div>

      {/* Tickets Table */}
      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">رقم الفاتورة</TableHead>
              <TableHead className="text-right">التاريخ</TableHead>
              <TableHead className="text-right">الموظف</TableHead>
              <TableHead className="text-right">الإجمالي</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              <TableHead className="text-right">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTickets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  <Receipt className="mx-auto mb-2 h-8 w-8 opacity-50" />
                  لا توجد فواتير
                </TableCell>
              </TableRow>
            ) : (
              filteredTickets.map((ticket) => (
                <TableRow key={ticket.id}>
                  <TableCell className="font-mono font-medium">{ticket.ticket_no}</TableCell>
                  <TableCell>
                    <div>
                      <div>{new Date(ticket.created_at).toLocaleDateString('ar-EG')}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(ticket.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{ticket.profiles?.name || '-'}</TableCell>
                  <TableCell className="font-mono font-bold text-primary">
                    {formatILS(ticket.total_ils)}
                  </TableCell>
                  <TableCell>{getStatusBadge(ticket.status)}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openDetail(ticket)}
                        title="عرض التفاصيل"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handlePrint(ticket)}
                        title="طباعة"
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                      {canRefund && ticket.status === 'paid' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openRefund(ticket)}
                          title="استرداد"
                          className="text-destructive hover:text-destructive"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              تفاصيل الفاتورة
            </DialogTitle>
          </DialogHeader>
          {selectedTicket && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/50 p-4">
                <div>
                  <p className="text-sm text-muted-foreground">رقم الفاتورة</p>
                  <p className="font-mono font-medium">{selectedTicket.ticket_no}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">الحالة</p>
                  {getStatusBadge(selectedTicket.status)}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">التاريخ</p>
                  <p>{new Date(selectedTicket.created_at).toLocaleDateString('ar-EG')}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">الوقت</p>
                  <p>{new Date(selectedTicket.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>

              {/* Items */}
              <div>
                <h4 className="mb-2 font-semibold">العناصر</h4>
                <div className="space-y-2">
                  {selectedTicket.ticket_items?.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-lg bg-muted/30 p-3">
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatILS(item.unit_price_ils)} × {item.qty}
                        </p>
                      </div>
                      <p className="font-mono font-bold">{formatILS(item.total_ils)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="border-t border-border pt-4">
                {selectedTicket.discount_ils > 0 && (
                  <div className="flex justify-between text-sm">
                    <span>الخصم</span>
                    <span className="text-destructive">-{formatILS(selectedTicket.discount_ils)}</span>
                  </div>
                )}
                <div className="mt-2 flex justify-between text-lg font-bold">
                  <span>الإجمالي</span>
                  <span className="font-mono text-primary">{formatILS(selectedTicket.total_ils)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button onClick={() => handlePrint(selectedTicket)} className="flex-1 gap-2">
                  <Printer className="h-4 w-4" />
                  طباعة
                </Button>
                {canRefund && selectedTicket.status === 'paid' && (
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setDetailOpen(false);
                      openRefund(selectedTicket);
                    }}
                    className="gap-2"
                  >
                    <RotateCcw className="h-4 w-4" />
                    استرداد
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Refund Dialog */}
      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <RotateCcw className="h-5 w-5" />
              استرداد الفاتورة
            </DialogTitle>
            <DialogDescription>
              هذا الإجراء سيلغي الفاتورة ويسجل في سجل المراجعة
            </DialogDescription>
          </DialogHeader>
          
          {refundTicket && (
            <div className="space-y-4">
              {/* Ticket Info */}
              <div className="rounded-lg bg-destructive/10 p-4">
                <p className="text-sm text-muted-foreground">الفاتورة</p>
                <p className="font-mono font-bold">{refundTicket.ticket_no}</p>
                <p className="mt-1 text-lg font-bold text-destructive">
                  {formatILS(refundTicket.total_ils)}
                </p>
              </div>

              {/* Reason */}
              <div className="space-y-2">
                <Label>سبب الاسترداد *</Label>
                <Textarea
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="يرجى كتابة سبب الاسترداد..."
                  rows={3}
                />
              </div>

              {/* PIN */}
              <div className="space-y-2">
                <Label>رمز PIN للتأكيد *</Label>
                <div className="flex justify-center" dir="ltr">
                  <InputOTP
                    maxLength={4}
                    value={refundPin}
                    onChange={setRefundPin}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  أدخل رمز PIN المكون من 4 أرقام
                </p>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setRefundOpen(false)}>
                  إلغاء
                </Button>
                <Button
                  variant="destructive"
                  onClick={processRefund}
                  disabled={refundProcessing || refundPin.length !== 4 || !refundReason.trim()}
                  className="gap-2"
                >
                  {refundProcessing ? 'جاري المعالجة...' : 'تأكيد الاسترداد'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
