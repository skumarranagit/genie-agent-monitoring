const asText = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return v.toString();
  return JSON.stringify(v);
};

export const toNumber = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const formatInt = (v: unknown): string => toNumber(v).toLocaleString();

export const formatPct = (num: unknown, den: unknown): string => {
  const d = toNumber(den);
  return d === 0 ? '—' : `${Math.round((toNumber(num) / d) * 100)}%`;
};

export const formatMs = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  const ms = toNumber(v);
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
};

export const formatTs = (v: unknown): string => {
  if (!v) return '—';
  const d = new Date(asText(v));
  return Number.isNaN(d.getTime())
    ? asText(v)
    : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const timeAgo = (v: unknown): string => {
  if (!v) return 'never';
  const mins = Math.round((Date.now() - new Date(asText(v)).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 48 ? `${hrs} h ago` : `${Math.round(hrs / 24)} d ago`;
};

/** Parse a JSON-array column (to_json(...) in SQL) into typed rows; returns [] on bad input. */
export function parseJsonArray<T>(v: unknown, guard: (x: unknown) => x is T): T[] {
  if (Array.isArray(v)) return v.filter(guard); // driver may hand back JSON already parsed
  if (typeof v !== 'string' || v === '') return [];
  try {
    const parsed: unknown = JSON.parse(v);
    return Array.isArray(parsed) ? parsed.filter(guard) : [];
  } catch {
    return [];
  }
}

export const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;

export const str = (r: Record<string, unknown>, k: string): string => {
  return asText(r[k]);
};

/** SQL BOOLEANs can arrive as "true"/"false" strings at runtime. */
export const toBool = (v: unknown): boolean => v === true || v === 'true' || v === 1 || v === '1';
