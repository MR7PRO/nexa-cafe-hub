import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, User, Building2, Ticket } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { t } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { z } from 'zod';
import logo from '@/assets/logo.png';

const loginSchema = z.object({
  email: z.string().email('بريد إلكتروني غير صالح'),
  password: z.string().min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
});

const signupSchema = loginSchema.extend({
  name: z.string().min(2, 'الاسم يجب أن يكون حرفين على الأقل'),
});

interface InviteInfo {
  valid: boolean;
  tenant_id: string;
  tenant_name: string;
  role: string;
  invitation_id: string;
  code: string;
}


export default function Auth() {
  const [searchParams] = useSearchParams();
  const inviteCode = searchParams.get('invite');

  const [isLogin, setIsLogin] = useState(!inviteCode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Invite state
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  
  // Manual invite code input
  const [manualCode, setManualCode] = useState('');
  const [showInviteInput, setShowInviteInput] = useState(false);
  
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Validate invite code on mount or when code changes
  useEffect(() => {
    if (inviteCode) {
      validateInvite(inviteCode);
    }
  }, [inviteCode]);

  const validateInvite = async (code: string) => {
    setInviteLoading(true);
    setInviteError('');
    setInviteInfo(null);
    try {
      const { data, error } = await supabase.functions.invoke('validate-invite', {
        body: { code },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (data?.valid) {
        setInviteInfo({ ...data, code });
        setIsLogin(false);

      }
    } catch (err: any) {
      setInviteError(err.message || 'كود دعوة غير صالح');
    }
    setInviteLoading(false);
  };

  const handleManualInvite = () => {
    if (!manualCode.trim()) return;
    validateInvite(manualCode.trim().toUpperCase());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setLoading(true);

    try {
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
              : error.message === 'Email not confirmed'
              ? 'يرجى تأكيد بريدك الإلكتروني أولاً'
              : error.message,
            variant: 'destructive',
          });
        } else {
          navigate('/');
        }
      } else {
        // If registering via invite, pass tenant_id in metadata
        const options = inviteInfo ? { tenantId: inviteInfo.tenant_id } : undefined;
        const { error } = await signUp(email, password, name, options);
        if (error) {
          toast({
            title: t('error'),
            description: error.message.includes('already registered')
              ? 'هذا البريد مسجل مسبقاً'
              : error.message,
            variant: 'destructive',
          });
        } else {
          // Increment invite usage if via invite
          if (inviteInfo) {
            try {
              await supabase.functions.invoke('use-invite', {
                body: { invitation_id: inviteInfo.invitation_id },
              });
            } catch {}
          }
          toast({
            title: 'تم إنشاء الحساب',
            description: 'يرجى التحقق من بريدك الإلكتروني لتأكيد الحساب',
          });
          setIsLogin(true);
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
    <div className="flex min-h-screen items-center justify-center p-4 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      <div className="w-full max-w-md animate-slide-up relative z-10">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-6 relative">
            <img 
              src="/logo.png"
              alt="Nexa Cafe Logo" 
              width={112}
              height={112}
              fetchPriority="high"
              className="w-28 h-28 mx-auto logo-float drop-shadow-2xl"
              style={{ filter: 'drop-shadow(0 0 30px hsl(190 100% 50% / 0.4)) drop-shadow(0 0 60px hsl(270 80% 60% / 0.3))' }}
            />
          </div>
          <h1 className="text-4xl font-bold text-gradient-logo font-gaming tracking-widest">NexaCafe</h1>
          <p className="mt-2 text-muted-foreground text-base">نيكسا كافيه • نظام إدارة مقهى</p>
        </div>

        {/* Invite Banner */}
        {inviteLoading && (
          <div className="mb-4 rounded-xl border border-primary/30 bg-primary/10 p-4 text-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
            <p className="mt-2 text-sm text-muted-foreground">جاري التحقق من كود الدعوة...</p>
          </div>
        )}
        {inviteError && (
          <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-center">
            <p className="text-sm text-destructive">{inviteError}</p>
          </div>
        )}
        {inviteInfo && (
          <div className="mb-4 rounded-xl border border-primary/30 bg-primary/10 p-4">
            <div className="flex items-center gap-2 justify-center">
              <Building2 className="h-5 w-5 text-primary" />
              <span className="font-bold text-foreground">{inviteInfo.tenant_name}</span>
            </div>
            <p className="text-center text-sm text-muted-foreground mt-1">
              تمت دعوتك للانضمام كـ <Badge variant="secondary" className="mx-1">{inviteInfo.role === 'cashier' ? 'كاشير' : inviteInfo.role === 'manager' ? 'مشرف' : inviteInfo.role}</Badge>
            </p>
          </div>
        )}

        {/* Form Card */}
        <div className="rounded-2xl border-gradient bg-card/60 p-8 shadow-elevated backdrop-blur-xl relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
          
          <h2 className="mb-6 text-xl font-bold text-foreground relative">
            {inviteInfo ? 'إنشاء حساب موظف' : isLogin ? t('login') : t('signup')}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {(!isLogin || inviteInfo) && (
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
                {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
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
              {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
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
              {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
            </div>

            <Button
              type="submit"
              className="w-full touch-target text-base font-bold relative overflow-hidden group"
              disabled={loading}
              style={{ background: 'linear-gradient(135deg, hsl(190 100% 50%), hsl(270 80% 60%))' }}
            >
              <span className="relative z-10">
                {loading ? 'جاري التحميل...' : inviteInfo ? 'إنشاء الحساب' : isLogin ? t('login') : t('signup')}
              </span>
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
            </Button>
          </form>

          {!inviteInfo && (
            <div className="mt-6 space-y-3 relative">
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-sm text-primary hover:text-accent transition-colors"
                >
                  {isLogin ? 'ليس لديك حساب؟ سجل الآن' : 'لديك حساب؟ سجل دخولك'}
                </button>
              </div>
              
              {/* Invite Code Entry */}
              <div className="border-t border-border/50 pt-3">
                {!showInviteInput ? (
                  <button
                    type="button"
                    onClick={() => setShowInviteInput(true)}
                    className="w-full text-center text-sm text-muted-foreground hover:text-primary transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Ticket className="h-4 w-4" />
                    لديك كود دعوة؟
                  </button>
                ) : (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">أدخل كود الدعوة</Label>
                    <div className="flex gap-2">
                      <Input
                        value={manualCode}
                        onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                        placeholder="مثال: ABC123"
                        dir="ltr"
                        className="text-center font-mono tracking-widest"
                        maxLength={10}
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleManualInvite}
                        disabled={inviteLoading || !manualCode.trim()}
                        variant="outline"
                      >
                        تحقق
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          نظام إدارة متكامل للمقاهي ومراكز الألعاب
        </p>
      </div>
    </div>
  );
}
