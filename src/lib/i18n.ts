// Arabic translations for Nexa Cafe
export const ar = {
  // App
  appName: 'نيكسا كافيه',
  
  // Auth
  login: 'تسجيل الدخول',
  signup: 'إنشاء حساب',
  logout: 'تسجيل الخروج',
  email: 'البريد الإلكتروني',
  password: 'كلمة المرور',
  name: 'الاسم',
  
  // Roles
  admin: 'مدير',
  manager: 'مشرف',
  cashier: 'كاشير',
  
  // Navigation
  dashboard: 'لوحة التحكم',
  devices: 'الأجهزة',
  pos: 'نقطة البيع',
  tickets: 'الفواتير',
  products: 'المنتجات',
  shifts: 'الورديات',
  expenses: 'المصروفات',
  reports: 'التقارير',
  settings: 'الإعدادات',
  
  // Dashboard
  todayRevenue: 'إيرادات اليوم',
  activeSessions: 'جلسات نشطة',
  openTickets: 'فواتير مفتوحة',
  lowStock: 'مخزون منخفض',
  quickActions: 'إجراءات سريعة',
  
  // Devices
  deviceGrid: 'شبكة الأجهزة',
  playstation: 'بلايستيشن',
  pc: 'كمبيوتر',
  idle: 'متاح',
  running: 'يعمل',
  paused: 'موقف',
  
  // Actions
  start: 'تشغيل',
  pause: 'إيقاف مؤقت',
  resume: 'استئناف',
  end: 'إنهاء',
  transfer: 'نقل',
  cancel: 'إلغاء',
  save: 'حفظ',
  add: 'إضافة',
  edit: 'تعديل',
  delete: 'حذف',
  confirm: 'تأكيد',
  
  // Session
  session: 'جلسة',
  startTime: 'وقت البدء',
  duration: 'المدة',
  cost: 'التكلفة',
  ratePlan: 'خطة التسعير',
  
  // Tickets
  ticket: 'فاتورة',
  ticketNo: 'رقم الفاتورة',
  items: 'العناصر',
  subtotal: 'المجموع الفرعي',
  discount: 'خصم',
  total: 'الإجمالي',
  pay: 'دفع',
  print: 'طباعة',
  cash: 'نقداً',
  card: 'بطاقة',
  mixed: 'مختلط',
  
  // Products
  product: 'منتج',
  category: 'فئة',
  price: 'السعر',
  stock: 'المخزون',
  
  // Currency
  ils: '₪',
  
  // Time
  hour: 'ساعة',
  minute: 'دقيقة',
  hours: 'ساعات',
  minutes: 'دقائق',
  
  // Messages
  sessionStarted: 'تم بدء الجلسة',
  sessionPaused: 'تم إيقاف الجلسة مؤقتاً',
  sessionResumed: 'تم استئناف الجلسة',
  sessionEnded: 'تم إنهاء الجلسة',
  paymentSuccess: 'تم الدفع بنجاح',
  error: 'حدث خطأ',
  
  // Placeholders
  searchProducts: 'بحث عن منتج...',
  selectRatePlan: 'اختر خطة التسعير',
  enterAmount: 'أدخل المبلغ',
  
  // Empty States
  noActiveSessions: 'لا توجد جلسات نشطة',
  noProducts: 'لا توجد منتجات',
  noTickets: 'لا توجد فواتير',
};

export type TranslationKey = keyof typeof ar;

export const t = (key: TranslationKey): string => {
  return ar[key] || key;
};

// Format ILS currency
export const formatILS = (amount: number): string => {
  return `${amount.toFixed(2)} ₪`;
};

// Format duration from minutes
export const formatDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return `${hours} ${ar.hours} ${mins} ${ar.minutes}`;
  }
  return `${mins} ${ar.minutes}`;
};
