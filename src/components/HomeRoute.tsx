import Index from '@/pages/Index';

// Public visitors see product information; staff retain their existing dashboard.
export function HomeRoute({ authenticated, children }: {
  authenticated: boolean;
  children: React.ReactNode;
}) {
  return authenticated ? <>{children}</> : <Index />;
}