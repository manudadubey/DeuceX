import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Sidebar } from './sidebar';

vi.mock('next/navigation', () => ({
  usePathname: () => '/match-scribe',
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('Sidebar', () => {
  it('marks the current route active and leaves the rest inactive', () => {
    render(<Sidebar collapsed={false} email="arya@example.com" />);

    const active = screen.getByRole('link', { name: /match scribe/i });
    expect(active).toHaveAttribute('aria-current', 'page');

    const inactive = screen.getByRole('link', { name: /dashboard/i });
    expect(inactive).not.toHaveAttribute('aria-current');
  });

  it('shows the signed-in email and hides it when collapsed', () => {
    const { rerender } = render(<Sidebar collapsed={false} email="arya@example.com" />);
    expect(screen.getByText('arya@example.com')).toBeInTheDocument();

    rerender(<Sidebar collapsed email="arya@example.com" />);
    expect(screen.queryByText('arya@example.com')).not.toBeInTheDocument();
  });
});
