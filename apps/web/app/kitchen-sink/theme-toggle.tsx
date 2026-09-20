'use client';

import { useState } from 'react';
import { Button } from '@procircuit/ui';

export function ThemeToggle() {
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
    <Button variant="outline" size="icon" onClick={toggle} aria-label="Toggle theme">
      {dark ? '☀' : '☾'}
    </Button>
  );
}
