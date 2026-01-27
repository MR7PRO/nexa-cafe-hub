import { useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';

interface ShortcutHandler {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  handler: () => void;
  description: string;
}

interface UseKeyboardShortcutsOptions {
  onStartSession?: () => void;
  onEndSession?: () => void;
  onPauseSession?: () => void;
  enabled?: boolean;
}

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { onStartSession, onEndSession, onPauseSession, enabled = true } = options;

  const shortcuts: ShortcutHandler[] = [
    // Navigation shortcuts (Alt + number)
    { key: '1', altKey: true, handler: () => navigate('/'), description: 'الذهاب للوحة التحكم' },
    { key: '2', altKey: true, handler: () => navigate('/devices'), description: 'الذهاب للأجهزة' },
    { key: '3', altKey: true, handler: () => navigate('/pos'), description: 'الذهاب لنقطة البيع' },
    { key: '4', altKey: true, handler: () => navigate('/products'), description: 'الذهاب للمنتجات' },
    { key: '5', altKey: true, handler: () => navigate('/tickets'), description: 'الذهاب للفواتير' },
    { key: '6', altKey: true, handler: () => navigate('/reports'), description: 'الذهاب للتقارير' },
    { key: '7', altKey: true, handler: () => navigate('/shifts'), description: 'الذهاب للورديات' },
    { key: '8', altKey: true, handler: () => navigate('/expenses'), description: 'الذهاب للمصروفات' },
    { key: '9', altKey: true, handler: () => navigate('/settings'), description: 'الذهاب للإعدادات' },
    
    // Session shortcuts (only on devices page)
    ...(location.pathname === '/devices' ? [
      { 
        key: 's', 
        altKey: true, 
        handler: () => {
          if (onStartSession) {
            onStartSession();
          } else {
            toast.info('اختر جهازاً أولاً لبدء الجلسة');
          }
        }, 
        description: 'بدء جلسة' 
      },
      { 
        key: 'e', 
        altKey: true, 
        handler: () => {
          if (onEndSession) {
            onEndSession();
          } else {
            toast.info('اختر جهازاً نشطاً لإنهاء الجلسة');
          }
        }, 
        description: 'إنهاء جلسة' 
      },
      { 
        key: 'p', 
        altKey: true, 
        handler: () => {
          if (onPauseSession) {
            onPauseSession();
          } else {
            toast.info('اختر جهازاً نشطاً لإيقاف الجلسة مؤقتاً');
          }
        }, 
        description: 'إيقاف مؤقت' 
      },
    ] : []),
    
    // Global shortcut to show help
    { 
      key: '/', 
      altKey: true, 
      handler: () => {
        toast.info(
          <div className="text-right space-y-2">
            <p className="font-bold mb-2">اختصارات لوحة المفاتيح:</p>
            <p>Alt+1-9: التنقل بين الصفحات</p>
            <p>Alt+S: بدء جلسة (في صفحة الأجهزة)</p>
            <p>Alt+E: إنهاء جلسة (في صفحة الأجهزة)</p>
            <p>Alt+P: إيقاف مؤقت (في صفحة الأجهزة)</p>
            <p>Alt+/: عرض المساعدة</p>
          </div>,
          { duration: 5000 }
        );
      }, 
      description: 'عرض المساعدة' 
    },
  ];

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;
    
    // Don't trigger shortcuts when typing in inputs
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    for (const shortcut of shortcuts) {
      const ctrlMatch = shortcut.ctrlKey ? event.ctrlKey : !event.ctrlKey;
      const altMatch = shortcut.altKey ? event.altKey : !event.altKey;
      const shiftMatch = shortcut.shiftKey ? event.shiftKey : !event.shiftKey;
      
      if (
        event.key.toLowerCase() === shortcut.key.toLowerCase() &&
        ctrlMatch &&
        altMatch &&
        shiftMatch
      ) {
        event.preventDefault();
        shortcut.handler();
        return;
      }
    }
  }, [enabled, shortcuts]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return { shortcuts };
}
