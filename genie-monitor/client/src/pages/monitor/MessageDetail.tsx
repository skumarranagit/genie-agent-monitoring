import {
  useAnalyticsQuery,
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ScrollArea,
  Separator,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { AlertCircle, Database, MessageSquare, ShieldCheck } from 'lucide-react';
import { formatInt, formatMs, formatTs, isRecord, parseJsonArray, str } from '../../lib/format';
import { RatingBadge } from './RatingBadge';

/** Stable key for an agent step: type + tool name/call id + content prefix. */
const stepKey = (s: Record<string, unknown>): string =>
  [str(s, 'type'), str(s, 'name'), (str(s, 'arguments') || str(s, 'output')).slice(0, 80)].join('|');

/** Screen-reader title for the drawer while its content isn't ready (Radix Dialog requires one). */
function HiddenSheetHeader({ title, description }: { title: string; description: string }) {
  return (
    <SheetHeader className="sr-only">
      <SheetTitle>{title}</SheetTitle>
      <SheetDescription>{description}</SheetDescription>
    </SheetHeader>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </div>
  );
}

function Pre({ children }: { children: string }) {
  return (
    <pre className="whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-3 font-mono text-xs text-foreground">
      {children}
    </pre>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium text-foreground break-all">{v || '—'}</span>
    </div>
  );
}

export function MessageDetail({ messageId }: { messageId: string }) {
  const params = { message_id: sql.string(messageId) };
  const { data, loading, error } = useAnalyticsQuery('message_detail', params);

  if (loading)
    return (
      <div className="space-y-3 p-4">
        <HiddenSheetHeader title="Loading message trace" description="Fetching prompt, SQL, lineage and feedback" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  if (error)
    return (
      <Alert variant="destructive" className="m-4">
        <HiddenSheetHeader title="Message trace unavailable" description="The trace for this message could not be loaded" />
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Couldn&apos;t load this message</AlertTitle>
        <AlertDescription>{String(error)}</AlertDescription>
      </Alert>
    );
  const row = data?.[0];
  if (!row)
    return (
      <div className="p-4">
        <HiddenSheetHeader title="Message not found" description="This message is not in the trace table" />
        <p className="text-sm text-muted-foreground">Message not found in the trace table.</p>
      </div>
    );
  const r: Record<string, unknown> = { ...row };

  const thoughts = parseJsonArray(r.thoughts_json, isRecord);
  const queries = parseJsonArray(r.queries_json, isRecord);
  const exec = parseJsonArray(r.exec_json, isRecord);
  const lineage = parseJsonArray(r.lineage_json, isRecord);
  const notes = parseJsonArray(r.notes_json, isRecord);
  const steps = parseJsonArray(r.steps_json, isRecord);
  const execById = new Map(exec.map((e) => [str(e, 'statement_id'), e]));

  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="space-y-2 border-b">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{str(r, 'conversation_type') || 'CHAT'}</Badge>
          <Badge variant={str(r, 'status') === 'COMPLETED' ? 'outline' : 'destructive'}>{str(r, 'status')}</Badge>
          <RatingBadge rating={str(r, 'feedback_rating')} />
        </div>
        <SheetTitle className="text-base leading-snug">{str(r, 'prompt_text')}</SheetTitle>
        <SheetDescription>
          {str(r, 'user_email') || `user ${str(r, 'user_id')}`} · {formatTs(r.created_ts)} · {str(r, 'space_title')}
        </SheetDescription>
      </SheetHeader>

      <Tabs defaultValue="trace" className="flex min-h-0 flex-1 flex-col px-4 pt-3">
        <TabsList>
          <TabsTrigger value="trace">Trace</TabsTrigger>
          <TabsTrigger value="sql">SQL ({queries.length})</TabsTrigger>
          <TabsTrigger value="feedback">Feedback ({notes.filter((n) => str(n, 'content')).length})</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>
        <ScrollArea className="min-h-0 flex-1 pb-6">
          <TabsContent value="trace" className="space-y-5 pt-3">
            <Section title="Prompt">
              <Pre>{str(r, 'prompt_text')}</Pre>
            </Section>
            {thoughts.length > 0 && (
              <Section title="Genie reasoning">
                <div className="space-y-2">
                  {thoughts.map((t) => (
                    <div key={`${str(t, 'type')}-${str(t, 'content').slice(0, 80)}`} className="rounded-md border p-2">
                      <div className="text-xs font-medium text-muted-foreground">
                        {str(t, 'type').replace('THOUGHT_TYPE_', '').replace('_', ' ')}
                      </div>
                      <div className="whitespace-pre-wrap text-sm text-foreground">{str(t, 'content')}</div>
                    </div>
                  ))}
                </div>
              </Section>
            )}
            {steps.length > 0 && (
              <Section title="Agent steps">
                <ol className="space-y-2">
                  {steps.map((s, i) => (
                    <li key={stepKey(s)} className="rounded-md border p-2 text-sm">
                      <span className="font-medium text-foreground">
                        {i + 1}. {str(s, 'type')}
                        {str(s, 'name') ? ` · ${str(s, 'name')}` : ''}
                      </span>
                      {(str(s, 'arguments') || str(s, 'output')) && (
                        <div className="mt-1 line-clamp-6 whitespace-pre-wrap font-mono text-xs text-muted-foreground">
                          {str(s, 'arguments') || str(s, 'output')}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </Section>
            )}
            <Section title="Answer">
              {str(r, 'answer_text') ? (
                <Pre>{str(r, 'answer_text')}</Pre>
              ) : (
                <p className="text-sm text-muted-foreground">No text answer captured (result returned as table/chart).</p>
              )}
              <p className="text-xs text-muted-foreground">AI-generated by Genie — verify against the SQL before relying on it.</p>
            </Section>
            <Section title="Data used (lineage)">
              {lineage.length ? (
                <div className="flex flex-wrap gap-2">
                  {lineage.map((l) => (
                    <Badge key={`${str(l, 'name')}-${str(l, 'type')}`} variant="outline" className="gap-1 font-mono text-xs">
                      <Database className="h-3 w-3" />
                      {str(l, 'name')}
                      <span className="text-muted-foreground">{str(l, 'type')}</span>
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {queries.length ? 'Not in system.access.table_lineage yet (lags ~10–60 min).' : 'No SQL ran for this message.'}
                </p>
              )}
            </Section>
          </TabsContent>

          <TabsContent value="sql" className="space-y-4 pt-3">
            {queries.length === 0 && <p className="text-sm text-muted-foreground">Genie did not run SQL for this message.</p>}
            {queries.map((q, i) => {
              const e = execById.get(str(q, 'statement_id'));
              return (
                <Card key={str(q, 'attachment_id') || str(q, 'statement_id') || `q-${i}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{str(q, 'title') || `Query ${i + 1}`}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Pre>{str(q, 'sql')}</Pre>
                    <div className="grid grid-cols-1 gap-1">
                      <KV k="Statement ID" v={str(q, 'statement_id')} />
                      <KV k="Rows returned" v={formatInt(q.row_count)} />
                      {e ? (
                        <>
                          <KV k="Executed by" v={str(e, 'executed_by')} />
                          <KV k="Duration" v={formatMs(e.duration_ms)} />
                          <KV k="Rows read" v={formatInt(e.read_rows)} />
                          <KV k="Warehouse" v={str(e, 'warehouse_id')} />
                          <KV k="Status" v={str(e, 'status')} />
                          <KV k="Started" v={formatTs(e.start_time)} />
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Execution stats not in system.query.history yet (lags ~10–60 min).
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="feedback" className="space-y-4 pt-3">
            <div className="flex items-center gap-3">
              <RatingBadge rating={str(r, 'feedback_rating')} />
              {r.feedback_ts ? <span className="text-xs text-muted-foreground">rated {formatTs(r.feedback_ts)}</span> : null}
            </div>
            {notes.length === 0 && <p className="text-sm text-muted-foreground">No feedback notes on this message.</p>}
            {notes.map((n, i) => (
              <div key={str(n, 'comment_id') || `n-${i}`} className="rounded-md border p-3">
                <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <MessageSquare className="h-3 w-3" />
                  {formatTs(n.created_ts)}
                  {str(n, 'comment_type') && <Badge variant="secondary">{str(n, 'comment_type')}</Badge>}
                </div>
                <p className="text-sm text-foreground">
                  {str(n, 'content') || <span className="italic text-muted-foreground">(empty note)</span>}
                </p>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="audit" className="space-y-2 pt-3">
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4" /> From system.access.audit (service aibiGenie)
            </div>
            <KV k="User" v={str(r, 'user_email') || str(r, 'user_id')} />
            <KV k="Audit action" v={str(r, 'audit_create_action')} />
            <KV k="Audit time" v={formatTs(r.audit_create_ts)} />
            <KV k="Source IP" v={str(r, 'source_ip')} />
            <KV k="User agent" v={str(r, 'user_agent')} />
            <Separator className="my-3" />
            <KV k="Space ID" v={str(r, 'space_id')} />
            <KV k="Conversation ID" v={str(r, 'conversation_id')} />
            <KV k="Message ID" v={str(r, 'message_id')} />
            <KV k="Trace ingested" v={formatTs(r.ingested_at)} />
            {!r.audit_create_ts && (
              <p className="pt-2 text-xs text-muted-foreground">
                No create event yet — audit lags ~10–60 min, and questions routed from Genie One have no aibiGenie create
                event.
              </p>
            )}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
