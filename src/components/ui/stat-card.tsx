import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: 'default' | 'primary' | 'success' | 'warning';
  className?: string;
}

const variantStyles = {
  default: 'border-border',
  primary: 'border-primary/30',
  success: 'border-success/30',
  warning: 'border-warning/30',
};

const iconStyles = {
  default: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
};

export function StatCard({ 
  title, 
  value, 
  icon, 
  trend, 
  variant = 'default',
  className 
}: StatCardProps) {
  return (
    <div className={cn('stat-card', variantStyles[variant], className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-2 text-3xl font-bold text-foreground ils-amount">{value}</p>
          {trend && (
            <p className={cn(
              'mt-1 text-sm',
              trend.isPositive ? 'text-success' : 'text-destructive'
            )}>
              {trend.isPositive ? '+' : ''}{trend.value}%
            </p>
          )}
        </div>
        <div className={cn('rounded-xl p-3', iconStyles[variant])}>
          {icon}
        </div>
      </div>
    </div>
  );
}
