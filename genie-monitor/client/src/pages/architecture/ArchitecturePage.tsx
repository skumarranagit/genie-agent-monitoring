import {
  useAnalyticsQuery,
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@databricks/appkit-ui/react';
import {
  Activity,
  AlertCircle,
  ArrowDown,
  ArrowRight,
  Clock,
  Database,
  FileJson,
  KeyRound,
  Layers,
  MessagesSquare,
  MonitorSmartphone,
  ScrollText,
  ShieldCheck,
  Timer,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { formatInt, formatPct, formatTs, timeAgo } from '../../lib/format';

/* ---------- diagram building blocks ---------- */

type Node = { icon: LucideIcon; title: string; detail: string; mono?: boolean };

function NodeRow({ icon: Icon, title, detail, mono }: Node) {
  return (
    <div className="flex items-start gap-3 rounded-md border bg-background p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <div className={`text-sm font-medium text-foreground ${mono ? 'font-mono text-xs' : ''}`}>{title}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function Stage({
  step,
  title,
  subtitle,
  nodes,
  footer,
  className = 'h-full',
}: {
  className?: string;
  step: string;
  title: string;
  subtitle: string;
  nodes: Node[];
  footer?: React.ReactNode;
}) {
  return (
    <Card className={`gap-3 bg-muted/30 ${className}`}>
      <CardHeader className="pb-0">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="tabular-nums">
            {step}
          </Badge>
          <CardTitle className="text-sm">{title}</CardTitle>
        </div>
        <CardDescription className="text-xs">{subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {nodes.map((n) => (
          <NodeRow key={n.title} {...n} />
        ))}
        {footer}
      </CardContent>
    </Card>
  );
}

function Connector({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-1 lg:px-1 lg:py-0" aria-hidden="true">
      <div className="flex flex-row items-center gap-1 text-muted-foreground lg:flex-col">
        <ArrowDown className="h-5 w-5 lg:hidden" />
        <ArrowRight className="hidden h-5 w-5 lg:block" />
        <span className="max-w-24 text-center text-[10px] leading-tight">{label}</span>
      </div>
    </div>
  );
}

/* ---------- content ---------- */

const SOURCES: Node[] = [
  { icon: MessagesSquare, title: 'GET …/spaces/{id}/conversations', detail: 'include_all=true · every user (needs CAN MANAGE)', mono: true },
  { icon: FileJson, title: 'GET …/conversations/{cid}/messages', detail: 'prompt, SQL attachments, reasoning, Chat answer', mono: true },
  { icon: Workflow, title: 'GET /genie/agents/{id}/…/items', detail: 'Agent mode: answer + reasoning + tool calls', mono: true },
  { icon: ScrollText, title: 'GET …/conversations/{cid}/list-comments', detail: 'feedback notes / review requests', mono: true },
  { icon: Users, title: 'SCIM users.get(user_id)', detail: 'email fallback (Genie One–routed questions)', mono: true },
];

const SYSTEM: Node[] = [
  { icon: Timer, title: 'system.query.history', detail: 'executed_by, duration, rows read, warehouse', mono: true },
  { icon: Layers, title: 'system.access.table_lineage', detail: 'tables + METRIC_VIEW read by each statement', mono: true },
  { icon: ShieldCheck, title: 'system.access.audit', detail: "service 'aibiGenie': create event, IP, user agent", mono: true },
];

const INGEST: Node[] = [
  { icon: Clock, title: 'Serverless job · every 30 min', detail: 'genie_trace_ingest · lookback 2 days · 1 concurrent run' },
  { icon: FileJson, title: '1 · Extract', detail: 'API calls per conversation → raw JSON appended to bronze' },
  { icon: Users, title: '2 · Flatten', detail: '1 row per message; Agent items split by user turn; notes attached' },
  { icon: KeyRound, title: '3 · Enrich', detail: 'join system tables on statement_id / message_id' },
  { icon: Database, title: '4 · MERGE on message_id', detail: 'idempotent; keeps earlier enrichment if system tables lag' },
];

const STORAGE: Node[] = [
  { icon: FileJson, title: 'genie_api_raw', detail: 'Bronze · append-only raw payloads · survives conversation deletion', mono: true },
  { icon: Database, title: 'message_trace', detail: 'Silver · prompt → reasoning → SQL → exec → lineage → answer → feedback → audit', mono: true },
];

const CONSUME: Node[] = [
  { icon: MonitorSmartphone, title: 'genie-monitor app', detail: 'AppKit · queries via SQL warehouse as the app service principal' },
  { icon: Activity, title: 'Monitor page', detail: 'filter by agent / period / rating / user; per-message trace drawer' },
  { icon: ShieldCheck, title: 'Access', detail: 'SP has USE CATALOG + USE SCHEMA + SELECT on genie_monitoring only' },
];

const JOIN_KEYS = [
  { from: 'message.attachments[].query.statement_id', to: 'system.query.history.statement_id', gives: 'who ran it, duration, rows, warehouse' },
  { from: 'statement_id', to: 'system.access.table_lineage.statement_id', gives: 'tables / metric views read' },
  { from: 'message_id', to: "audit request_params.message_id (or response.result)", gives: 'create event, IP, user agent, feedback time' },
  { from: 'message.user_id', to: 'SCIM users', gives: 'email when audit has none' },
  { from: 'items[].metadata.message_id', to: 'message_id', gives: 'Agent-mode steps grouped per user turn' },
];

const GOTCHAS = [
  'System tables lag ~10–60 min — the 2-day lookback re-fills exec, lineage and audit on later runs.',
  'Agent-mode narrative answers exist only in /items; the messages endpoint returns SQL + viz.',
  'Audit never contains prompt text — the Conversation API is the only source of text.',
  'Questions routed from Genie One have no aibiGenie create event (logged as genieChat.createGenieChatResponse).',
  'Deleting a conversation in Genie deletes it for everyone — bronze keeps the raw copy.',
];

/* ---------- page ---------- */

export function ArchitecturePage() {
  const stats = useAnalyticsQuery('pipeline_stats', {});
  const s = stats.data?.[0];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Ingestion architecture</h2>
        <p className="text-sm text-muted-foreground">
          How each Genie message becomes one fully traced row: the Conversation API supplies the text, system tables supply
          execution, lineage and audit.
        </p>
      </div>

      {/* Live pipeline health */}
      {stats.error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Couldn&apos;t load pipeline stats</AlertTitle>
          <AlertDescription>{String(stats.error)}</AlertDescription>
        </Alert>
      ) : stats.loading || !s ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={`sk-${i}`} className="h-20 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Card className="gap-1 py-4">
            <CardContent className="px-4">
              <div className="text-xs text-muted-foreground">Last ingest</div>
              <div className="text-xl font-semibold text-foreground">{timeAgo(s.last_ingested_ts)}</div>
              <div className="text-xs text-muted-foreground">{formatTs(s.last_ingested_ts)} · {formatInt(s.ingest_runs)} runs</div>
            </CardContent>
          </Card>
          <Card className="gap-1 py-4">
            <CardContent className="px-4">
              <div className="text-xs text-muted-foreground">Traced messages</div>
              <div className="text-xl font-semibold tabular-nums text-foreground">{formatInt(s.messages)}</div>
              <div className="text-xs text-muted-foreground">
                {formatInt(s.conversations)} conversations · {formatInt(s.agents)} agent(s)
              </div>
            </CardContent>
          </Card>
          <Card className="gap-1 py-4">
            <CardContent className="px-4">
              <div className="text-xs text-muted-foreground">Enrichment coverage</div>
              <div className="text-xl font-semibold tabular-nums text-foreground">{formatPct(s.with_exec, s.messages)}</div>
              <div className="text-xs text-muted-foreground">
                exec · lineage {formatPct(s.with_lineage, s.messages)} · audit {formatPct(s.with_audit, s.messages)}
              </div>
            </CardContent>
          </Card>
          <Card className="gap-1 py-4">
            <CardContent className="px-4">
              <div className="text-xs text-muted-foreground">Raw payloads (bronze)</div>
              <div className="text-xl font-semibold tabular-nums text-foreground">{formatInt(s.raw_payloads)}</div>
              <div className="text-xs text-muted-foreground">
                {formatInt(s.raw_messages)} messages · {formatInt(s.raw_items)} items · {formatInt(s.raw_comments)} comments
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      <p className="-mt-3 text-xs text-muted-foreground">
        Exec coverage is relative to all messages; messages with no SQL (clarifications, refusals) never get exec/lineage rows.
      </p>

      {/* Flow diagram */}
      <div
        className="grid grid-cols-1 items-stretch gap-2 lg:grid-cols-[1.35fr_auto_1fr_auto_1fr_auto_1fr]"
        role="img"
        aria-label="Flow: Genie Conversation API and system tables feed a scheduled ingest job, which writes bronze and silver Delta tables read by the genie-monitor app"
      >
        <div className="flex flex-col gap-2">
          <Stage className="" step="1" title="Genie Conversation API" subtitle="Text, reasoning, SQL, feedback (REST, per space)" nodes={SOURCES} />
          <Stage className="flex-1" step="1b" title="System tables" subtitle="Execution, lineage, audit (lag ~10–60 min)" nodes={SYSTEM} />
        </div>
        <Connector label="REST + SQL joins" />
        <Stage step="2" title="Ingest job" subtitle="01_genie_trace_ingest notebook (Python, serverless)" nodes={INGEST} />
        <Connector label="append + MERGE" />
        <Stage
          step="3"
          title="Unity Catalog · Delta"
          subtitle="main.genie_monitoring"
          nodes={STORAGE}
          footer={
            <p className="pt-1 text-xs text-muted-foreground">
              Clustered by (space_id, created_ts). Arrays: thoughts, queries, agent_steps, exec, lineage_sources, feedback_notes.
            </p>
          }
        />
        <Connector label="SQL warehouse" />
        <Stage step="4" title="Consumption" subtitle="This app" nodes={CONSUME} />
      </div>

      {/* Join keys */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-primary" /> How the sources join
          </CardTitle>
          <CardDescription>One message = one row; these keys stitch the API payload to the system tables.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Adds</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {JOIN_KEYS.map((j) => (
                <TableRow key={j.from + j.to}>
                  <TableCell className="font-mono text-xs">{j.from}</TableCell>
                  <TableCell className="font-mono text-xs">{j.to}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{j.gives}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Gotchas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertCircle className="h-4 w-4 text-warning" /> Design notes &amp; gotchas
          </CardTitle>
          <CardDescription>Verified against a demo health-plan agent (synthetic data), Nov 2026.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-foreground">
            {GOTCHAS.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
