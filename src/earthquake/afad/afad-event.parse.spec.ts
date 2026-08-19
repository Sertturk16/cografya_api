import { describe, expect, it } from '@jest/globals';
import { MagnitudeType } from '../earthquake.types';
import { UpstreamSchemaError } from '../../upstream/upstream.types';
import {
  normaliseMagnitudeType,
  parseAfadEvent,
  parseAfadEventsBody,
  parseAfadLocation,
} from './afad-event.parse';

/**
 * A syntactically valid provider row. Values are SYNTHETIC — the shapes are what matter here, and
 * `CONVENTIONS.md` §2 keeps factual claims (that some earthquake had some magnitude) out of tests.
 */
function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    rms: '0.29',
    eventID: '725329',
    location: 'Göksun (Kahramanmaraş)',
    latitude: '38.05222',
    longitude: '36.63111',
    depth: '6.95',
    type: 'ML',
    magnitude: '1.8',
    country: 'Türkiye',
    province: 'Kahramanmaraş',
    district: 'Göksun',
    neighborhood: 'Gücüksu',
    date: '2026-08-11T11:03:34',
    isEventUpdate: false,
    lastUpdateDate: null,
    ...overrides,
  };
}

function accept(overrides: Record<string, unknown> = {}) {
  const outcome = parseAfadEvent(row(overrides));
  if (outcome.kind !== 'ok') {
    throw new Error(`expected acceptance, got: ${outcome.rejection.reason}`);
  }
  return outcome.event;
}

function rejectionFor(overrides: Record<string, unknown>): string {
  const outcome = parseAfadEvent(row(overrides));
  if (outcome.kind === 'ok') throw new Error('expected a rejection, got an accepted row');
  return outcome.rejection.reason;
}

describe('parseAfadEvent — numbers', () => {
  it('parses the measured decimal shapes', () => {
    const event = accept({ magnitude: '2', depth: '-0.014' });
    expect(event.magnitude).toBe(2);
    expect(event.depthKm).toBe(-0.014);
  });

  it.each([
    ['abc', 'prose'],
    ['', 'an empty string'],
    [' 3 ', 'surrounding whitespace'],
    ['1e3', 'exponent notation'],
    ['+3', 'a leading plus'],
  ])('refuses magnitude %s (%s) instead of coercing it', (magnitude) => {
    expect(rejectionFor({ magnitude })).toContain('magnitude');
  });

  it('refuses a value finer than its column, because the database would round it silently', () => {
    // `magnitude numeric(4,2)`: three decimals would be stored as two and the row would then
    // disagree with the provider — a plausible-but-wrong number, the exact class the fidelity rule
    // exists for.
    expect(rejectionFor({ magnitude: '4.255' })).toContain('magnitude');
    expect(accept({ magnitude: '4.25' }).magnitude).toBe(4.25);
  });

  it('refuses coordinates outside their range before the database has to', () => {
    expect(rejectionFor({ latitude: '91.0' })).toContain('latitude');
    expect(rejectionFor({ longitude: '-181.0' })).toContain('longitude');
  });

  it('refuses a bracket distance its column cannot hold, by name rather than at the insert', () => {
    // `binding_distance_km numeric(6,2)` tops out at 9999.99. Without this refusal the row passed
    // the parser and was refused by Postgres, so it was counted as `eq.row_write_failed` — "the
    // DATABASE refused" — when the payload was what disagreed with the contract (review #118
    // CODE118-M2). Those two counters are documented as answering different questions.
    expect(rejectionFor({ location: 'Ege Denizi - [123456.78 km] Bodrum (Muğla)' })).toContain(
      'bracket distance',
    );

    // The control: the same shape at a distance the column CAN hold is accepted, so the case above
    // is the ceiling talking and not the composite parser refusing the string.
    const wide = accept({ location: 'Ege Denizi - [9999.99 km] Bodrum (Muğla)' });
    expect(wide.bindingDistanceKm).toBe(9999.99);
  });
});

describe('parseAfadEvent — magnitude type', () => {
  it('normalises case-insensitively and keeps the raw string', () => {
    const event = accept({ type: 'MW' });
    expect(event.magnitudeType).toBe(MagnitudeType.Mw);
    expect(event.magnitudeTypeRaw).toBe('MW');
  });

  it('publishes an unknown type as `other` rather than failing the row', () => {
    const event = accept({ type: 'Mx' });
    expect(event.magnitudeType).toBe(MagnitudeType.Other);
    expect(event.magnitudeTypeRaw).toBe('Mx');
  });

  it.each([
    ['ml', MagnitudeType.Ml],
    ['ML', MagnitudeType.Ml],
    ['Ml', MagnitudeType.Ml],
    ['mw', MagnitudeType.Mw],
    ['ms', MagnitudeType.Ms],
    ['mb', MagnitudeType.Mb],
    ['md', MagnitudeType.Md],
    ['mwp', MagnitudeType.Mwp],
    ['', MagnitudeType.Other],
  ])('maps %s', (raw, expected) => {
    expect(normaliseMagnitudeType(raw)).toBe(expected);
  });
});

describe('parseAfadLocation', () => {
  it('leaves a plain place name whole and reports no bracket distance', () => {
    expect(parseAfadLocation('Ege Denizi')).toEqual({
      placeNameTr: 'Ege Denizi',
      bindingDistanceKm: null,
      hasDistanceBracket: false,
    });
  });

  it('splits the composite form into the label and the distance', () => {
    expect(parseAfadLocation('Ege Denizi - [56.72 km] Bodrum (Muğla)')).toEqual({
      placeNameTr: 'Ege Denizi',
      bindingDistanceKm: 56.72,
      hasDistanceBracket: true,
    });
  });

  it('refuses a string that starts the composite form and does not finish it', () => {
    // Publishing `Ege Denizi - [56.72 km` as a reader-facing label would leak a provider-internal
    // format onto a page; guessing where the label ends would be worse than refusing.
    expect(parseAfadLocation('Ege Denizi - [56.72 km')).toBeNull();
  });
});

describe('parseAfadEvent — the envelope and the row boundary', () => {
  it('carries the provider id into the rejection so a bad row can be found', () => {
    const outcome = parseAfadEvent(row({ date: 'yesterday' }));
    expect(outcome.kind).toBe('rejected');
    if (outcome.kind === 'rejected') expect(outcome.rejection.providerEventId).toBe('725329');
  });

  it('refuses a row whose timestamp carries precision we cannot store', () => {
    expect(rejectionFor({ date: '2026-08-11T11:03:34.719149' })).toContain('sub-millisecond');
  });

  it('truncates lastUpdateDate to milliseconds and still accepts the row', () => {
    const event = accept({ isEventUpdate: true, lastUpdateDate: '2023-02-06T09:46:31.642742' });
    expect(event.isRevised).toBe(true);
    expect(event.providerUpdatedAtUtc?.getUTCMilliseconds()).toBe(642);
  });

  it('accepts a null country and a null neighbourhood', () => {
    const event = accept({ country: null, neighborhood: null, location: 'Akdeniz' });
    expect(event.providerCountry).toBeNull();
    expect(event.placeNameTr).toBe('Akdeniz');
  });
});

describe('parseAfadEventsBody', () => {
  it('separates accepted rows from refused ones without losing the tour', () => {
    const body = JSON.stringify([
      row(),
      row({ eventID: '2', magnitude: 'abc' }),
      row({ eventID: '3' }),
    ]);
    const payload = parseAfadEventsBody(body, { safetyLimit: 100 });
    expect(payload.fetchedCount).toBe(3);
    expect(payload.accepted).toHaveLength(2);
    expect(payload.rejected).toHaveLength(1);
  });

  it('fails the whole tour when the body is not an array', () => {
    expect(() => parseAfadEventsBody('{"status":400}', { safetyLimit: 100 })).toThrow(
      UpstreamSchemaError,
    );
  });

  it('fails the whole tour when the response sits on the safety limit', () => {
    // `limit` is applied BEFORE `orderby` upstream, so a response at the ceiling may be a silently
    // truncated window. Accepting it would publish a partial window as if it were complete.
    const body = JSON.stringify([row(), row({ eventID: '2' })]);
    expect(() => parseAfadEventsBody(body, { safetyLimit: 2 })).toThrow(UpstreamSchemaError);
  });

  it('accepts a response one row below the ceiling', () => {
    const body = JSON.stringify([row(), row({ eventID: '2' })]);
    expect(parseAfadEventsBody(body, { safetyLimit: 3 }).accepted).toHaveLength(2);
  });
});
