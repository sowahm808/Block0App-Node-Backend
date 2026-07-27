const sensitive =
  /(pass(word|code)?|access.?token|refresh.?token|authorization|cookie|session|secret|api.?key|private.?key|reset.?link|ssn|diagnos(is|es)|medical.?record|protected.?health)/i;
const limits = { depth: 6, array: 50, string: 2000, keys: 100 };

export function sanitizeAuditValue(value: unknown, depth = 0): unknown {
  if (depth >= limits.depth) return '[TRUNCATED]';
  if (typeof value === 'string') return value.slice(0, limits.string);
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value))
    return value.slice(0, limits.array).map((item) => sanitizeAuditValue(item, depth + 1));
  if (typeof value !== 'object') return undefined;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, limits.keys)
      .map(([key, item]) => [
        key,
        sensitive.test(key) ? '[REDACTED]' : sanitizeAuditValue(item, depth + 1),
      ])
      .filter((entry) => entry[1] !== undefined),
  );
}

export function sanitizeAuditMetadata(value: unknown): unknown {
  const sanitized = sanitizeAuditValue(value);
  if (sanitized === undefined) return undefined;
  return Buffer.byteLength(JSON.stringify(sanitized)) <= 32_768
    ? sanitized
    : { truncated: true, reason: 'metadata_size_limit' };
}

export function sanitizeAuditDocument(id: string, data: Record<string, unknown>) {
  const safe = sanitizeAuditValue(data) as Record<string, unknown>;
  delete safe.ipAddress;
  delete safe.userAgent;
  return { id, ...safe };
}
