import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { formatILS } from '@/lib/i18n';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Edit, Percent, Tag, CalendarDays, Sparkles } from 'lucide-react';

interface Promotion {
  id: string;
  name: string;
  description: string | null;
  discount_type: string;
  discount_value: number;
  applies_to: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
}

export default function Promotions() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '',
    description: '',
    discount_type: 'percentage',
    discount_value: '',
    applies_to: 'all',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
  });

  const canManage = role === 'admin' || role === 'manager';

  useEffect(() => {
    fetchPromotions();
  }, []);

  const fetchPromotions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('promotions')
      .select('*')
      .order('created_at', { ascending: false });

    if (data) setPromotions(data as Promotion[]);
    if (error) console.error(error);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!form.name || !form.discount_value) {
      toast({ title: 'خطأ', description: 'يرجى ملء الحقول المطلوبة', variant: 'destructive' });
      return;
    }

    setSaving(true);

    const payload = {
      name: form.name,
      description: form.description || null,
      discount_type: form.discount_type,
      discount_value: parseFloat(form.discount_value),
      applies_to: form.applies_to,
      start_date: new Date(form.start_date).toISOString(),
      end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
    };

    let error;
    if (editing) {
      ({ error } = await supabase.from('promotions').update(payload).eq('id', editing.id));
    } else {
      ({ error } = await supabase.from('promotions').insert({ ...payload, created_by: user?.id }));
    }

    if (error) {
      toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: editing ? 'تم تحديث العرض' : 'تم إضافة العرض بنجاح' });
      resetForm();
      fetchPromotions();
    }
    setSaving(false);
  };

  const resetForm = () => {
    setShowDialog(false);
    setEditing(null);
    setForm({
      name: '',
      description: '',
      discount_type: 'percentage',
      discount_value: '',
      applies_to: 'all',
      start_date: new Date().toISOString().split('T')[0],
      end_date: '',
    });
  };

  const handleEdit = (promo: Promotion) => {
    setEditing(promo);
    setForm({
      name: promo.name,
      description: promo.description || '',
      discount_type: promo.discount_type,
      discount_value: promo.discount_value.toString(),
      applies_to: promo.applies_to,
      start_date: new Date(promo.start_date).toISOString().split('T')[0],
      end_date: promo.end_date ? new Date(promo.end_date).toISOString().split('T')[0] : '',
    });
    setShowDialog(true);
  };

  const handleToggle = async (promo: Promotion) => {
    const { error } = await supabase
      .from('promotions')
      .update({ is_active: !promo.is_active })
      .eq('id', promo.id);

    if (error) {
      toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    } else {
      fetchPromotions();
    }
  };

  const isPromoActive = (promo: Promotion) => {
    if (!promo.is_active) return false;
    const now = new Date();
    if (new Date(promo.start_date) > now) return false;
    if (promo.end_date && new Date(promo.end_date) < now) return false;
    return true;
  };

  const appliesToLabel = (v: string) => {
    switch (v) {
      case 'all': return 'الكل';
      case 'sessions': return 'الجلسات';
      case 'products': return 'المنتجات';
      default: return v;
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">العروض والخصومات</h1>
          <p className="mt-1 text-muted-foreground">إدارة العروض الترويجية والخصومات</p>
        </div>
        {canManage && (
          <Button onClick={() => setShowDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            إضافة عرض
          </Button>
        )}
      </div>

      {/* Active promotions highlight */}
      {promotions.filter(isPromoActive).length > 0 && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-foreground">العروض النشطة الآن</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {promotions.filter(isPromoActive).map(promo => (
              <div key={promo.id} className="rounded-lg border border-primary/20 bg-card p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">{promo.name}</span>
                  <Badge variant="default" className="bg-primary text-primary-foreground">
                    {promo.discount_type === 'percentage' ? `${promo.discount_value}%` : `${promo.discount_value}₪`}
                  </Badge>
                </div>
                {promo.description && (
                  <p className="mt-1 text-xs text-muted-foreground">{promo.description}</p>
                )}
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Tag className="h-3 w-3" />
                  {appliesToLabel(promo.applies_to)}
                  {promo.end_date && (
                    <>
                      <span>•</span>
                      <CalendarDays className="h-3 w-3" />
                      حتى {new Date(promo.end_date).toLocaleDateString('ar-EG')}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Promotions Table */}
      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الاسم</TableHead>
              <TableHead>نوع الخصم</TableHead>
              <TableHead>القيمة</TableHead>
              <TableHead>ينطبق على</TableHead>
              <TableHead>من</TableHead>
              <TableHead>إلى</TableHead>
              <TableHead>الحالة</TableHead>
              {canManage && <TableHead>إجراءات</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {promotions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 8 : 7} className="h-32 text-center text-muted-foreground">
                  لا توجد عروض بعد
                </TableCell>
              </TableRow>
            ) : (
              promotions.map(promo => (
                <TableRow key={promo.id}>
                  <TableCell className="font-medium">{promo.name}</TableCell>
                  <TableCell>{promo.discount_type === 'percentage' ? 'نسبة مئوية' : 'مبلغ ثابت'}</TableCell>
                  <TableCell className="font-mono">
                    {promo.discount_type === 'percentage' ? `${promo.discount_value}%` : `${promo.discount_value}₪`}
                  </TableCell>
                  <TableCell>{appliesToLabel(promo.applies_to)}</TableCell>
                  <TableCell className="text-sm">{new Date(promo.start_date).toLocaleDateString('ar-EG')}</TableCell>
                  <TableCell className="text-sm">
                    {promo.end_date ? new Date(promo.end_date).toLocaleDateString('ar-EG') : 'مفتوح'}
                  </TableCell>
                  <TableCell>
                    {isPromoActive(promo) ? (
                      <Badge className="bg-success/20 text-success">نشط</Badge>
                    ) : promo.is_active ? (
                      <Badge variant="outline" className="text-warning">مجدول</Badge>
                    ) : (
                      <Badge variant="secondary">معطل</Badge>
                    )}
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button size="icon" variant="ghost" onClick={() => handleEdit(promo)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Switch
                          checked={promo.is_active}
                          onCheckedChange={() => handleToggle(promo)}
                        />
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing ? 'تعديل العرض' : 'إضافة عرض جديد'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>اسم العرض *</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="مثال: خصم عطلة نهاية الأسبوع"
              />
            </div>
            <div>
              <Label>الوصف</Label>
              <Input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="وصف اختياري"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>نوع الخصم</Label>
                <Select value={form.discount_type} onValueChange={v => setForm(f => ({ ...f, discount_type: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">نسبة مئوية %</SelectItem>
                    <SelectItem value="fixed">مبلغ ثابت ₪</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>القيمة *</Label>
                <Input
                  type="number"
                  value={form.discount_value}
                  onChange={e => setForm(f => ({ ...f, discount_value: e.target.value }))}
                  placeholder={form.discount_type === 'percentage' ? '10' : '5'}
                />
              </div>
            </div>
            <div>
              <Label>ينطبق على</Label>
              <Select value={form.applies_to} onValueChange={v => setForm(f => ({ ...f, applies_to: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="sessions">الجلسات فقط</SelectItem>
                  <SelectItem value="products">المنتجات فقط</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>تاريخ البداية *</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                />
              </div>
              <div>
                <Label>تاريخ النهاية</Label>
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                />
              </div>
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? 'جاري الحفظ...' : editing ? 'تحديث' : 'إضافة'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
