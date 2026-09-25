'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'dx.admin.sidebar';

// Baseline §Shells and routes: "256px sidebar (48px collapsed, Cmd/Ctrl+B)", persisted
// (DEUCEX-CONTEXT 4.5 `pc.sidebar`). Starts false (expanded) on the server render and
// syncs from localStorage on mount, so there's no server/client markup mismatch.
export function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      // Private browsing or blocked storage: fall back to always-expanded.
    }
  }, []);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        toggle();
      }
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        // Ignore: nothing to persist to.
      }
      return next;
    });
  }

  return [collapsed, toggle];
}
