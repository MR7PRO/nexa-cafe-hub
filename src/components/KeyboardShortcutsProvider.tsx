import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

export function KeyboardShortcutsProvider({ children }: { children: React.ReactNode }) {
  // Global keyboard shortcuts (navigation only)
  useKeyboardShortcuts();
  
  return <>{children}</>;
}
