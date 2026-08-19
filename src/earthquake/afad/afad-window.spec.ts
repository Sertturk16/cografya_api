import { describe, expect, it } from '@jest/globals';
import { EarthquakeIngestJobKind } from '../earthquake.types';
import type { EarthquakeUpstreamConfig } from '../earthquake-upstream.config';
import { AFAD_TDVMS_BUDGET } from '../earthquake-upstream.config';
import { buildAfadEventFilterUrl, buildAfadWindow } from './afad-window';

const NOW = Date.UTC(2026, 7, 11, 12, 0, 0);

const CONFIG: EarthquakeUpstreamConfig = {
  enabled: true,
  ingestEnabled: true,
  baseUrl: 'https://example.invalid/apigateway/deprem/apiv2',
  recentIntervalSeconds: 300,
  reconcileIntervalSeconds: 21_600,
  tourDeadlineMs: 120_000,
  recentWindowHours: 6,
  reconcileWindowDays: 7,
  clockSkewSeconds: 300,
  singleCallTimeoutMs: 15_000,
  tourBudgetMs: 60_000,
  responseMaxBytes: 4_194_304,
  safetyLimit: 20_000,
  scopeBufferKm: 200,
  runRetentionDays: 14,
  budget: AFAD_TDVMS_BUDGET,
};

describe('buildAfadWindow', () => {
  it('spans the recent window and reaches slightly into the future', () => {
    const window = buildAfadWindow(EarthquakeIngestJobKind.Recent, NOW, CONFIG);
    expect(window.startUtc.getTime()).toBe(NOW - 6 * 3_600_000);
    expect(window.endUtc.getTime()).toBe(NOW + 300_000);
  });

  it('spans the reconcile window from the same instant', () => {
    const window = buildAfadWindow(EarthquakeIngestJobKind.Reconcile, NOW, CONFIG);
    expect(window.startUtc.getTime()).toBe(NOW - 7 * 86_400_000);
    expect(window.endUtc.getTime()).toBe(NOW + 300_000);
  });

  it('always covers more ground than the cadence that repeats it', () => {
    // The invariant behind the boot cross-check: a window narrower than its interval would leave a
    // stretch of time nobody ever queries, and events in it would disappear without a trace.
    //
    // Read what this case can and cannot see (review #118 TA118-M4). Its numbers come from the
    // spec-local `CONFIG` above, so it pins the RELATIONSHIP `buildAfadWindow` computes — not the
    // production defaults, which it cannot go red for. The gate on those is the boot cross-check in
    // `env.schema.ts`, and `env.schema.spec.ts` exercises it in both directions.
    const recent = buildAfadWindow(EarthquakeIngestJobKind.Recent, NOW, CONFIG);
    const recentSpanMs = recent.endUtc.getTime() - recent.startUtc.getTime();
    expect(recentSpanMs).toBeGreaterThan(CONFIG.recentIntervalSeconds * 1000);

    const reconcile = buildAfadWindow(EarthquakeIngestJobKind.Reconcile, NOW, CONFIG);
    const reconcileSpanMs = reconcile.endUtc.getTime() - reconcile.startUtc.getTime();
    expect(reconcileSpanMs).toBeGreaterThan(CONFIG.reconcileIntervalSeconds * 1000);
  });
});

describe('buildAfadEventFilterUrl', () => {
  const window = buildAfadWindow(EarthquakeIngestJobKind.Recent, NOW, CONFIG);
  const url = buildAfadEventFilterUrl(CONFIG.baseUrl, window, CONFIG.safetyLimit);

  it('always sends both window ends — the shape whose ABSENCE the provider answers with a 500', () => {
    expect(url).toContain('start=2026-08-11T06:00:00');
    expect(url).toContain('end=2026-08-11T12:05:00');
  });

  it('sends `limit` as the safety ceiling, never as a "latest N" selector', () => {
    // Measured: `limit=3&orderby=timedesc` returns the window's OLDEST three. A small limit here
    // would therefore publish the oldest events as if they were the newest.
    expect(url).toContain(`limit=${String(CONFIG.safetyLimit)}`);
    expect(CONFIG.safetyLimit).toBeGreaterThan(1_000);
  });

  it('never asks the provider to order the result', () => {
    expect(url).not.toContain('orderby');
  });

  it('leaves the colons in the stamps unescaped, which is the form measured to work', () => {
    expect(url).not.toContain('%3A');
  });

  it('does not double the slash when the base URL carries a trailing one', () => {
    const withSlash = buildAfadEventFilterUrl(`${CONFIG.baseUrl}/`, window, CONFIG.safetyLimit);
    expect(withSlash).not.toContain('apiv2//event');
  });
});
