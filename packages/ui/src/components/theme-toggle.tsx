'use client';

import { useState } from 'react';
import { Button, type ButtonProps } from './button';

// Baseline §Implementation "Theme follows the system with a manual override that wins in
// both directions and eases between the two" — the `.theming` class (globals.css) makes the
// flip a 200ms fade instead of a jump. Shared by the kitchen sink and the app shell topbar.
export function ThemeToggle({
  size = 'icon',
  ...props
}: Omit<ButtonProps, 'onClick' | 'children'>) {
  const [dark, setDark] = useState<boolean | null>(null);

  function toggle() {
    const root = document.documentElement;
    const isDark =
      root.getAttribute('data-theme') === 'dark' ||
      (!root.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    root.classList.add('theming');
    root.setAttribute('data-theme', isDark ? 'light' : 'dark');
    setDark(!isDark);
    window.setTimeout(() => root.classList.remove('theming'), 260);
  }

  return (
    <Button variant="outline" size={size} onClick={toggle} aria-label="Toggle theme" {...props}>
      {dark ? '☀' : '☾'}
    </Button>
  );
}
