import { useEffect, useState } from 'react';
import { Plus, Search, Users, Package, Clock, CreditCard, Phone, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { t, formatILS } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatCard } from '@/components/ui/stat-card';
import { canManageCatalog } from '@/lib/permissions';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  created_at: string;
}

interface LoyaltyPackage {
  id: string;
  name: string;
  hours_included: number;
  bonus_hours: number;
  price_ils: number;
  is_active: boolean;
}

interface CustomerBalance {
  id: string;
  customer_id: string;
  package_id: string;
  remaining_minutes: number;
  total_minutes: number;
  purchased_at: string;
  loyalty_packages?: { name: string };
}

export default function Loyalty() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [packages, setPackages] = useState<LoyaltyPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Customer dialog
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', notes: '' });

  // Package dialog
  const [packageDialogOpen, setPackageDialogOpen] = useState(false);
  const [newPackage, setNewPackage] = useState({
    name: '', hours_included: 10, bonus_hours: 1, price_ils: 0,
  });

  // Sell package dialog
  const [sellDialogOpen, setSellDialogOpen] = useState(false);
  const [sellCustomerId, setSellCustomerId] = useState('');
  const [sellPackageId, setSellPackageId] = useState('');

  // Customer detail
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerBalances, setCustomerBalances] = useState<CustomerBalance[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);

  const { toast } = useToast();
  const { user, role } = useAuth();
  const canManage = canManageCatalog(role);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [custRes, pkgRes] = await Promise.all([
      supabase.from('customers').select('*').order('created_at', { ascending: false }),
      supabase.from('loyalty_packages').select('*').order('created_at', { ascending: false }),
    ]);
    if (custRes.data) setCustomers(custRes.data);
    if (pkgRes.data) setPackages(pkgRes.data);
    setLoading(false);
  };

  const handleAddCustomer = async () => {
    if (!newCustomer.name.trim()) {
      toast({ title: t('error'), description: 'يرجى إدخال اسم الزبون', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('customers').insert({
      name: newCustomer.name,
      phone: newCustomer.phone || null,
      notes: newCustomer.notes || null,
      created_by: user?.id,
    });
    if (error) {
      toast({ title: t('error'), description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'تمت الإضافة', description: 'تم إضافة الزبون بنجاح' });
      setCustomerDialogOpen(false);
      setNewCustomer({ name: '', phone: '', notes: '' });
      fetchData();
    }
  };

  const handleAddPackage = async () => {
    if (!newPackage.name.trim() || !newPackage.price_ils) {
      toast({ title: t('error'), description: 'يرجى ملء جميع الحقول', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('loyalty_packages').insert({
      name: newPackage.name,
      hours_included: newPackage.hours_included,
      bonus_hours: newPackage.bonus_hours,
      price_ils: newPackage.price_ils,
    });
    if (error) {
      toast({ title: t('error'), description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'تمت الإضافة', description: 'تم إضافة الباقة بنجاح' });
      setPackageDialogOpen(false);
      setNewPackage({ name: '', hours_included: 10, bonus_hours: 1, price_ils: 0 });
      fetchData();
    }
  };

  const handleSellPackage = async () => {
    if (!sellCustomerId || !sellPackageId) {
      toast({ title: t('error'), description: 'يرجى اختيار الزبون والباقة', variant: 'destructive' });
      return;
    }
    const pkg = packages.find(p => p.id === sellPackageId);
    if (!pkg) return;

    const totalMinutes = (pkg.hours_included + pkg.bonus_hours) * 60;

    const { error } = await supabase.from('customer_balances').insert({
      customer_id: sellCustomerId,
      package_id: sellPackageId,
      remaining_minutes: totalMinutes,
      total_minutes: totalMinutes,
      sold_by: user?.id,
    });
    if (error) {
      toast({ title: t('error'), description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'تم البيع', description: `تم بيع باقة "${pkg.name}" بنجاح` });
      setSellDialogOpen(false);
      setSellCustomerId('');
      setSellPackageId('');
    }
  };

  const openCustomerDetail = async (customer: Customer) => {
    setSelectedCustomer(customer);
    const { data } = await supabase
      .from('customer_balances')
      .select('*, loyalty_packages(name)')
      .eq('customer_id', customer.id)
      .order('purchased_at', { ascending: false });
    setCustomerBalances(data || []);
    setDetailOpen(true);
  };

  const filteredCustomers = customers.filter(c => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.phone?.includes(q);
  });

  const activePackages = packages.filter(p => p.is_active);

  const totalCustomers = customers.length;
  const totalActiveBalances = customerBalances.filter(b => b.remaining_minutes > 0).length;

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">نظام الولاء</h1>
          <p className="mt-1 text-muted-foreground">إدارة الزبائن والباقات المدفوعة مسبقاً</p>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => setSellDialogOpen(true)} className="gap-2">
            <CreditCard className="h-4 w-4" />
            بيع باقة
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          title="إجمالي الزبائن"
          value={totalCustomers.toString()}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          title="الباقات المتوفرة"
          value={activePackages.length.toString()}
          icon={<Package className="h-5 w-5" />}
        />
        <StatCard
          title="الباقات النشطة"
          value={activePackages.length.toString()}
          icon={<Clock className="h-5 w-5" />}
        />
      </div>

      <Tabs defaultValue="customers" dir="rtl">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="customers">الزبائن</TabsTrigger>
          <TabsTrigger value="packages">الباقات</TabsTrigger>
        </TabsList>

        {/* Customers Tab */}
        <TabsContent value="customers" className="space-y-4">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم أو رقم الهاتف..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
              />
            </div>
            <Button onClick={() => setCustomerDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              إضافة زبون
            </Button>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الاسم</TableHead>
                  <TableHead className="text-right">الهاتف</TableHead>
                  <TableHead className="text-right">تاريخ التسجيل</TableHead>
                  <TableHead className="text-right">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                      <Users className="mx-auto mb-2 h-8 w-8 opacity-50" />
                      لا يوجد زبائن
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCustomers.map((customer) => (
                    <TableRow key={customer.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openCustomerDetail(customer)}>
                      <TableCell className="font-medium">{customer.name}</TableCell>
                      <TableCell dir="ltr" className="text-right font-mono">{customer.phone || '-'}</TableCell>
                      <TableCell>{new Date(customer.created_at).toLocaleDateString('ar-EG')}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSellCustomerId(customer.id); setSellDialogOpen(true); }}>
                          بيع باقة
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Packages Tab */}
        <TabsContent value="packages" className="space-y-4">
          <div className="flex justify-end">
            {canManage && (
              <Button onClick={() => setPackageDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                إضافة باقة
              </Button>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {packages.map((pkg) => (
              <div key={pkg.id} className="rounded-xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-foreground">{pkg.name}</h3>
                  <Badge variant={pkg.is_active ? 'default' : 'secondary'}>
                    {pkg.is_active ? 'نشطة' : 'غير نشطة'}
                  </Badge>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">الساعات المشمولة</span>
                    <span className="font-medium">{pkg.hours_included} ساعة</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ساعات مجانية</span>
                    <span className="font-medium text-primary">{pkg.bonus_hours} ساعة</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">الإجمالي</span>
                    <span className="font-bold">{pkg.hours_included + pkg.bonus_hours} ساعة</span>
                  </div>
                </div>
                <div className="border-t border-border pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">السعر</span>
                    <span className="text-xl font-bold text-primary">{formatILS(pkg.price_ils)}</span>
                  </div>
                </div>
              </div>
            ))}
            {packages.length === 0 && (
              <div className="col-span-full rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
                <Package className="mx-auto mb-3 h-10 w-10 opacity-50" />
                <p>لا توجد باقات بعد</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Add Customer Dialog */}
      <Dialog open={customerDialogOpen} onOpenChange={setCustomerDialogOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة زبون جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>اسم الزبون *</Label>
              <div className="relative mt-1">
                <User className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={newCustomer.name} onChange={(e) => setNewCustomer(p => ({ ...p, name: e.target.value }))} className="pr-10" placeholder="أدخل اسم الزبون" />
              </div>
            </div>
            <div>
              <Label>رقم الهاتف</Label>
              <div className="relative mt-1">
                <Phone className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={newCustomer.phone} onChange={(e) => setNewCustomer(p => ({ ...p, phone: e.target.value }))} className="pr-10" placeholder="05x-xxx-xxxx" dir="ltr" />
              </div>
            </div>
            <div>
              <Label>ملاحظات</Label>
              <Input value={newCustomer.notes} onChange={(e) => setNewCustomer(p => ({ ...p, notes: e.target.value }))} className="mt-1" placeholder="ملاحظات إضافية" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomerDialogOpen(false)}>{t('cancel')}</Button>
            <Button onClick={handleAddCustomer}>{t('add')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Package Dialog */}
      <Dialog open={packageDialogOpen} onOpenChange={setPackageDialogOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة باقة جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>اسم الباقة *</Label>
              <Input value={newPackage.name} onChange={(e) => setNewPackage(p => ({ ...p, name: e.target.value }))} className="mt-1" placeholder="مثلاً: باقة 10 ساعات" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>الساعات المشمولة *</Label>
                <Input type="number" min={1} value={newPackage.hours_included} onChange={(e) => setNewPackage(p => ({ ...p, hours_included: +e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>ساعات مجانية</Label>
                <Input type="number" min={0} value={newPackage.bonus_hours} onChange={(e) => setNewPackage(p => ({ ...p, bonus_hours: +e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>السعر (₪) *</Label>
              <Input type="number" min={0} step="0.5" value={newPackage.price_ils} onChange={(e) => setNewPackage(p => ({ ...p, price_ils: +e.target.value }))} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPackageDialogOpen(false)}>{t('cancel')}</Button>
            <Button onClick={handleAddPackage}>{t('add')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sell Package Dialog */}
      <Dialog open={sellDialogOpen} onOpenChange={setSellDialogOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>بيع باقة لزبون</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>الزبون *</Label>
              <Select value={sellCustomerId} onValueChange={setSellCustomerId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="اختر الزبون" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الباقة *</Label>
              <Select value={sellPackageId} onValueChange={setSellPackageId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="اختر الباقة" />
                </SelectTrigger>
                <SelectContent>
                  {activePackages.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} - {p.hours_included + p.bonus_hours} ساعة - {formatILS(p.price_ils)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {sellPackageId && (() => {
              const pkg = packages.find(p => p.id === sellPackageId);
              if (!pkg) return null;
              return (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
                  <h4 className="font-bold text-primary">{pkg.name}</h4>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span>الساعات</span>
                      <span>{pkg.hours_included} + {pkg.bonus_hours} مجانية = {pkg.hours_included + pkg.bonus_hours} ساعة</span>
                    </div>
                    <div className="flex justify-between font-bold">
                      <span>السعر</span>
                      <span>{formatILS(pkg.price_ils)}</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSellDialogOpen(false)}>{t('cancel')}</Button>
            <Button onClick={handleSellPackage}>تأكيد البيع</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Customer Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {selectedCustomer?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedCustomer && (
            <div className="space-y-4">
              <div className="flex gap-4 text-sm">
                {selectedCustomer.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    <span dir="ltr">{selectedCustomer.phone}</span>
                  </div>
                )}
              </div>

              <div>
                <h4 className="font-bold mb-3">الباقات المشتراة</h4>
                {customerBalances.length === 0 ? (
                  <p className="text-muted-foreground text-sm">لا توجد باقات مشتراة</p>
                ) : (
                  <div className="space-y-3">
                    {customerBalances.map(bal => {
                      const usedPercent = ((bal.total_minutes - bal.remaining_minutes) / bal.total_minutes) * 100;
                      const remainingHours = Math.floor(bal.remaining_minutes / 60);
                      const remainingMins = bal.remaining_minutes % 60;
                      return (
                        <div key={bal.id} className="rounded-lg border border-border p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{bal.loyalty_packages?.name || 'باقة'}</span>
                            <Badge variant={bal.remaining_minutes > 0 ? 'default' : 'secondary'}>
                              {bal.remaining_minutes > 0 ? 'نشطة' : 'منتهية'}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            المتبقي: {remainingHours} ساعة {remainingMins > 0 ? `و ${remainingMins} دقيقة` : ''}
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${100 - usedPercent}%` }} />
                          </div>
                          <div className="text-xs text-muted-foreground">
                            تاريخ الشراء: {new Date(bal.purchased_at).toLocaleDateString('ar-EG')}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
