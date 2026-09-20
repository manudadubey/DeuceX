import {
  type HTMLAttributes,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
  forwardRef,
} from 'react';
import { cn } from '../lib/cn';

// `.tbl` / `.tbl-wrap` (Baseline §Tables and lists): hairline rows, mono right-aligned
// figures, never a sideways page scroll (the table itself scrolls instead).
export const TableWrap = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function TableWrap({ className, ...props }, ref) {
    return <div ref={ref} className={cn('overflow-x-auto', className)} {...props} />;
  },
);

export const Table = forwardRef<HTMLTableElement, HTMLAttributes<HTMLTableElement>>(function Table(
  { className, ...props },
  ref,
) {
  return (
    <TableWrap>
      <table ref={ref} className={cn('w-full border-collapse text-sm', className)} {...props} />
    </TableWrap>
  );
});

export const TableHeader = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(function TableHeader({ className, ...props }, ref) {
  return <thead ref={ref} className={className} {...props} />;
});

export const TableBody = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(function TableBody({ className, ...props }, ref) {
  return <tbody ref={ref} className={className} {...props} />;
});

export const TableFooter = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(function TableFooter({ className, ...props }, ref) {
  return (
    <tfoot
      ref={ref}
      className={cn('[&_td]:border-t [&_td]:border-border [&_td]:font-medium', className)}
      {...props}
    />
  );
});

export const TableRow = forwardRef<
  HTMLTableRowElement,
  HTMLAttributes<HTMLTableRowElement> & { fresh?: boolean }
>(function TableRow({ className, fresh, ...props }, ref) {
  return <tr ref={ref} className={cn(fresh && 'bg-chart-2/8', className)} {...props} />;
});

export const TableHead = forwardRef<
  HTMLTableCellElement,
  ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }
>(function TableHead({ className, numeric, ...props }, ref) {
  return (
    <th
      ref={ref}
      className={cn(
        'px-2 pb-2 text-left text-[0.8125rem] font-normal whitespace-nowrap text-muted-foreground',
        numeric && 'text-right font-mono',
        className,
      )}
      {...props}
    />
  );
});

export const TableCell = forwardRef<
  HTMLTableCellElement,
  TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean; tone?: 'pos' | 'neg' }
>(function TableCell({ className, numeric, tone, ...props }, ref) {
  return (
    <td
      ref={ref}
      className={cn(
        'border-t border-border px-2 py-2.5 align-middle',
        numeric && 'text-right font-mono tabular-nums',
        tone === 'pos' && 'text-ok',
        tone === 'neg' && 'text-danger',
        className,
      )}
      {...props}
    />
  );
});

export function TableCellSub({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('block text-xs text-muted-foreground', className)} {...props} />;
}
