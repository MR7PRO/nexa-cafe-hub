import { useEffect, useState } from 'react';
import { Plus, Package, Edit2, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { t, formatILS } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { cn } from '@/lib/utils';
import { canManageCatalog } from '@/lib/permissions';

interface Product {
  id: string;
  name: string;
  sell_price_ils: number;
  cost_price_ils: number;
  stock_qty: number;
  low_stock_threshold: number;
  is_active: boolean;
  category_id: string | null;
  categories?: { name: string } | null;
}

interface Category {
  id: string;
  name: string;
}

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  const [form, setForm] = useState({
    name: '',
    sell_price_ils: '',
    cost_price_ils: '',
    stock_qty: '',
    low_stock_threshold: '5',
    category_id: '',
  });
  
  const { toast } = useToast();
  const { role } = useAuth();
  const canManage = canManageCatalog(role);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [productsRes, categoriesRes] = await Promise.all([
      supabase.from('products').select('*, categories(name)').order('name'),
      supabase.from('categories').select('*'),
    ]);

    if (productsRes.data) setProducts(productsRes.data as Product[]);
    if (categoriesRes.data) setCategories(categoriesRes.data);
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!form.name || !form.sell_price_ils) {
      toast({ title: t('error'), description: 'يرجى ملء الحقول المطلوبة', variant: 'destructive' });
      return;
    }

    const data = {
      name: form.name,
      sell_price_ils: parseFloat(form.sell_price_ils),
      cost_price_ils: parseFloat(form.cost_price_ils) || 0,
      stock_qty: parseInt(form.stock_qty) || 0,
      low_stock_threshold: parseInt(form.low_stock_threshold) || 5,
      category_id: form.category_id || null,
    };

    if (editingProduct) {
      const { error } = await supabase.from('products').update(data).eq('id', editingProduct.id);
      if (error) {
        toast({ title: t('error'), description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'تم التحديث', description: 'تم تحديث المنتج بنجاح' });
        resetForm();
        fetchData();
      }
    } else {
      const { error } = await supabase.from('products').insert(data);
      if (error) {
        toast({ title: t('error'), description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'تمت الإضافة', description: 'تم إضافة المنتج بنجاح' });
        resetForm();
        fetchData();
      }
    }
  };

  const resetForm = () => {
    setDialogOpen(false);
    setEditingProduct(null);
    setForm({
      name: '',
      sell_price_ils: '',
      cost_price_ils: '',
      stock_qty: '',
      low_stock_threshold: '5',
      category_id: '',
    });
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setForm({
      name: product.name,
      sell_price_ils: product.sell_price_ils.toString(),
      cost_price_ils: product.cost_price_ils.toString(),
      stock_qty: product.stock_qty.toString(),
      low_stock_threshold: product.low_stock_threshold.toString(),
      category_id: product.category_id || '',
    });
    setDialogOpen(true);
  };

  const toggleActive = async (product: Product) => {
    const { error } = await supabase
      .from('products')
      .update({ is_active: !product.is_active })
      .eq('id', product.id);

    if (error) {
      toast({ title: t('error'), description: error.message, variant: 'destructive' });
    } else {
      fetchData();
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t('products')}</h1>
          <p className="mt-1 text-muted-foreground">{products.length} منتج</p>
        </div>
        {canManage && (
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            if (!open) resetForm();
            else setDialogOpen(true);
          }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                إضافة منتج
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingProduct ? 'تعديل المنتج' : 'إضافة منتج جديد'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>اسم المنتج *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="مثال: بيبسي"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>سعر البيع (₪) *</Label>
                    <Input
                      type="number"
                      value={form.sell_price_ils}
                      onChange={(e) => setForm({ ...form, sell_price_ils: e.target.value })}
                      placeholder="5.00"
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>سعر التكلفة (₪)</Label>
                    <Input
                      type="number"
                      value={form.cost_price_ils}
                      onChange={(e) => setForm({ ...form, cost_price_ils: e.target.value })}
                      placeholder="2.50"
                      dir="ltr"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>الكمية</Label>
                    <Input
                      type="number"
                      value={form.stock_qty}
                      onChange={(e) => setForm({ ...form, stock_qty: e.target.value })}
                      placeholder="100"
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>حد التنبيه</Label>
                    <Input
                      type="number"
                      value={form.low_stock_threshold}
                      onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })}
                      placeholder="5"
                      dir="ltr"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>الفئة</Label>
                  <Select
                    value={form.category_id}
                    onValueChange={(v) => setForm({ ...form, category_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="اختر الفئة" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleSubmit} className="w-full">
                  {editingProduct ? 'حفظ التغييرات' : 'إضافة المنتج'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Products Table */}
      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">المنتج</TableHead>
              <TableHead className="text-right">الفئة</TableHead>
              <TableHead className="text-right">سعر البيع</TableHead>
              <TableHead className="text-right">التكلفة</TableHead>
              <TableHead className="text-right">المخزون</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              {canManage && <TableHead className="text-right">إجراءات</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => {
              const isLowStock = product.stock_qty <= product.low_stock_threshold;
              
              return (
                <TableRow key={product.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        <Package className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <span className="font-medium">{product.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>{product.categories?.name || '-'}</TableCell>
                  <TableCell className="font-mono">{formatILS(product.sell_price_ils)}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {formatILS(product.cost_price_ils)}
                  </TableCell>
                  <TableCell>
                    <span className={cn(
                      'font-mono',
                      isLowStock && 'text-warning'
                    )}>
                      {product.stock_qty}
                    </span>
                    {isLowStock && (
                      <Badge variant="outline" className="mr-2 border-warning text-warning">
                        منخفض
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={product.is_active ? 'default' : 'secondary'}>
                      {product.is_active ? 'نشط' : 'معطل'}
                    </Badge>
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`تعديل المنتج ${product.name}`}
                          onClick={() => openEdit(product)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={product.is_active ? `تعطيل المنتج ${product.name}` : `تنشيط المنتج ${product.name}`}
                          onClick={() => toggleActive(product)}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
