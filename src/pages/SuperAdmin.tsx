import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Building2, Users, Plus, Trash2, Eye, UserPlus, Shield, Coffee, Edit, Save, X,
} from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  created_at: string;
  admin_name: string;
  user_count: number;
}

interface TenantUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

const callManageUsers = async (body: Record<string, unknown>) => {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await supabase.functions.invoke('manage-users', {
    body,
    headers: { Authorization: `Bearer ${session?.access_token}` },
  });
  if (res.error) throw new Error(res.error.message);
  if (res.data?.error) throw new Error(res.data.error);
  return res.data;
};

export default function SuperAdmin() {
  const { isSuperAdmin, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);

  // Create Admin dialog
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [adminForm, setAdminForm] = useState({ email: '', password: '', name: '', cafe_name: '' });
  const [creating, setCreating] = useState(false);

  // Tenant users dialog
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Add employee dialog
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [employeeForm, setEmployeeForm] = useState({ email: '', password: '', name: '', role: 'cashier' as string });

  // Delete user confirmation
  const [userToDelete, setUserToDelete] = useState<TenantUser | null>(null);

  // Edit tenant name
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null);
  const [editTenantName, setEditTenantName] = useState('');

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callManageUsers({ action: 'list-tenants' });
      setTenants(data.tenants || []);
    } catch (err: any) {
      toast({ title: 'خطأ', description: err.message, variant: 'destructive' });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    if (isSuperAdmin) fetchTenants();
  }, [isSuperAdmin, fetchTenants]);

  const handleCreateAdmin = async () => {
    if (!adminForm.email || !adminForm.password || !adminForm.name || !adminForm.cafe_name) {
      toast({ title: 'خطأ', description: 'يرجى ملء جميع الحقول', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      await callManageUsers({
        action: 'create-user',
        email: adminForm.email,
        password: adminForm.password,
        name: adminForm.name,
        role: 'admin',
        cafe_name: adminForm.cafe_name,
      });
      toast({ title: 'تم إنشاء حساب المدير بنجاح' });
      setShowCreateAdmin(false);
      setAdminForm({ email: '', password: '', name: '', cafe_name: '' });
      fetchTenants();
    } catch (err: any) {
      toast({ title: 'خطأ', description: err.message, variant: 'destructive' });
    }
    setCreating(false);
  };

  const handleViewTenantUsers = async (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setLoadingUsers(true);
    try {
      const data = await callManageUsers({ action: 'list-tenant-users', tenant_id: tenant.id });
      setTenantUsers(data.users || []);
    } catch (err: any) {
      toast({ title: 'خطأ', description: err.message, variant: 'destructive' });
    }
    setLoadingUsers(false);
  };

  const handleAddEmployee = async () => {
    if (!employeeForm.email || !employeeForm.password || !employeeForm.name || !selectedTenant) {
      toast({ title: 'خطأ', description: 'يرجى ملء جميع الحقول', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      await callManageUsers({
        action: 'create-user',
        email: employeeForm.email,
        password: employeeForm.password,
        name: employeeForm.name,
        role: employeeForm.role,
        tenant_id: selectedTenant.id,
      });
      toast({ title: 'تم إضافة الموظف بنجاح' });
      setShowAddEmployee(false);
      setEmployeeForm({ email: '', password: '', name: '', role: 'cashier' });
      handleViewTenantUsers(selectedTenant);
      fetchTenants();
    } catch (err: any) {
      toast({ title: 'خطأ', description: err.message, variant: 'destructive' });
    }
    setCreating(false);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete || !selectedTenant) return;
    try {
      await callManageUsers({ action: 'delete-user', user_id: userToDelete.id });
      toast({ title: 'تم حذف المستخدم بنجاح' });
      setUserToDelete(null);
      handleViewTenantUsers(selectedTenant);
      fetchTenants();
    } catch (err: any) {
      toast({ title: 'خطأ', description: err.message, variant: 'destructive' });
    }
  };

  const handleUpdateTenantName = async (tenantId: string) => {
    if (!editTenantName.trim()) return;
    try {
      await callManageUsers({ action: 'update-tenant-name', tenant_id: tenantId, name: editTenantName });
      toast({ title: 'تم تحديث اسم المقهى' });
      setEditingTenantId(null);
      fetchTenants();
    } catch (err: any) {
      toast({ title: 'خطأ', description: err.message, variant: 'destructive' });
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  const roleLabel = (r: string) => {
    const map: Record<string, string> = { super_admin: 'مدير النظام', admin: 'مدير', manager: 'مشرف', cashier: 'كاشير' };
    return map[r] || r;
  };

  const roleBadgeVariant = (r: string) => {
    if (r === 'super_admin') return 'default' as const;
    if (r === 'admin') return 'default' as const;
    if (r === 'manager') return 'secondary' as const;
    return 'outline' as const;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Shield className="h-7 w-7 text-primary" />
          لوحة إدارة النظام
        </h1>
        <p className="text-muted-foreground">إدارة المقاهي والحسابات والموظفين</p>
      </div>

      <Tabs defaultValue="tenants" className="space-y-6" dir="rtl">
        <TabsList className="grid w-full grid-cols-2 bg-card">
          <TabsTrigger value="tenants" className="gap-2">
            <Building2 className="h-4 w-4" />
            المقاهي
          </TabsTrigger>
          <TabsTrigger value="create-admin" className="gap-2">
            <UserPlus className="h-4 w-4" />
            إنشاء حساب مدير
          </TabsTrigger>
        </TabsList>

        {/* Tenants Tab */}
        <TabsContent value="tenants">
          <Card className="border-border/50 bg-card/80 backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Coffee className="h-5 w-5 text-primary" />
                المقاهي المسجلة ({tenants.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              ) : tenants.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">لا توجد مقاهي مسجلة بعد</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">اسم المقهى</TableHead>
                      <TableHead className="text-right">المدير</TableHead>
                      <TableHead className="text-right">عدد المستخدمين</TableHead>
                      <TableHead className="text-right">تاريخ التسجيل</TableHead>
                      <TableHead className="text-right">إجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenants.map((tenant) => (
                      <TableRow key={tenant.id}>
                        <TableCell>
                          {editingTenantId === tenant.id ? (
                            <div className="flex items-center gap-2">
                              <Input
                                value={editTenantName}
                                onChange={(e) => setEditTenantName(e.target.value)}
                                className="h-8 w-40"
                              />
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleUpdateTenantName(tenant.id)}>
                                <Save className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingTenantId(null)}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{tenant.name}</span>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => { setEditingTenantId(tenant.id); setEditTenantName(tenant.name); }}
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{tenant.admin_name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{tenant.user_count}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(tenant.created_at).toLocaleDateString('ar-EG')}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1"
                              onClick={() => handleViewTenantUsers(tenant)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              المستخدمين
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Create Admin Tab */}
        <TabsContent value="create-admin">
          <Card className="border-border/50 bg-card/80 backdrop-blur max-w-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-primary" />
                إنشاء حساب مدير مقهى جديد
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                سيتم إنشاء حساب مدير جديد مع مقهى خاص به منفصل عن باقي المقاهي.
              </p>
              <div className="space-y-2">
                <Label>اسم المقهى</Label>
                <Input
                  placeholder="مثال: مقهى الأصدقاء"
                  value={adminForm.cafe_name}
                  onChange={(e) => setAdminForm({ ...adminForm, cafe_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>اسم المدير</Label>
                <Input
                  placeholder="مثال: أحمد محمد"
                  value={adminForm.name}
                  onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>البريد الإلكتروني</Label>
                <Input
                  type="email"
                  dir="ltr"
                  placeholder="admin@example.com"
                  value={adminForm.email}
                  onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>كلمة المرور</Label>
                <Input
                  type="password"
                  dir="ltr"
                  placeholder="••••••••"
                  value={adminForm.password}
                  onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                />
              </div>
              <Button onClick={handleCreateAdmin} disabled={creating} className="w-full gap-2">
                <Plus className="h-4 w-4" />
                {creating ? 'جاري الإنشاء...' : 'إنشاء حساب المدير'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Tenant Users Dialog */}
      <Dialog open={!!selectedTenant} onOpenChange={(open) => { if (!open) setSelectedTenant(null); }}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              مستخدمو {selectedTenant?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <Button
              size="sm"
              className="gap-1"
              onClick={() => setShowAddEmployee(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              إضافة موظف
            </Button>

            {loadingUsers ? (
              <div className="flex justify-center py-4">
                <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الاسم</TableHead>
                    <TableHead className="text-right">البريد</TableHead>
                    <TableHead className="text-right">الصلاحية</TableHead>
                    <TableHead className="text-right">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenantUsers.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell dir="ltr" className="text-left text-muted-foreground">{u.email}</TableCell>
                      <TableCell>
                        <Badge variant={roleBadgeVariant(u.role)}>{roleLabel(u.role)}</Badge>
                      </TableCell>
                      <TableCell>
                        {u.role !== 'super_admin' && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            onClick={() => setUserToDelete(u)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Employee Dialog */}
      <Dialog open={showAddEmployee} onOpenChange={setShowAddEmployee}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة موظف لـ {selectedTenant?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>الاسم</Label>
              <Input
                placeholder="اسم الموظف"
                value={employeeForm.name}
                onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>البريد الإلكتروني</Label>
              <Input
                type="email"
                dir="ltr"
                placeholder="employee@example.com"
                value={employeeForm.email}
                onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>كلمة المرور</Label>
              <Input
                type="password"
                dir="ltr"
                placeholder="••••••••"
                value={employeeForm.password}
                onChange={(e) => setEmployeeForm({ ...employeeForm, password: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>الصلاحية</Label>
              <Select value={employeeForm.role} onValueChange={(v) => setEmployeeForm({ ...employeeForm, role: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cashier">كاشير</SelectItem>
                  <SelectItem value="manager">مشرف</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAddEmployee} disabled={creating} className="w-full gap-2">
              <UserPlus className="h-4 w-4" />
              {creating ? 'جاري الإضافة...' : 'إضافة الموظف'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation */}
      <ConfirmDialog
        open={!!userToDelete}
        onOpenChange={(open) => { if (!open) setUserToDelete(null); }}
        title="حذف المستخدم"
        description={`هل أنت متأكد من حذف "${userToDelete?.name}"؟ لا يمكن التراجع عن هذا الإجراء.`}
        onConfirm={handleDeleteUser}
        confirmText="حذف"
        variant="destructive"
      />
    </div>
  );
}
