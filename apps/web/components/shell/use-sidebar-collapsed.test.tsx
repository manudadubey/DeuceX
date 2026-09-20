import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useSidebarCollapsed } from './use-sidebar-collapsed';

describe('useSidebarCollapsed', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('starts expanded and toggles on demand', () => {
    const { result } = renderHook(() => useSidebarCollapsed());
    expect(result.current[0]).toBe(false);

    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);

    act(() => result.current[1]());
    expect(result.current[0]).toBe(false);
  });

  it('persists the collapsed state across mounts (pc.sidebar)', () => {
    const first = renderHook(() => useSidebarCollapsed());
    act(() => first.result.current[1]());
    expect(localStorage.getItem('pc.sidebar')).toBe('1');
    first.unmount();

    const second = renderHook(() => useSidebarCollapsed());
    expect(second.result.current[0]).toBe(true);
  });

  it('toggles on Cmd/Ctrl+B', () => {
    const { result } = renderHook(() => useSidebarCollapsed());

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true }));
    });
    expect(result.current[0]).toBe(true);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', metaKey: true }));
    });
    expect(result.current[0]).toBe(false);
  });
});
