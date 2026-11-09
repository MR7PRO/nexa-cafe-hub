import { Link } from 'react-router-dom';
import { ArrowLeft, Gamepad2, Receipt, Package, Users, Wrench, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const areas = [
  { icon: Gamepad2, title: 'الأجهزة والجلسات', description: 'متابعة حالة أجهزة الألعاب ووقت الجلسات، وتنظيم الحجوزات.' },
  { icon: Receipt, title: 'المبيعات والفواتير', description: 'بيع منتجات المقهى وإصدار الإيصالات ومتابعة الورديات والمصاريف بالشيكل.' },
  { icon: Package, title: 'المنتجات والمخزون', description: 'تسجيل الأصناف والأسعار والتوريد، ومتابعة حركة المخزون.' },
  { icon: Users, title: 'الزبائن وباقات الساعات', description: 'حفظ بيانات الزبائن ومتابعة باقات الساعات المدفوعة مسبقاً وسجل الأرصدة.' },
  { icon: Wrench, title: 'صيانة الأجهزة', description: 'تسجيل الأعطال ومتابعة الإصلاح ووقت توقف الأجهزة.' },
  { icon: BarChart3, title: 'التقارير وسجل النشاط', description: 'مراجعة الإيرادات وأداء الأجهزة والعمليات المسجلة، وتصدير التقارير.' },
];

const Index = () => {
  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link to="/" className="flex items-center gap-3" aria-label="نيكسا كافيه — الرئيسية">
            <img src="/logo.png" alt="" width={48} height={48} className="h-12 w-12 object-contain" />
            <span className="font-gaming text-lg tracking-normal" dir="ltr">NexaCafe</span>
          </Link>
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/auth">تسجيل الدخول <ArrowLeft aria-hidden="true" /></Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6">
        <section className="border-b border-border py-12 text-center md:py-16">
          <img src="/logo.png" alt="شعار نيكسا كافيه" width={144} height={144} fetchPriority="high" className="mx-auto mb-6 h-36 w-36 object-contain" />
          <h1 className="text-4xl font-bold leading-tight md:text-5xl">نيكسا كافيه <span className="mt-3 block font-gaming text-2xl tracking-normal" dir="ltr">NexaCafe</span></h1>
          <p className="mt-6 text-xl font-medium">نظام إدارة المقاهي ومراكز الألعاب</p>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">إدارة جلسات الألعاب والمبيعات والمخزون والحجوزات وباقات الزبائن، مع متابعة الصيانة والورديات والتقارير من مكان واحد.</p>
          <Button asChild size="lg" className="mt-8 min-h-14">
            <Link to="/auth">الدخول إلى حسابك <ArrowLeft aria-hidden="true" /></Link>
          </Button>
        </section>
        <section className="py-10 md:py-12" aria-labelledby="operations-heading">
          <h2 id="operations-heading" className="mb-8 text-2xl font-bold">إدارة أعمال المقهى اليومية</h2>
          <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {areas.map(({ icon: Icon, title, description }) => (
              <article key={title} className="border-t border-border pt-5">
                <Icon className="mb-4 h-6 w-6 text-primary" aria-hidden="true" />
                <h3 className="text-lg font-bold">{title}</h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">{description}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
      <footer className="border-t border-border px-6 py-6 text-center text-sm text-muted-foreground">نيكسا كافيه — نظام إدارة المقاهي ومراكز الألعاب</footer>
    </div>
  );
};

export default Index;
