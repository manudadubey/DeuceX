import { BareShell } from '@/components/shell/bare-shell';

export default function BareLayout({ children }: { children: React.ReactNode }) {
  return <BareShell>{children}</BareShell>;
}
