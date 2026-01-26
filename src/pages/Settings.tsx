import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { t, formatILS } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DollarSign,
  Receipt,
  Users,
  Clock,
  Plus,
  Edit,
  Trash2,
  Save,
  Percent,
  Monitor,
  Gamepad2,
  MapPin,
} from 'lucide-react';
import type { Tables, Json } from '@/integrations/supabase/types';

type RatePlan = Tables<'rate_plans'>;
type UserRole = Tables<'user_roles'>;
type Profile = Tables<'profiles'>;
type Device = Tables<'devices'>;

interface DiscountSettings {
  max_discount_percent: number;
  require_pin_above: number;
}

interface ReceiptTemplate {
  header: string;
  footer: string;
  show_logo: boolean;
  show_cashier: boolean;
}

interface UserWithRole {
  id: string;
  name: string;
  role: 'admin' | 'manager' | 'cashier';
}

export default function Settings() {
  const { user, role } = useAuth();
  const { toast } = useToast();

  // Rate Plans
  const [ratePlans, setRatePlans] = useState<RatePlan[]>([]);
  const [showRatePlanDialog, setShowRatePlanDialog] = useState(false);
  const [editingRatePlan, setEditingRatePlan] = useState<RatePlan | null>(null);
  const [ratePlanForm, setRatePlanForm] = useState({
    name: '',
    price_per_hour_ils: '',
    min_charge_ils: '',
    rounding_minutes: '1',
  });

  // Discount Settings
  const [discountSettings, setDiscountSettings] = useState<DiscountSettings>({
    max_discount_percent: 20,
    require_pin_above: 10,
  });

  // Receipt Template
  const [receiptTemplate, setReceiptTemplate] = useState<ReceiptTemplate>({
    header: 'نيكسا كافيه',
    footer: 'شكراً لزيارتكم',
    show_logo: true,
    show_cashier: true,
  });

  // User Roles
  const [usersWithRoles, setUsersWithRoles] = useState<UserWithRole[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Devices
  const [devices, setDevices] = useState<Device[]>([]);
  const [showDeviceDialog, setShowDeviceDialog] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [deviceForm, setDeviceForm] = useState({
    name: '',
    type: 'playstation' as 'playstation' | 'pc',
    location: '',
    default_rate_plan_id: '',
  });

  // Deactivate device confirmation state
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [deviceToDeactivate, setDeviceToDeactivate] = useState<Device | null>(null);

  // Loading states
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (role === 'admin') {
      fetchData();
    }
  }, [role]);

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([
      fetchRatePlans(),
      fetchSettings(),
      fetchUsersWithRoles(),
      fetchDevices(),
    ]);
    setLoading(false);
  };

  const fetchRatePlans = async () => {
    const { data, error } = await supabase
      .from('rate_plans')
      .select('*')
      .order('name');

    if (data) setRatePlans(data);
    if (error) console.error('Error fetching rate plans:', error);
  };

  const fetchSettings = async () => {
    // Fetch discount settings
    const { data: discountData } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'discount_limits')
      .maybeSingle();

    if (discountData?.value) {
      setDiscountSettings(discountData.value as unknown as DiscountSettings);
    }

    // Fetch receipt template
    const { data: receiptData } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'receipt_template')
      .maybeSingle();

    if (receiptData?.value) {
      setReceiptTemplate(receiptData.value as unknown as ReceiptTemplate);
    }
  };

  const fetchDevices = async () => {
    const { data, error } = await supabase
      .from('devices')
      .select('*')
      .order('name');

    if (data) setDevices(data);
    if (error) console.error('Error fetching devices:', error);
  };

  const fetchUsersWithRoles = async () => {
    setLoadingUsers(true);
    
    // Fetch all profiles with their roles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, name');

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      setLoadingUsers(false);
      return;
    }

    // Fetch all roles
    const { data: roles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id, role');

    if (rolesError) {
      console.error('Error fetching roles:', rolesError);
      setLoadingUsers(false);
      return;
    }

    // Combine profiles with roles
    const usersMap = new Map<string, UserWithRole>();
    profiles?.forEach((profile) => {
      const userRole = roles?.find((r) => r.user_id === profile.id);
      usersMap.set(profile.id, {
        id: profile.id,
        name: profile.name,
        role: (userRole?.role as 'admin' | 'manager' | 'cashier') || 'cashier',
      });
    });

    setUsersWithRoles(Array.from(usersMap.values()));
    setLoadingUsers(false);
  };

  // Rate Plan handlers
  const handleSaveRatePlan = async () => {
    if (!ratePlanForm.name || !ratePlanForm.price_per_hour_ils) {
      toast({ title: t('error'), description: 'يرجى ملء جميع الحقول المطلوبة', variant: 'destructive' });
      return;
    }

    setSaving(true);

    const planData = {
      name: ratePlanForm.name,
      price_per_hour_ils: parseFloat(ratePlanForm.price_per_hour_ils),
      min_charge_ils: ratePlanForm.min_charge_ils ? parseFloat(ratePlanForm.min_charge_ils) : 0,
      rounding_minutes: parseInt(ratePlanForm.rounding_minutes) || 1,
    };

    if (editingRatePlan) {
      const { error } = await supabase
        .from('rate_plans')
        .update(planData)
        .eq('id', editingRatePlan.id);

      if (error) {
        toast({ title: t('error'), description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'تم تحديث خطة التسعير بنجاح' });
      }
    } else {
      const { error } = await supabase.from('rate_plans').insert(planData);

      if (error) {
        toast({ title: t('error'), description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'تم إضافة خطة التسعير بنجاح' });
      }
    }

    setSaving(false);
    setShowRatePlanDialog(false);
    setEditingRatePlan(null);
    setRatePlanForm({ name: '', price_per_hour_ils: '', min_charge_ils: '', rounding_minutes: '1' });
    fetchRatePlans();
  };

  const handleEditRatePlan = (plan: RatePlan) => {
    setEditingRatePlan(plan);
    setRatePlanForm({
      name: plan.name,
      price_per_hour_ils: plan.price_per_hour_ils.toString(),
      min_charge_ils: plan.min_charge_ils?.toString() || '',
      rounding_minutes: plan.rounding_minutes?.toString() || '1',
    });
    setShowRatePlanDialog(true);
  };

  const handleToggleRatePlan = async (plan: RatePlan) => {
    const { error } = await supabase
      .from('rate_plans')
      .update({ is_active: !plan.is_active })
      .eq('id', plan.id);

    if (error) {
      toast({ title: t('error'), description: error.message, variant: 'destructive' });
    } else {
      fetchRatePlans();
    }
  };

  // Settings handlers
  const handleSaveDiscountSettings = async () => {
    setSaving(true);

    const { error } = await supabase
      .from('settings')
      .update({
        value: discountSettings as unknown as Json,
        updated_at: new Date().toISOString(),
        updated_by: user?.id,
      })
      .eq('key', 'discount_limits');

    if (error) {
      toast({ title: t('error'), description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'تم حفظ إعدادات الخصم بنجاح' });
    }

    setSaving(false);
  };

  const handleSaveReceiptTemplate = async () => {
    setSaving(true);

    const { error } = await supabase
      .from('settings')
      .update({
        value: receiptTemplate as unknown as Json,
        updated_at: new Date().toISOString(),
        updated_by: user?.id,
      })
      .eq('key', 'receipt_template');

    if (error) {
      toast({ title: t('error'), description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'تم حفظ قالب الإيصال بنجاح' });
    }

    setSaving(false);
  };

  // User role handlers
  const handleUpdateUserRole = async (userId: string, newRole: 'admin' | 'manager' | 'cashier') => {
    // Prevent removing the last admin
    if (newRole !== 'admin') {
      const adminCount = usersWithRoles.filter((u) => u.role === 'admin').length;
      const isCurrentUserAdmin = usersWithRoles.find((u) => u.id === userId)?.role === 'admin';
      if (adminCount <= 1 && isCurrentUserAdmin) {
        toast({
          title: t('error'),
          description: 'لا يمكن إزالة آخر مدير',
          variant: 'destructive',
        });
        return;
      }
    }

    // Check if role exists, update or insert
    const { data: existingRole } = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    let error;
    if (existingRole) {
      ({ error } = await supabase
        .from('user_roles')
        .update({ role: newRole })
        .eq('user_id', userId));
    } else {
      ({ error } = await supabase.from('user_roles').insert({ user_id: userId, role: newRole }));
    }

    if (error) {
      toast({ title: t('error'), description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'تم تحديث صلاحية المستخدم بنجاح' });
      fetchUsersWithRoles();
    }
  };

  // Device handlers
  const handleSaveDevice = async () => {
    if (!deviceForm.name) {
      toast({ title: t('error'), description: 'يرجى إدخال اسم الجهاز', variant: 'destructive' });
      return;
    }

    setSaving(true);

    const deviceData = {
      name: deviceForm.name,
      type: deviceForm.type,
      location: deviceForm.location || null,
      default_rate_plan_id: deviceForm.default_rate_plan_id || null,
    };

    if (editingDevice) {
      const { error } = await supabase
        .from('devices')
        .update(deviceData)
        .eq('id', editingDevice.id);

      if (error) {
        toast({ title: t('error'), description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'تم تحديث الجهاز بنجاح' });
      }
    } else {
      const { error } = await supabase.from('devices').insert(deviceData);

      if (error) {
        toast({ title: t('error'), description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'تم إضافة الجهاز بنجاح' });
      }
    }

    setSaving(false);
    setShowDeviceDialog(false);
    setEditingDevice(null);
    setDeviceForm({ name: '', type: 'playstation', location: '', default_rate_plan_id: '' });
    fetchDevices();
  };

  const handleEditDevice = (device: Device) => {
    setEditingDevice(device);
    setDeviceForm({
      name: device.name,
      type: device.type,
      location: device.location || '',
      default_rate_plan_id: device.default_rate_plan_id || '',
    });
    setShowDeviceDialog(true);
  };

  const handleToggleDeviceClick = (device: Device) => {
    if (device.is_active) {
      // Show confirmation dialog before deactivating
      setDeviceToDeactivate(device);
      setDeactivateDialogOpen(true);
    } else {
      // Reactivating doesn't need confirmation
      handleToggleDevice(device);
    }
  };

  const handleToggleDevice = async (device: Device) => {
    const { error } = await supabase
      .from('devices')
      .update({ is_active: !device.is_active })
      .eq('id', device.id);

    if (error) {
      toast({ title: t('error'), description: error.message, variant: 'destructive' });
    } else {
      setDeactivateDialogOpen(false);
      setDeviceToDeactivate(null);
      fetchDevices();
    }
  };

  if (role !== 'admin') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-lg text-muted-foreground">
              هذه الصفحة متاحة للمديرين فقط
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t('settings')}</h1>
        <p className="text-muted-foreground">إدارة إعدادات النظام</p>
      </div>

      <Tabs defaultValue="rate-plans" className="space-y-6" dir="rtl">
        <TabsList className="grid w-full grid-cols-5 bg-card">
          <TabsTrigger value="rate-plans" className="gap-2">
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">خطط التسعير</span>
          </TabsTrigger>
          <TabsTrigger value="devices" className="gap-2">
            <Monitor className="h-4 w-4" />
            <span className="hidden sm:inline">الأجهزة</span>
          </TabsTrigger>
          <TabsTrigger value="discount" className="gap-2">
            <Percent className="h-4 w-4" />
            <span className="hidden sm:inline">حدود الخصم</span>
          </TabsTrigger>
          <TabsTrigger value="receipt" className="gap-2">
            <Receipt className="h-4 w-4" />
            <span className="hidden sm:inline">قالب الإيصال</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">صلاحيات المستخدمين</span>
          </TabsTrigger>
        </TabsList>

        {/* Rate Plans Tab */}
        <TabsContent value="rate-plans">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                خطط التسعير
              </CardTitle>
              <Dialog open={showRatePlanDialog} onOpenChange={setShowRatePlanDialog}>
                <DialogTrigger asChild>
                  <Button
                    onClick={() => {
                      setEditingRatePlan(null);
                      setRatePlanForm({ name: '', price_per_hour_ils: '', min_charge_ils: '', rounding_minutes: '1' });
                    }}
                  >
                    <Plus className="ml-2 h-4 w-4" />
                    إضافة خطة
                  </Button>
                </DialogTrigger>
                <DialogContent dir="rtl">
                  <DialogHeader>
                    <DialogTitle>{editingRatePlan ? 'تعديل خطة التسعير' : 'إضافة خطة تسعير'}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label>اسم الخطة</Label>
                      <Input
                        value={ratePlanForm.name}
                        onChange={(e) => setRatePlanForm({ ...ratePlanForm, name: e.target.value })}
                        placeholder="مثال: VIP"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>السعر بالساعة (₪)</Label>
                      <Input
                        type="number"
                        value={ratePlanForm.price_per_hour_ils}
                        onChange={(e) => setRatePlanForm({ ...ratePlanForm, price_per_hour_ils: e.target.value })}
                        placeholder="15"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>الحد الأدنى للتكلفة (₪)</Label>
                      <Input
                        type="number"
                        value={ratePlanForm.min_charge_ils}
                        onChange={(e) => setRatePlanForm({ ...ratePlanForm, min_charge_ils: e.target.value })}
                        placeholder="5"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>تقريب الوقت (دقائق)</Label>
                      <Select
                        value={ratePlanForm.rounding_minutes}
                        onValueChange={(value) => setRatePlanForm({ ...ratePlanForm, rounding_minutes: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 دقيقة</SelectItem>
                          <SelectItem value="5">5 دقائق</SelectItem>
                          <SelectItem value="10">10 دقائق</SelectItem>
                          <SelectItem value="15">15 دقيقة</SelectItem>
                          <SelectItem value="30">30 دقيقة</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={handleSaveRatePlan} className="w-full" disabled={saving}>
                      <Save className="ml-2 h-4 w-4" />
                      {saving ? 'جاري الحفظ...' : 'حفظ'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الاسم</TableHead>
                    <TableHead>السعر/ساعة</TableHead>
                    <TableHead>الحد الأدنى</TableHead>
                    <TableHead>التقريب</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ratePlans.map((plan) => (
                    <TableRow key={plan.id}>
                      <TableCell className="font-medium">{plan.name}</TableCell>
                      <TableCell>{formatILS(Number(plan.price_per_hour_ils))}</TableCell>
                      <TableCell>{formatILS(Number(plan.min_charge_ils || 0))}</TableCell>
                      <TableCell>{plan.rounding_minutes} دقيقة</TableCell>
                      <TableCell>
                        <Badge variant={plan.is_active ? 'default' : 'secondary'}>
                          {plan.is_active ? 'نشط' : 'غير نشط'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleEditRatePlan(plan)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Switch
                            checked={plan.is_active}
                            onCheckedChange={() => handleToggleRatePlan(plan)}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Devices Tab */}
        <TabsContent value="devices">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Monitor className="h-5 w-5 text-primary" />
                إدارة الأجهزة
              </CardTitle>
              <Dialog open={showDeviceDialog} onOpenChange={setShowDeviceDialog}>
                <DialogTrigger asChild>
                  <Button
                    onClick={() => {
                      setEditingDevice(null);
                      setDeviceForm({ name: '', type: 'playstation', location: '', default_rate_plan_id: '' });
                    }}
                  >
                    <Plus className="ml-2 h-4 w-4" />
                    إضافة جهاز
                  </Button>
                </DialogTrigger>
                <DialogContent dir="rtl">
                  <DialogHeader>
                    <DialogTitle>{editingDevice ? 'تعديل الجهاز' : 'إضافة جهاز'}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label>اسم الجهاز</Label>
                      <Input
                        value={deviceForm.name}
                        onChange={(e) => setDeviceForm({ ...deviceForm, name: e.target.value })}
                        placeholder="مثال: PS1"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>نوع الجهاز</Label>
                      <Select
                        value={deviceForm.type}
                        onValueChange={(value: 'playstation' | 'pc') => setDeviceForm({ ...deviceForm, type: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="playstation">
                            <div className="flex items-center gap-2">
                              <Gamepad2 className="h-4 w-4" />
                              PlayStation
                            </div>
                          </SelectItem>
                          <SelectItem value="pc">
                            <div className="flex items-center gap-2">
                              <Monitor className="h-4 w-4" />
                              PC
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>الموقع (اختياري)</Label>
                      <Input
                        value={deviceForm.location}
                        onChange={(e) => setDeviceForm({ ...deviceForm, location: e.target.value })}
                        placeholder="مثال: الطابق الأول"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>خطة التسعير الافتراضية</Label>
                      <Select
                        value={deviceForm.default_rate_plan_id}
                        onValueChange={(value) => setDeviceForm({ ...deviceForm, default_rate_plan_id: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="اختر خطة التسعير" />
                        </SelectTrigger>
                        <SelectContent>
                          {ratePlans.filter(p => p.is_active).map((plan) => (
                            <SelectItem key={plan.id} value={plan.id}>
                              {plan.name} - {formatILS(Number(plan.price_per_hour_ils))}/ساعة
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={handleSaveDevice} className="w-full" disabled={saving}>
                      <Save className="ml-2 h-4 w-4" />
                      {saving ? 'جاري الحفظ...' : 'حفظ'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الجهاز</TableHead>
                    <TableHead>النوع</TableHead>
                    <TableHead>الموقع</TableHead>
                    <TableHead>خطة التسعير</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {devices.map((device) => {
                    const ratePlan = ratePlans.find(p => p.id === device.default_rate_plan_id);
                    return (
                      <TableRow key={device.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {device.type === 'playstation' ? (
                              <Gamepad2 className="h-4 w-4 text-blue-500" />
                            ) : (
                              <Monitor className="h-4 w-4 text-green-500" />
                            )}
                            {device.name}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {device.type === 'playstation' ? 'PlayStation' : 'PC'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {device.location ? (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              {device.location}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {ratePlan ? (
                            <span>{ratePlan.name}</span>
                          ) : (
                            <span className="text-muted-foreground">غير محدد</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={device.is_active ? 'default' : 'secondary'}>
                            {device.is_active ? 'نشط' : 'غير نشط'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" onClick={() => handleEditDevice(device)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Switch
                              checked={device.is_active}
                              onCheckedChange={() => handleToggleDeviceClick(device)}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {devices.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        لا توجد أجهزة مسجلة. اضغط على "إضافة جهاز" للبدء.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Discount Settings Tab */}
        <TabsContent value="discount">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Percent className="h-5 w-5 text-primary" />
                حدود الخصم
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>الحد الأقصى للخصم (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={discountSettings.max_discount_percent}
                    onChange={(e) =>
                      setDiscountSettings({
                        ...discountSettings,
                        max_discount_percent: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    لا يمكن تطبيق خصم أعلى من هذه النسبة
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>طلب PIN للخصم فوق (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={discountSettings.require_pin_above}
                    onChange={(e) =>
                      setDiscountSettings({
                        ...discountSettings,
                        require_pin_above: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    يتطلب إدخال رمز PIN للمدير عند تطبيق خصم أعلى من هذه النسبة
                  </p>
                </div>
              </div>
              <Button onClick={handleSaveDiscountSettings} disabled={saving}>
                <Save className="ml-2 h-4 w-4" />
                {saving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Receipt Template Tab */}
        <TabsContent value="receipt">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" />
                قالب الإيصال
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>رأس الإيصال</Label>
                    <Input
                      value={receiptTemplate.header}
                      onChange={(e) =>
                        setReceiptTemplate({ ...receiptTemplate, header: e.target.value })
                      }
                      placeholder="نيكسا كافيه"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>تذييل الإيصال</Label>
                    <Input
                      value={receiptTemplate.footer}
                      onChange={(e) =>
                        setReceiptTemplate({ ...receiptTemplate, footer: e.target.value })
                      }
                      placeholder="شكراً لزيارتكم"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>إظهار الشعار</Label>
                    <Switch
                      checked={receiptTemplate.show_logo}
                      onCheckedChange={(checked) =>
                        setReceiptTemplate({ ...receiptTemplate, show_logo: checked })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>إظهار اسم الكاشير</Label>
                    <Switch
                      checked={receiptTemplate.show_cashier}
                      onCheckedChange={(checked) =>
                        setReceiptTemplate({ ...receiptTemplate, show_cashier: checked })
                      }
                    />
                  </div>
                </div>

                {/* Receipt Preview */}
                <div className="rounded-lg border bg-white p-6 text-center text-black">
                  <div className="space-y-2 border-b pb-4">
                    {receiptTemplate.show_logo && (
                      <div className="mx-auto h-12 w-12 rounded-full bg-primary/10" />
                    )}
                    <h3 className="text-lg font-bold">{receiptTemplate.header}</h3>
                  </div>
                  <div className="space-y-1 py-4 text-sm">
                    <p className="text-muted-foreground">رقم الفاتورة: #001</p>
                    <p className="text-muted-foreground">التاريخ: {new Date().toLocaleDateString('ar')}</p>
                    {receiptTemplate.show_cashier && (
                      <p className="text-muted-foreground">الكاشير: محمد</p>
                    )}
                  </div>
                  <div className="space-y-1 border-y py-4 text-sm">
                    <div className="flex justify-between">
                      <span>جلسة PS1</span>
                      <span>25.00 ₪</span>
                    </div>
                    <div className="flex justify-between">
                      <span>مشروب</span>
                      <span>5.00 ₪</span>
                    </div>
                  </div>
                  <div className="space-y-1 py-4">
                    <div className="flex justify-between font-bold">
                      <span>الإجمالي</span>
                      <span>30.00 ₪</span>
                    </div>
                  </div>
                  <p className="pt-4 text-sm text-muted-foreground">{receiptTemplate.footer}</p>
                </div>
              </div>
              <Button onClick={handleSaveReceiptTemplate} disabled={saving}>
                <Save className="ml-2 h-4 w-4" />
                {saving ? 'جاري الحفظ...' : 'حفظ القالب'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* User Roles Tab */}
        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                صلاحيات المستخدمين
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingUsers ? (
                <div className="flex justify-center py-8">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>المستخدم</TableHead>
                      <TableHead>الصلاحية الحالية</TableHead>
                      <TableHead>تغيير الصلاحية</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usersWithRoles.map((userItem) => (
                      <TableRow key={userItem.id}>
                        <TableCell className="font-medium">{userItem.name}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              userItem.role === 'admin'
                                ? 'default'
                                : userItem.role === 'manager'
                                ? 'secondary'
                                : 'outline'
                            }
                          >
                            {t(userItem.role)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={userItem.role}
                            onValueChange={(value) =>
                              handleUpdateUserRole(userItem.id, value as 'admin' | 'manager' | 'cashier')
                            }
                            disabled={userItem.id === user?.id}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">{t('admin')}</SelectItem>
                              <SelectItem value="manager">{t('manager')}</SelectItem>
                              <SelectItem value="cashier">{t('cashier')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <div className="mt-4 rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
                <p className="font-medium">معلومات الصلاحيات:</p>
                <ul className="mt-2 list-inside list-disc space-y-1">
                  <li><strong>{t('admin')}:</strong> صلاحية كاملة لجميع الإعدادات والتقارير</li>
                  <li><strong>{t('manager')}:</strong> إدارة الأجهزة والمنتجات والاسترجاع</li>
                  <li><strong>{t('cashier')}:</strong> البيع وإدارة الجلسات فقط</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Deactivate Device Confirmation Dialog */}
      <ConfirmDialog
        open={deactivateDialogOpen}
        onOpenChange={setDeactivateDialogOpen}
        title="تعطيل الجهاز"
        description={`هل أنت متأكد من تعطيل الجهاز "${deviceToDeactivate?.name || ''}"؟ لن يظهر في قائمة الأجهزة النشطة.`}
        confirmText="تعطيل"
        onConfirm={() => deviceToDeactivate && handleToggleDevice(deviceToDeactivate)}
        variant="destructive"
      />
    </div>
  );
}
