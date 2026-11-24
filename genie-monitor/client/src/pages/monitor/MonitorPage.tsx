import {
  useAnalyticsQuery,
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  BarChart,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { useState, type FormEvent } from 'react';
import { AlertCircle, Code2, MessageSquareText, Search, SearchX, StickyNote } from 'lucide-react';
import { formatInt, formatMs, formatPct, formatTs, timeAgo, toBool } from '../../lib/format';
import { resolveTokenColor } from '../../lib/tokenColor';
import { MessageDetail } from './MessageDetail';
import { RatingBadge } from './RatingBadge';

const ALL = '__all__';
const PERIODS = [
  { value: '1', label: 'Last 24 hours' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '0', label: 'All time' },
];
const RATINGS = [
  { value: ALL, label: 'All ratings' },
  { value: 'POSITIVE', label: 'Positive' },
  { value: 'NEGATIVE', label: 'Negative' },
  { value: 'NONE', label: 'Not rated' },
];

const fromSelect = (v: string) => (v === ALL ? '' : v);

function ErrorAlert({ title, error }: { title: string; error: unknown }) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{String(error)}</AlertDescription>
    </Alert>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'success' | 'destructive' }) {
  const toneClass = tone === 'success' ? 'text-success' : tone === 'destructive' ? 'text-destructive' : 'text-foreground';
  return (
    <Card className="gap-1 py-4">
      <CardHeader className="px-4 pb-0">
        <CardDescription className="text-xs">{label}</CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <div className={`text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export function MonitorPage() {
  const [space, setSpace] = useState<string>(ALL);
  const [days, setDays] = useState<string>('7');
  const [rating, setRating] = useState<string>(ALL);
  const [user, setUser] = useState<string>(ALL);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const agents = useAnalyticsQuery('agents', {});
  const usersParams = { space_id: sql.string(fromSelect(space)) };
  const users = useAnalyticsQuery('users', usersParams);

  // React Compiler memoizes these automatically
  const filters = {
    space_id: sql.string(fromSelect(space)),
    days: sql.number(Number(days)),
    rating: sql.string(fromSelect(rating)),
    user_email: sql.string(fromSelect(user)),
    search: sql.string(search.trim()),
  };
  const kpis = useAnalyticsQuery('kpis', filters);
  const daily = useAnalyticsQuery('daily_feedback', filters);
  const messages = useAnalyticsQuery('messages', filters);

  const k = kpis.data?.[0];
  const periodLabel = PERIODS.find((p) => p.value === days)?.label.toLowerCase() ?? '';
  const chartData = (daily.data ?? []).map((d) => ({
    day: d.day,
    Positive: Number(d.positive),
    Negative: Number(d.negative),
    'Not rated': Number(d.no_rating),
  }));

  // semantic tokens → rgb for ECharts (good = success, bad = destructive, none = muted)
  const feedbackColors = [
    resolveTokenColor('--success', 'rgb(16, 150, 110)'),
    resolveTokenColor('--destructive', 'rgb(220, 50, 40)'),
    resolveTokenColor('--muted-foreground', 'rgb(115, 115, 125)'),
  ];

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    setSearch(searchDraft);
  };

  const resetFilters = () => {
    setRating(ALL);
    setUser(ALL);
    setSearch('');
    setSearchDraft('');
    setDays('0');
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      {/* Header + freshness */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Genie Agent monitoring</h2>
          <p className="text-sm text-muted-foreground">
            Every question with its answer, reasoning, SQL, execution, lineage, feedback and audit trail.
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>Latest trace update {timeAgo(k?.last_ingested_ts)} · changes only when there is new Genie activity</div>
          <div className="font-mono">main.genie_monitoring.message_trace</div>
        </div>
      </div>

      {/* Filters */}
      <Card className="py-4">
        <CardContent className="grid grid-cols-1 gap-4 px-4 md:grid-cols-5">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="agent">Genie Agent</Label>
            <Select
              value={space}
              onValueChange={(v) => {
                setSpace(v);
                setUser(ALL);
              }}
            >
              <SelectTrigger id="agent" className="w-full">
                <SelectValue placeholder="All agents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All agents</SelectItem>
                {(agents.data ?? []).map((a) => (
                  <SelectItem key={a.space_id} value={a.space_id}>
                    {a.space_title || a.space_id} ({formatInt(a.messages)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {agents.error && <p className="text-xs text-destructive">Couldn&apos;t load agents: {String(agents.error)}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="period">Period</Label>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger id="period" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rating">Rating</Label>
            <Select value={rating} onValueChange={setRating}>
              <SelectTrigger id="rating" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RATINGS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="user">User</Label>
            <Select value={user} onValueChange={setUser}>
              <SelectTrigger id="user" className="w-full">
                <SelectValue placeholder="All users" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All users</SelectItem>
                {(users.data ?? []).map((u) => (
                  <SelectItem key={u.user_key} value={u.user_key}>
                    {u.user_key} ({formatInt(u.messages)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <form onSubmit={onSearch} className="flex items-end gap-2 md:col-span-5">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="search">Search prompts</Label>
              <Input
                id="search"
                placeholder="e.g. providers, HEDIS, MLR…"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
              />
            </div>
            <Button type="submit" variant="secondary">
              <Search className="h-4 w-4" /> Search
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* KPIs */}
      {kpis.error ? (
        <ErrorAlert title="Couldn't load summary" error={kpis.error} />
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {kpis.loading || !k ? (
            ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'].map((id) => <Skeleton key={id} className="h-24 w-full" />)
          ) : (
            <>
              <Kpi label="Questions" value={formatInt(k.messages)} sub={`${formatInt(k.conversations)} conversations · ${periodLabel}`} />
              <Kpi label="Users" value={formatInt(k.users)} sub={periodLabel} />
              <Kpi label="Thumbs up" value={formatInt(k.thumbs_up)} sub={`${formatPct(k.thumbs_up, k.messages)} of questions`} tone="success" />
              <Kpi
                label="Thumbs down"
                value={formatInt(k.thumbs_down)}
                sub={`${formatPct(k.thumbs_down, k.messages)} · ${formatInt(k.with_notes)} with notes`}
                tone={Number(k.thumbs_down) > 0 ? 'destructive' : undefined}
              />
              <Kpi label="Answered with SQL" value={formatPct(k.with_sql, k.messages)} sub={`${formatInt(k.failed)} failed`} />
              <Kpi label="Median SQL time" value={formatMs(k.p50_sql_ms)} sub="from system.query.history" />
            </>
          )}
        </div>
      )}

      {/* Daily feedback */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Questions per day by feedback</CardTitle>
          <CardDescription>Spikes in thumbs-down are the first place to look for instruction or data-model gaps.</CardDescription>
        </CardHeader>
        <CardContent>
          {daily.loading ? (
            <Skeleton className="h-56 w-full" />
          ) : daily.error ? (
            <ErrorAlert title="Couldn't load daily trend" error={daily.error} />
          ) : chartData.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No questions in this period.</p>
          ) : (
            <BarChart
              data={chartData}
              xKey="day"
              yKey={['Positive', 'Negative', 'Not rated']}
              stacked
              orientation="vertical"
              colors={feedbackColors}
              height={240}
              ariaLabel="Questions per day, stacked by feedback rating"
            />
          )}
        </CardContent>
      </Card>

      {/* Messages */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Questions</CardTitle>
          <CardDescription>Newest first · click a row for the full trace · showing up to 500</CardDescription>
        </CardHeader>
        <CardContent>
          {messages.loading ? (
            <div className="space-y-2">
              {['r1', 'r2', 'r3', 'r4', 'r5', 'r6'].map((id) => (
                <Skeleton key={id} className="h-10 w-full" />
              ))}
            </div>
          ) : messages.error ? (
            <ErrorAlert title="Couldn't load questions" error={messages.error} />
          ) : !messages.data?.length ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchX />
                </EmptyMedia>
                <EmptyTitle>No questions match these filters</EmptyTitle>
                <EmptyDescription>
                  Widen the period or clear filters. New questions appear after the next trace-ingest run.
                </EmptyDescription>
              </EmptyHeader>
              <Button variant="outline" onClick={resetFilters}>
                Clear filters
              </Button>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Time</TableHead>
                  <TableHead>Question</TableHead>
                  <TableHead className="hidden lg:table-cell">User</TableHead>
                  {space === ALL && <TableHead className="hidden xl:table-cell">Agent</TableHead>}
                  <TableHead className="w-28">Rating</TableHead>
                  <TableHead className="w-20 text-right">SQL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.data.map((m) => (
                  <TableRow
                    key={m.message_id}
                    className="cursor-pointer"
                    tabIndex={0}
                    onClick={() => setSelected(m.message_id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setSelected(m.message_id);
                    }}
                  >
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatTs(m.created_ts)}</TableCell>
                    <TableCell className="max-w-0 w-full">
                      <div className="flex items-start gap-2">
                        <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground">{m.prompt_preview}</div>
                          {m.answer_preview && (
                            <div className="truncate text-xs text-muted-foreground">{m.answer_preview}</div>
                          )}
                        </div>
                        {(toBool(m.has_error) || m.status !== 'COMPLETED') && <Badge variant="destructive">{m.status}</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="hidden truncate text-xs text-muted-foreground lg:table-cell">{m.user_key}</TableCell>
                    {space === ALL && (
                      <TableCell className="hidden truncate text-xs text-muted-foreground xl:table-cell">{m.space_title}</TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <RatingBadge rating={m.rating} />
                        {toBool(m.has_note) && <StickyNote className="h-3.5 w-3.5 text-muted-foreground" aria-label="has feedback note" />}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {Number(m.sql_count) > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <Code2 className="h-3.5 w-3.5" />
                          {m.sql_count}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-2xl">
          {selected && <MessageDetail messageId={selected} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
