import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';

const SITE = 'https://nexa-cafe-hub.lovable.app';

type Meta = { title: string; description: string };

const routeMeta: Record<string, Meta> = {
  '/': {
    title: 'لوحة التحكم - نيكسا كافيه',
    description: 'نظرة سريعة على إيرادات اليوم والجلسات النشطة وحالة المخزون في مقهاك عبر نظام نيكسا كافيه.',
  },
  '/auth': {
    title: 'تسجيل الدخول - نيكسا كافيه',
    description: 'سجّل الدخول أو أنشئ حساباً لإدارة مقهاك ومركز الألعاب عبر نظام نيكسا كافيه المتكامل.',
  },
  '/devices': {
    title: 'إدارة الأجهزة والجلسات - نيكسا كافيه',
    description: 'تشغيل وإيقاف جلسات الأجهزة، متابعة العدادات والمؤقتات، وتحويل الجلسات بين الأجهزة بضغطة واحدة.',
  },
  '/pos': {
    title: 'نقطة البيع (POS) - نيكسا كافيه',
    description: 'شاشة بيع سريعة للمشروبات والوجبات مع خصم المخزون تلقائياً وإصدار الفواتير فوراً.',
  },
  '/products': {
    title: 'المنتجات والمخزون - نيكسا كافيه',
    description: 'إدارة أصناف المقهى والأسعار والتكاليف مع تنبيهات المخزون المنخفض لكل منتج.',
  },
  '/reservations': {
    title: 'الحجوزات - نيكسا كافيه',
    description: 'تنظيم حجوزات الأجهزة والطاولات وربط كل حجز بالعميل وبدء الجلسة مباشرة منه.',
  },
  '/loyalty': {
    title: 'الولاء والباقات - نيكسا كافيه',
    description: 'باقات الساعات المدفوعة مسبقاً ورصيد العملاء وخصم الوقت تلقائياً عند بدء الجلسة.',
  },
  '/promotions': {
    title: 'العروض والخصومات - نيكسا كافيه',
    description: 'إنشاء عروض وخصومات على الجلسات والمنتجات وتحديد فترة صلاحيتها لعملاء المقهى.',
  },
  '/tickets': {
    title: 'الفواتير والإيصالات - نيكسا كافيه',
    description: 'سجل كامل للفواتير مع الطباعة بمقاسات A5 و A6 وإدارة عمليات الاسترجاع بأمان.',
  },
  '/reports': {
    title: 'التقارير والأرباح - نيكسا كافيه',
    description: 'تقارير أرباح وخسائر وساعات الذروة وأداء الموظفين والأجهزة مع تصدير PDF و Excel.',
  },
  '/shifts': {
    title: 'الورديات والصندوق - نيكسا كافيه',
    description: 'فتح وإغلاق الورديات ومطابقة النقد المتوقع مع الفعلي وتوثيق أي فروقات في الصندوق.',
  },
  '/expenses': {
    title: 'المصاريف - نيكسا كافيه',
    description: 'تسجيل مصاريف المقهى اليومية وتصنيفها لاحتساب الأرباح الصافية بدقة.',
  },
  '/settings': {
    title: 'الإعدادات - نيكسا كافيه',
    description: 'ضبط بيانات المقهى وخطط الأسعار والمستخدمين والصلاحيات وتفضيلات النظام.',
  },
  '/profile': {
    title: 'الملف الشخصي - نيكسا كافيه',
    description: 'تحديث اسمك وصورة حسابك وتفضيلاتك الشخصية داخل نظام نيكسا كافيه.',
  },
  '/super-admin': {
    title: 'إدارة النظام - نيكسا كافيه',
    description: 'إدارة المقاهي المشتركة والحسابات والدعوات على مستوى النظام بالكامل.',
  },
};

const fallback: Meta = {
  title: 'نيكسا كافيه - نظام إدارة المقهى',
  description: 'نظام إدارة متكامل للمقاهي ومراكز الألعاب: جلسات، نقطة بيع، مخزون، تقارير وورديات.',
};

export function RouteMeta() {
  const { pathname } = useLocation();
  const meta = routeMeta[pathname] ?? fallback;
  const url = `${SITE}${pathname === '/' ? '/' : pathname}`;

  return (
    <Helmet>
      <title>{meta.title}</title>
      <meta name="description" content={meta.description} />
      <link rel="canonical" href={url} />
      <meta property="og:title" content={meta.title} />
      <meta property="og:description" content={meta.description} />
      <meta property="og:url" content={url} />
      <meta name="twitter:title" content={meta.title} />
      <meta name="twitter:description" content={meta.description} />
    </Helmet>
  );
}
