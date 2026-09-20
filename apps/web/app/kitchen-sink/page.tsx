'use client';

import { useState } from 'react';
import {
  axisK,
  Badge,
  Button,
  Card,
  CardActions,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Confirm,
  Empty,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FLAG_CODES,
  Flag,
  Input,
  InputGroup,
  InputGroupInput,
  Item,
  ItemActions,
  ItemDescription,
  ItemMedia,
  ItemTitle,
  Progress,
  PulseTile,
  PulseTileBadge,
  PulseTileLabel,
  PulseTileMeter,
  PulseTileSpark,
  PulseTileSub,
  PulseTileValue,
  SampleRankChart,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetCloseButton,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Spinner,
  Stat,
  StatLabel,
  StatSub,
  StatsRow,
  StatValue,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableCellSub,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  HelpMark,
} from '@procircuit/ui';
import { ThemeToggle } from './theme-toggle';

// Every component from step 0.4 of docs/BUILD-PLAN-CLAUDE-CODE.md, in both themes (toggle
// top right) and matching docs/procircuit-baseline.html. Not a route the product ships;
// this is the "done when" acceptance surface.
export default function KitchenSinkPage() {
  const [progress, setProgress] = useState(62);
  const [toastOpen, setToastOpen] = useState(false);

  return (
    <TooltipProvider>
      <ToastProvider>
        <div className="mx-auto flex max-w-[1200px] flex-col gap-10 px-4 py-8 sm:px-6">
          <header className="flex items-center gap-3 border-b border-border pb-4">
            <h1 className="text-xl font-medium tracking-[-0.015em]">Kitchen sink</h1>
            <p className="text-sm text-muted-foreground">Baseline components, both themes</p>
            <div className="ml-auto">
              <ThemeToggle />
            </div>
          </header>

          <Section title="Buttons">
            <div className="flex flex-wrap items-center gap-2">
              <Button>Primary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm">Small</Button>
              <Button size="sm" variant="outline">
                Small outline
              </Button>
              <Button size="icon" aria-label="Icon button">
                +
              </Button>
              <Button size="icon-sm" variant="outline" aria-label="Small icon button">
                +
              </Button>
              <Button disabled>Disabled</Button>
            </div>
          </Section>

          <Section title="Badges, chips, flags">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Default</Badge>
              <Badge variant="secondary">W75</Badge>
              <Badge variant="ok">Paid</Badge>
              <Badge variant="warn">Under 10 weeks</Badge>
              <Badge variant="danger">Overdue</Badge>
              <Badge variant="lime">Selected</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {FLAG_CODES.map((code) => (
                <span key={code} className="inline-flex items-center font-mono text-xs">
                  <Flag code={code} />
                  {code}
                </span>
              ))}
            </div>
          </Section>

          <Section title="Cards and the decision card">
            <Card>
              <CardHeader>
                <CardTitle>This week&apos;s decision · W75 Poznań</CardTitle>
                <CardDescription>
                  Tournament Agent&apos;s top pick of five, ranked by cost-to-prize. Entry closes
                  Fri 18 Sep, 23:59 CET.
                </CardDescription>
                <CardActions>
                  <Badge variant="warn">6 days</Badge>
                </CardActions>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-1.5">
                <Badge>
                  <Flag code="POL" size="badge" />
                  Poznań, POL
                </Badge>
                <Badge variant="secondary">Clay</Badge>
                <Badge variant="secondary">28 Sep – 4 Oct</Badge>
              </CardContent>
              <CardFooter>
                <Button>Accept entry</Button>
                <Button variant="outline">Withdraw</Button>
                <span className="ml-auto text-sm text-muted-foreground">
                  Accept opens a confirm step that logs A$1,360 as planned.
                </span>
              </CardFooter>
            </Card>

            <div className="grid grid-cols-3 gap-4 max-sm:grid-cols-1">
              <PulseTile tone="warn">
                <PulseTileLabel>Runway</PulseTileLabel>
                <PulseTileBadge>
                  <Badge variant="warn">Under 10 weeks</Badge>
                </PulseTileBadge>
                <PulseTileValue>
                  8.3 <small>weeks</small>
                </PulseTileValue>
                <PulseTileSub>A$9,450 reserves · A$1,140/wk net burn</PulseTileSub>
                <PulseTileMeter percent={42} />
              </PulseTile>
              <PulseTile>
                <PulseTileLabel>Decision required</PulseTileLabel>
                <PulseTileBadge>
                  <Badge variant="warn">Entry deadline</Badge>
                </PulseTileBadge>
                <PulseTileValue>
                  6 <small>days</small>
                </PulseTileValue>
                <PulseTileSub>W75 Poznań · confirm or withdraw by Fri 18 Sep</PulseTileSub>
                <PulseTileMeter percent={60} fillClassName="bg-foreground" />
              </PulseTile>
              <PulseTile>
                <PulseTileLabel>Patrons since last login</PulseTileLabel>
                <PulseTileBadge>
                  <Badge variant="ok">Healthy</Badge>
                </PulseTileBadge>
                <PulseTileValue>
                  +2 <small>new, 0 churned</small>
                </PulseTileValue>
                <PulseTileSub>Both joined Courtside after Thursday&apos;s update</PulseTileSub>
                <PulseTileSpark values={[30, 40, 35, 50, 45, 60, 30, 70, 65, 80, 75, 100]} />
              </PulseTile>
            </div>

            <StatsRow>
              <Stat>
                <StatLabel>Reserves</StatLabel>
                <StatValue>A$9,870</StatValue>
                <StatSub>as of this morning</StatSub>
              </Stat>
              <Stat>
                <StatLabel>Net burn</StatLabel>
                <StatValue>
                  A$1,140 <small>/wk</small>
                </StatValue>
                <StatSub>trailing 4 weeks</StatSub>
              </Stat>
              <Stat>
                <StatLabel>Ranking</StatLabel>
                <StatValue>#512</StatValue>
                <StatSub>−14 since last week</StatSub>
              </Stat>
              <Stat>
                <StatLabel>Patrons</StatLabel>
                <StatValue>24</StatValue>
                <StatSub>+2 this week</StatSub>
              </Stat>
            </StatsRow>
          </Section>

          <Section title="Tabs, toggle group, switch">
            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="schedule">Schedule</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>
              <TabsContent value="overview" className="pt-3 text-sm text-muted-foreground">
                Overview panel content.
              </TabsContent>
              <TabsContent value="schedule" className="pt-3 text-sm text-muted-foreground">
                Schedule panel content.
              </TabsContent>
              <TabsContent value="history" className="pt-3 text-sm text-muted-foreground">
                History panel content.
              </TabsContent>
            </Tabs>

            <ToggleGroup type="single" defaultValue="kg" className="flex flex-wrap gap-1.5">
              <ToggleGroupItem value="kg">kg</ToggleGroupItem>
              <ToggleGroupItem value="lb">lb</ToggleGroupItem>
            </ToggleGroup>

            <label className="flex items-center gap-2.5 text-sm">
              <Switch defaultChecked />
              Email me when a decision is due
            </label>
          </Section>

          <Section title="Fields">
            <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
              <Field>
                <FieldLabel htmlFor="ks-email">Email</FieldLabel>
                <Input id="ks-email" type="email" placeholder="you@example.com" />
                <FieldDescription>Used for magic-link sign-in.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="ks-search">Search</FieldLabel>
                <InputGroup>
                  <span aria-hidden="true">⌕</span>
                  <InputGroupInput id="ks-search" placeholder="Search tournaments" />
                </InputGroup>
              </Field>
              <Field>
                <FieldLabel>Tour</FieldLabel>
                <Select defaultValue="itf">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="itf">ITF</SelectItem>
                    <SelectItem value="atp">ATP Challenger</SelectItem>
                    <SelectItem value="wta">WTA 125</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>
                  Note <small>optional</small>
                </FieldLabel>
                <Textarea placeholder="Agent memos, insights and drafts…" />
              </Field>
            </div>
            <FieldGroup className="max-w-xs">
              <FieldLabel htmlFor="ks-runway">
                Runway
                <HelpMark label="Weeks until reserves reach zero at the current net burn" />
              </FieldLabel>
              <Input id="ks-runway" defaultValue="8.3 weeks" readOnly />
            </FieldGroup>
          </Section>

          <Section title="Tables and lists">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead numeric>Gross</TableHead>
                  <TableHead numeric>Fee</TableHead>
                  <TableHead numeric>Net</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-mono text-[0.8125rem] whitespace-nowrap">
                    12 Sep
                  </TableCell>
                  <TableCell numeric>A$612</TableCell>
                  <TableCell numeric className="text-muted-foreground">
                    −A$49
                  </TableCell>
                  <TableCell numeric tone="pos">
                    A$549
                  </TableCell>
                  <TableCell>
                    <Badge variant="ok">Paid</Badge>
                  </TableCell>
                </TableRow>
                <TableRow fresh>
                  <TableCell className="font-mono text-[0.8125rem] whitespace-nowrap">
                    5 Sep
                  </TableCell>
                  <TableCell numeric>A$554</TableCell>
                  <TableCell numeric className="text-muted-foreground">
                    −A$44
                  </TableCell>
                  <TableCell numeric tone="pos">
                    A$497
                  </TableCell>
                  <TableCell>
                    <Badge variant="ok">Paid</Badge>
                  </TableCell>
                </TableRow>
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-[0.8125rem] font-normal text-muted-foreground"
                  >
                    A footer states the rule behind the numbers.
                    <TableCellSub>A fresh row is tinted with 8 percent lime.</TableCellSub>
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>

            <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
              <Item>
                <ItemMedia>◐</ItemMedia>
                <ItemTitle>Item row</ItemTitle>
                <ItemDescription>
                  Media, title, description, actions. Secondary at 50 percent.
                </ItemDescription>
                <ItemActions>
                  <Button variant="ghost" size="sm">
                    Open
                  </Button>
                </ItemActions>
              </Item>
              <Empty icon={<span aria-hidden="true">∅</span>} title="Empty state">
                Says what would fill this and how. Never blank.
              </Empty>
            </div>
          </Section>

          <Section title="Feedback and overlays">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Progress value={progress} className="w-48" />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setProgress((p) => (p >= 100 ? 20 : p + 20))}
                >
                  Advance
                </Button>
              </div>
              <div className="flex items-center gap-2.5 text-sm">
                <Spinner />
                Transcribing, usually within twenty seconds
              </div>
              <div>
                <Button size="sm" onClick={() => setToastOpen(true)}>
                  Show toast
                </Button>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="w-fit cursor-help text-sm underline decoration-dotted underline-offset-4">
                    Stage 2 · Emerging
                  </span>
                </TooltipTrigger>
                <TooltipContent>Career stage, detected from your verified ranking</TooltipContent>
              </Tooltip>
              <Confirm
                title="Accept entry to W75 Poznań"
                description="A$1,360 logged as a planned expense. Runway after an R1 loss: 8.5 weeks. You can withdraw until Fri 18 Sep."
                actions={
                  <>
                    <Button size="sm">Confirm</Button>
                    <Button size="sm" variant="outline">
                      Back
                    </Button>
                  </>
                }
              />
            </div>
          </Section>

          <Section title="Sheets">
            <div className="flex flex-wrap gap-2">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline">Open notifications</Button>
                </SheetTrigger>
                <SheetContent side="right">
                  <SheetHeader>
                    <SheetTitle>Notifications</SheetTitle>
                    <SheetCloseButton />
                  </SheetHeader>
                  <SheetDescription className="px-5 text-sm text-muted-foreground">
                    Notification rail: day groups, For you and FYI filters.
                  </SheetDescription>
                  <SheetFooter>
                    <span>3 unread</span>
                    <Button size="sm" variant="ghost">
                      Mark all read
                    </Button>
                  </SheetFooter>
                </SheetContent>
              </Sheet>
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline">Open quick actions</Button>
                </SheetTrigger>
                <SheetContent side="bottom">
                  <SheetHeader>
                    <SheetTitle>Quick actions</SheetTitle>
                    <SheetCloseButton />
                  </SheetHeader>
                  <div className="flex flex-col gap-2 px-5 pb-5">
                    <Button variant="outline">Log a match</Button>
                    <Button variant="outline">Add an expense</Button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </Section>

          <Section title="Charts">
            <Card className="py-4">
              <CardHeader className="px-6">
                <CardTitle>Series and marks</CardTitle>
                <CardDescription>
                  Lime steps in order; the current point filled; projections dashed; defence weeks
                  in amber.
                </CardDescription>
              </CardHeader>
              <div className="px-6">
                <SampleRankChart />
              </div>
            </Card>
            <p className="font-mono text-sm text-muted-foreground">
              axisK(12500) = {axisK(12500)} · axisK(-4200) = {axisK(-4200)}
            </p>
          </Section>
        </div>

        <Toast open={toastOpen} onOpenChange={setToastOpen}>
          <ToastTitle className="font-medium">Coach link revoked</ToastTitle>
          <ToastDescription className="text-muted-foreground">
            Takes effect within a minute
          </ToastDescription>
          <ToastClose className="ml-auto text-muted-foreground" aria-label="Dismiss">
            ×
          </ToastClose>
        </Toast>
        <ToastViewport />
      </ToastProvider>
    </TooltipProvider>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex scroll-mt-8 flex-col gap-4">
      <h2 className="text-[1.375rem] font-medium tracking-[-0.015em]">{title}</h2>
      {children}
    </section>
  );
}
