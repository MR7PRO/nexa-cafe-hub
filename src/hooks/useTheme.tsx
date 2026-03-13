import { createContext, useContext, useEffect, useState, useCallback } from 'react';

type ThemeMode = 'dark' | 'light' | 'auto';

interface ThemeContextType {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  resolvedTheme: 'dark' | 'light';
}

const ThemeContext = createContext<ThemeContextType>({
  mode: 'dark',
  setMode: () => {},
  resolvedTheme: 'dark',
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getAutoTheme(): 'dark' | 'light' {
  const hour = new Date().getHours();
  // Light from 6am to 6pm
  return hour >= 6 && hour < 18 ? 'light' : 'dark';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    return (localStorage.getItem('theme-mode') as ThemeMode) || 'dark';
  });

  const resolvedTheme = mode === 'auto' ? getAutoTheme() : mode;

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    localStorage.setItem('theme-mode', newMode);
  }, []);

  // Apply theme class to document
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolvedTheme);

    // Remove background-image in light mode
    if (resolvedTheme === 'light') {
      document.body.style.backgroundImage = 'none';
    } else {
      document.body.style.backgroundImage = '';
    }
  }, [resolvedTheme]);

  // Auto-switch check every minute
  useEffect(() => {
    if (mode !== 'auto') return;
    const interval = setInterval(() => {
      const newResolved = getAutoTheme();
      const root = document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(newResolved);
      if (newResolved === 'light') {
        document.body.style.backgroundImage = 'none';
      } else {
        document.body.style.backgroundImage = '';
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [mode]);

  return (
    <ThemeContext.Provider value={{ mode, setMode, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
