import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gamepad2, Mail, Lock, User } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { t } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('بريد إلكتروني غير صالح'),
  password: z.string().min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
});

const signupSchema = loginSchema.extend({
  name: z.string().min(2, 'الاسم يجب أن يكون حرفين على الأقل'),
});

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setLoading(true);

    try {
      // Validate input
      const schema = isLogin ? loginSchema : signupSchema;
      const validation = schema.safeParse({ email, password, name });
      
      if (!validation.success) {
        const fieldErrors: Record<string, string> = {};
        validation.error.errors.forEach((err) => {
          if (err.path[0]) {
            fieldErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(fieldErrors);
        setLoading(false);
        return;
      }

      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          toast({
            title: t('error'),
            description: error.message === 'Invalid login credentials' 
              ? 'بيانات الدخول غير صحيحة' 
              : error.message,
            variant: 'destructive',
          });
        } else {
          navigate('/');
        }
      } else {
        const { error } = await signUp(email, password, name);
        if (error) {
          toast({
            title: t('error'),
            description: error.message.includes('already registered')
              ? 'هذا البريد مسجل مسبقاً'
              : error.message,
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'تم إنشاء الحساب',
            description: 'يمكنك الآن تسجيل الدخول',
          });
          navigate('/');
        }
      }
    } catch (error: any) {
      toast({
        title: t('error'),
        description: error.message || 'حدث خطأ غير متوقع',
        variant: 'destructive',
      });
    }

    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md animate-slide-up">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 shadow-glow-cyan">
            <Gamepad2 className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{t('appName')}</h1>
          <p className="mt-2 text-muted-foreground">نظام إدارة المقهى</p>
        </div>

        {/* Form Card */}
        <div className="rounded-2xl border border-border bg-card/50 p-8 shadow-elevated backdrop-blur-sm">
          <h2 className="mb-6 text-xl font-semibold text-foreground">
            {isLogin ? t('login') : t('signup')}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="name">{t('name')}</Label>
                <div className="relative">
                  <User className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="محمد أحمد"
                    className="pr-10"
                  />
                </div>
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name}</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">{t('email')}</Label>
              <div className="relative">
                <Mail className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="pr-10"
                  dir="ltr"
                />
              </div>
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t('password')}</Label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pr-10"
                  dir="ltr"
                />
              </div>
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full touch-target"
              disabled={loading}
            >
              {loading ? 'جاري التحميل...' : isLogin ? t('login') : t('signup')}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm text-primary hover:underline"
            >
              {isLogin ? 'ليس لديك حساب؟ سجل الآن' : 'لديك حساب؟ سجل دخولك'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
