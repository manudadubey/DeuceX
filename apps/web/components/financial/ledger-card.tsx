'use client';

import { useMemo, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  Field,
  FieldLabel,
  Input,
  InputGroup,
  InputGroupInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  TableWrap,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@deucex/ui';
import { insertLedgerLine, type LedgerCategory } from '@deucex/db';
import type { ReceiptProposal } from '@deucex/agents';
import { createClient } from '@/lib/supabase/client';
import {
  ReceiptExtractionFailedError,
  requestFinancialRecompute,
  scanReceipt,
} from '@/lib/financial/api';
import type { FinancialSnapshot } from '@/lib/financial/load';

const CATEGORIES: LedgerCategory[] = [
  'travel',
  'accommodation',
  'coaching',
  'equipment',
  'food',
  'physio',
  'entry_fees',
  'other',
];

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

type LedgerTab = 'expenses' | 'prize' | 'patron';

interface ManualEntryState {
  amount: string;
  what: string;
  category: LedgerCategory;
  date: string;
  tournamentLabel: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyManualEntry(): ManualEntryState {
  return { amount: '', what: '', category: 'other', date: today(), tournamentLabel: 'none' };
}

// PRD-03 §4.1's Ledger card (F-11 to F-15): manual entry, receipt scanning
// (a client-driven sequential queue over the synchronous
// /financial/receipts call, per F-12's "processes one at a time with the
// position shown" — see apps/api/src/financial/receipts.ts's own comment on
// why there's no server-side batch job for this), and the three tabs.
export function LedgerCard({
  playerId,
  homeCurrency,
  ledgerLines,
  pendingReceivables,
  budgetLabels,
  isFree,
  onToast,
  onSaved,
}: {
  playerId: string;
  homeCurrency: string;
  ledgerLines: FinancialSnapshot['ledgerLines'];
  pendingReceivables: FinancialSnapshot['pendingReceivables'];
  budgetLabels: string[];
  isFree: boolean;
  onToast: (title: string) => void;
  onSaved: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<LedgerTab>('expenses');
  const [manual, setManual] = useState<ManualEntryState>(emptyManualEntry());
  const [saving, setSaving] = useState(false);

  const [queue, setQueue] = useState<File[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [review, setReview] = useState<ReceiptProposal | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const afterSave = (toastText: string) => {
    onToast(toastText);
    onSaved();
    void requestFinancialRecompute(supabase);
  };

  const handleManualSave = async () => {
    const parsed = Number(manual.amount);
    if (!(parsed > 0)) return;
    setSaving(true);
    try {
      await insertLedgerLine(supabase, {
        playerId,
        date: manual.date,
        category: manual.category,
        what: manual.what || manual.category,
        amountOriginal: parsed,
        currencyOriginal: homeCurrency,
        source: 'manual',
        tournamentId: manual.tournamentLabel === 'none' ? null : manual.tournamentLabel,
      });
      setManual(emptyManualEntry());
      afterSave(`Logged ${formatMoney(parsed, homeCurrency)}`);
    } finally {
      setSaving(false);
    }
  };

  const processReceiptAt = async (files: File[], index: number) => {
    if (index >= files.length) {
      setQueue([]);
      setQueueIndex(0);
      return;
    }
    setScanning(true);
    setReview(null);
    try {
      const { proposal } = await scanReceipt(supabase, files[index]!);
      setReview(proposal);
    } catch (err) {
      if (err instanceof ReceiptExtractionFailedError) {
        onToast("We couldn't read this one. Type it in or skip it.");
        setReview({
          merchant: '',
          amount: 0,
          currency: homeCurrency,
          date: today(),
          category: 'other',
          tournamentLabel: null,
          unsureFields: ['merchant', 'amount', 'currency', 'date', 'category'],
        });
      } else {
        throw err;
      }
    } finally {
      setScanning(false);
    }
  };

  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setQueue(list);
    setQueueIndex(0);
    void processReceiptAt(list, 0);
  };

  const handleReceiptSave = async () => {
    if (!review) return;
    if (!(review.amount > 0)) return;
    setSaving(true);
    try {
      await insertLedgerLine(supabase, {
        playerId,
        date: review.date,
        category: review.category,
        what: review.merchant || review.category,
        amountOriginal: review.amount,
        currencyOriginal: review.currency,
        source: 'scanned',
        unsureFields: review.unsureFields,
      });
      // The toast shows the original currency amount; home-currency
      // conversion is always a read-time lookup (ledger.ts's
      // convertLedgerLine), never computed here.
      afterSave(
        review.unsureFields.length > 0
          ? `Read ${formatMoney(review.amount, review.currency)} from ${review.merchant} · ${review.unsureFields.length} field${review.unsureFields.length > 1 ? 's' : ''} to check`
          : `Logged ${formatMoney(review.amount, review.currency)}`,
      );
      const nextIndex = queueIndex + 1;
      setQueueIndex(nextIndex);
      await processReceiptAt(queue, nextIndex);
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    const nextIndex = queueIndex + 1;
    setQueueIndex(nextIndex);
    await processReceiptAt(queue, nextIndex);
  };

  const handleCancelQueue = () => {
    setQueue([]);
    setQueueIndex(0);
    setReview(null);
  };

  const check = (field: string) => review?.unsureFields.includes(field as never);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Ledger</CardTitle>
            <CardDescription>Expenses, prize income and patron MRR.</CardDescription>
          </div>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFilesSelected(e.target.files)}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={isFree}
              onClick={() => fileInputRef.current?.click()}
            >
              Scan receipt
            </Button>
          </div>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as LedgerTab)} className="mt-2">
          <TabsList>
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
            <TabsTrigger value="prize">Prize income</TabsTrigger>
            <TabsTrigger value="patron">Patron MRR</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>

      <div className="flex flex-col gap-4 px-6">
        {queue.length > 0 && review && (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-secondary/40 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                Check what was read · nothing counts until you save
              </p>
              <Badge variant="secondary">
                Receipt {queueIndex + 1} of {queue.length}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel>
                  Amount {check('amount') && <Badge variant="warn">Check</Badge>}
                </FieldLabel>
                <Input
                  type="number"
                  value={review.amount}
                  onChange={(e) => setReview({ ...review, amount: Number(e.target.value) })}
                />
              </Field>
              <Field>
                <FieldLabel>
                  Currency {check('currency') && <Badge variant="warn">Check</Badge>}
                </FieldLabel>
                <Input
                  value={review.currency}
                  onChange={(e) => setReview({ ...review, currency: e.target.value.toUpperCase() })}
                />
              </Field>
              <Field>
                <FieldLabel>
                  What {check('merchant') && <Badge variant="warn">Check</Badge>}
                </FieldLabel>
                <Input
                  value={review.merchant}
                  onChange={(e) => setReview({ ...review, merchant: e.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel>
                  Category {check('category') && <Badge variant="warn">Check</Badge>}
                </FieldLabel>
                <Select
                  value={review.category}
                  onValueChange={(v) => setReview({ ...review, category: v as LedgerCategory })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Date {check('date') && <Badge variant="warn">Check</Badge>}</FieldLabel>
                <Input
                  type="date"
                  value={review.date}
                  onChange={(e) => setReview({ ...review, date: e.target.value })}
                />
              </Field>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleReceiptSave}
                disabled={saving || !(review.amount > 0)}
              >
                Save
              </Button>
              {queue.length > 1 && (
                <Button size="sm" variant="ghost" onClick={handleSkip}>
                  Skip this one
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={handleCancelQueue}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {scanning && <p className="text-sm text-muted-foreground">Reading receipt…</p>}

        {tab === 'expenses' && (
          <>
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-secondary/30 p-4 sm:grid-cols-5">
              <Field>
                <FieldLabel>Amount</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    type="number"
                    inputMode="decimal"
                    value={manual.amount}
                    onChange={(e) => setManual({ ...manual, amount: e.target.value })}
                  />
                </InputGroup>
              </Field>
              <Field>
                <FieldLabel>What</FieldLabel>
                <Input
                  value={manual.what}
                  onChange={(e) => setManual({ ...manual, what: e.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel>Category</FieldLabel>
                <Select
                  value={manual.category}
                  onValueChange={(v) => setManual({ ...manual, category: v as LedgerCategory })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Tournament</FieldLabel>
                <Select
                  value={manual.tournamentLabel}
                  onValueChange={(v) => setManual({ ...manual, tournamentLabel: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {budgetLabels.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Date</FieldLabel>
                <Input
                  type="date"
                  value={manual.date}
                  onChange={(e) => setManual({ ...manual, date: e.target.value })}
                />
              </Field>
            </div>
            <Button
              onClick={handleManualSave}
              disabled={isFree || saving || !(Number(manual.amount) > 0)}
              className="self-start"
            >
              Save
            </Button>

            {ledgerLines.length === 0 ? (
              <Empty title="No expenses logged yet">Enter one manually or scan a receipt.</Empty>
            ) : (
              <TableWrap>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>What</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Tournament</TableHead>
                      <TableHead>Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledgerLines
                      .slice()
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .slice(0, 20)
                      .map((line) => (
                        <TableRow key={line.id}>
                          <TableCell>{line.date}</TableCell>
                          <TableCell>{line.what}</TableCell>
                          <TableCell>{line.category}</TableCell>
                          <TableCell>{line.label ?? '–'}</TableCell>
                          <TableCell>−{formatMoney(line.amountHome, homeCurrency)}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={4}>{ledgerLines.length} expenses</TableCell>
                      <TableCell>
                        −
                        {formatMoney(
                          ledgerLines.reduce((sum, l) => sum + l.amountHome, 0),
                          homeCurrency,
                        )}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </TableWrap>
            )}
          </>
        )}

        {tab === 'prize' && (
          <>
            {pendingReceivables.length === 0 ? (
              <Empty title="No prize income pending">
                A prize receivable appears here once created from results.
              </Empty>
            ) : (
              <div className="flex flex-col gap-2">
                {pendingReceivables.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-sm">
                    <span>
                      {r.label} · {r.round}
                    </span>
                    <Badge variant="secondary">Pending · {r.expectedDate}</Badge>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'patron' && (
          <Empty title="Patron MRR isn't live yet">
            Fans (Stripe Connect payouts) arrives in a later step.
          </Empty>
        )}
      </div>
    </Card>
  );
}
