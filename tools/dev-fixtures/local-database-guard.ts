import { promises as dns } from 'node:dns';

/**
 * Fail-closed "is this actually a local database" gate — the one piece of this tool's logic
 * that is security-load-bearing, so it is split into its own pure, unit-tested module rather
 * than inlined in the CLI entry point (`iris-audit-account.ts`).
 *
 * **Why this duplicates `isLoopbackOrigin` in `src/config/env.schema.ts` instead of importing
 * it.** This tool runs directly via Node's native TypeScript type-stripping (Node >= 24, no
 * build step — the `tools/seed-transcription` convention), which does two things
 * `src/config/env.schema.ts` is not written for: it requires every relative import to carry an
 * explicit extension (that file's own sibling imports do not), and it cannot execute
 * `experimentalDecorators` syntax at all — confirmed empirically (`SyntaxError: Invalid or
 * unexpected token` on the first `@Injectable()`/`@Entity()` it reaches), not assumed. Nothing
 * under `src/` is therefore reachable from this tool without a build step this tool
 * deliberately has none of. The two loopback spellings this file checks are kept in sync BY
 * HAND with `isLoopbackOrigin`'s — the same "nothing machine-compares the two" idiom
 * `user.entity.ts`'s `CHK_users_profile_shape` docblock already uses for its own migration
 * mirror.
 */

export interface LocalDatabaseTarget {
  readonly host: string;
  readonly port: string;
}

export class NonLocalDatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonLocalDatabaseError';
  }
}

const ALLOWED_LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * True only for the three conventional loopback spellings. IPv6's bracket form is unwrapped
 * first — `new URL('http://[::1]:5433').hostname` is the literal string `'[::1]'`, brackets
 * included, exactly the trap `isLoopbackOrigin`'s own docblock documents measuring.
 */
export function isLoopbackHostname(rawHostname: string): boolean {
  let hostname = rawHostname.toLowerCase();
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    hostname = hostname.slice(1, -1);
  }
  return ALLOWED_LOOPBACK_HOSTNAMES.has(hostname);
}

/** True only for a resolved address inside the loopback range: `127.0.0.0/8` or `::1`. */
export function isLoopbackAddress(address: string): boolean {
  if (address === '::1') return true;
  const ipv4 = address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ipv4);
}

/** Injectable so the spec can pin both the positive and the "hostname lies" negative case. */
export type DnsLookupFn = (
  hostname: string,
) => Promise<ReadonlyArray<{ address: string; family: number }>>;

const defaultLookup: DnsLookupFn = (hostname) => dns.lookup(hostname, { all: true });

/**
 * Refuses (throws {@link NonLocalDatabaseError}) unless BOTH hold: the URL's hostname literal is
 * a conventional loopback spelling, AND that hostname's actual DNS resolution is loopback too.
 * Neither check alone is the gate — the hard requirement this tool was built against is "never
 * trust an env var alone without also checking the actual resolved host", so a hostname that
 * merely READS `localhost` while some local override resolves it elsewhere is caught by the
 * second half, not assumed safe by the first.
 *
 * No writes happen before this resolves; the caller awaits it before opening any database
 * connection.
 */
export async function assertLocalDatabaseUrl(
  rawUrl: string,
  lookup: DnsLookupFn = defaultLookup,
): Promise<LocalDatabaseTarget> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new NonLocalDatabaseError('DATABASE_URL is not a valid URL — refusing to run.');
  }

  const hostname = parsed.hostname;
  if (!isLoopbackHostname(hostname)) {
    throw new NonLocalDatabaseError(
      `DATABASE_URL host "${hostname}" is not a conventional loopback spelling ` +
        `(localhost / 127.0.0.1 / ::1). Refusing to run against a non-local database.`,
    );
  }

  let resolved: ReadonlyArray<{ address: string; family: number }>;
  try {
    resolved = await lookup(hostname);
  } catch (error) {
    throw new NonLocalDatabaseError(
      `DATABASE_URL host "${hostname}" could not be resolved: ` +
        `${error instanceof Error ? error.message : String(error)}. Refusing to run.`,
    );
  }

  if (resolved.length === 0 || !resolved.every((entry) => isLoopbackAddress(entry.address))) {
    const addresses = resolved.map((entry) => entry.address).join(', ') || '(no address)';
    throw new NonLocalDatabaseError(
      `DATABASE_URL host "${hostname}" resolves to a non-loopback address (${addresses}). ` +
        `The hostname literal alone is never trusted — refusing to run.`,
    );
  }

  return { host: hostname, port: parsed.port || '5432' };
}
