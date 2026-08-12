import { useEffect, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function FullscreenToggle({ className }: { className?: string }) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    onChange();
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggle = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // ignore unsupported / denied fullscreen
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={toggle}
      aria-label={isFullscreen ? 'إنهاء وضع ملء الشاشة' : 'تكبير الشاشة (ملء الشاشة)'}
      title={isFullscreen ? 'إنهاء ملء الشاشة' : 'ملء الشاشة'}
      className={cn(
        'fixed bottom-24 left-4 z-50 h-11 w-11 rounded-full border-primary/30 bg-card/90 shadow-lg backdrop-blur-md hover:border-primary/60 hover:text-primary md:bottom-6',
        className
      )}
    >
      {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
    </Button>
  );
}
