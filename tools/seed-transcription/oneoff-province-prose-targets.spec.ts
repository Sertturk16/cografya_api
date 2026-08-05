/**
 * Structural invariants over the province PROSE wave target lists.
 *
 * These are the checks TA94-M1 recorded as "performed by hand, no CI net yet" — the third wave
 * (P3, PR #95) was the trigger to stop doing them by hand. Nothing here asserts a province FACT:
 * the subject is the shape of the wave tables themselves (→ CONVENTIONS §2).
 *
 * The one that earns its keep is CROSS-WAVE NON-OVERLAP. A wave's `check` gate compares the
 * committed seed against that wave's own draft, so if two waves claim the same province+field
 * they cannot both be green: whichever landed second silently redefines what the first one's
 * gate demands, and the first wave's `check` starts failing on a PR that never mentioned it.
 * Worse, `emit` for the later wave would overwrite prose the earlier wave's draft still claims
 * to own. Nothing else in the toolchain can see this — the runner only ever receives ONE wave's
 * table.
 *
 * Mirrors `oneoff-province-climate-extract.spec.ts`'s "wave target lists" block, with one
 * deliberate difference: the identity here is the `(plate, field)` PAIR, not the plate. See the
 * module docblock on `oneoff-province-prose-targets.ts`.
 */
import {
  HISTORICALLY_OWNED,
  P1_TARGETS,
  P2_TARGETS,
  P3_TARGETS,
  P4_TARGETS,
  P5_TARGETS,
  PROSE_WAVES,
  targetKey,
} from './oneoff-province-prose-targets.ts';

describe('prose wave target lists — per-wave shape', () => {
  it('covers every shipped wave (the table the other cases iterate is complete)', () => {
    // A wave added to the module but forgotten in PROSE_WAVES would be invisible to every
    // assertion below — unguarded while looking guarded, which is worse than no spec.
    expect(PROSE_WAVES.map((w) => w.label)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5']);
    expect(PROSE_WAVES.map((w) => w.targets)).toEqual([
      P1_TARGETS,
      P2_TARGETS,
      P3_TARGETS,
      P4_TARGETS,
      P5_TARGETS,
    ]);
  });

  it.each(PROSE_WAVES)('$label is non-empty', ({ targets }) => {
    // The runner refuses an empty target list at runtime (PR #93, refusal 1). This is the same
    // refusal moved earlier: a wave that transcribes nothing is a mistake, not a pass.
    expect(targets.length).toBeGreaterThan(0);
  });

  it.each(PROSE_WAVES)('$label plate codes are 2-char zero-padded', ({ targets }) => {
    // `plateCode` is stored zero-padded so the lexical `ORDER BY plate_code` stays correct; a
    // target written '7' instead of '07' matches no seed row and fails late, at the gate.
    for (const target of targets) expect(target.plate).toMatch(/^\d{2}$/u);
  });

  it.each(PROSE_WAVES)('$label claims each (plate, field) pair at most once', ({ targets }) => {
    // A pair listed twice inside one wave makes the runner's "checked N field(s)" count
    // disagree with the number of fields actually verified.
    const keys = targets.map(targetKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(PROSE_WAVES)('$label names every province consistently', ({ targets }) => {
    // Within a wave, one plate must always carry one name — P3 lists Van and Rize and İstanbul
    // twice each, and a typo in the second entry is exactly the transposition the runner's
    // name-to-plate guard exists to catch, caught here without needing the seed.
    const nameByPlate = new Map<string, string>();
    for (const target of targets) {
      const seen = nameByPlate.get(target.plate);
      if (seen === undefined) nameByPlate.set(target.plate, target.name);
      else expect(target.name).toBe(seen);
    }
  });
});

describe('prose wave target lists — cross-wave invariants', () => {
  it('no two waves claim the same (plate, field) pair', () => {
    // THE ONE THAT MATTERS. Checked by hand on P1/P2/P3 until now (TA94-M1). Reported with the
    // colliding pairs named, because "some wave overlaps" is not an actionable failure.
    const owner = new Map<string, string>();
    const collisions: string[] = [];
    for (const { label, targets } of PROSE_WAVES) {
      for (const target of targets) {
        const key = targetKey(target);
        const previous = owner.get(key);
        if (previous === undefined) owner.set(key, label);
        else collisions.push(`${key} (${target.name}) claimed by both ${previous} and ${label}`);
      }
    }
    expect(collisions).toEqual([]);
  });

  it('a province may legitimately appear in two waves on DIFFERENT fields', () => {
    // Guards the guard: keying on the plate alone — the climate lane's rule, which is correct
    // THERE because that lane transcribes exactly one field — would make a future wave
    // correcting Çorum's introTr look like a collision with P1's Çorum hydrographyNoteTr, and
    // the natural "fix" would be to weaken the real check. Pinned so nobody has to rediscover
    // why the key is a pair.
    const sameProvinceOtherField = { name: 'Çorum', plate: '19', field: 'introTr' } as const;
    expect(targetKey(sameProvinceOtherField)).not.toBe(targetKey(P1_TARGETS[0]!));
  });

  it('P3 does not re-target the province+field pairs P1 and P2 already published', () => {
    // The concrete assertion the PR #95 build made by hand, kept as a named case so a
    // regression points straight at the wave that caused it rather than at a generic collision.
    const earlier = new Set([...P1_TARGETS, ...P2_TARGETS].map(targetKey));
    const reclaimed = P3_TARGETS.filter((target) => earlier.has(targetKey(target)));
    expect(reclaimed).toEqual([]);
  });

  it('P4 owns Mersin/33 settlementNoteTr and P3 no longer does (ownership MOVED, not shared)', () => {
    // The first ownership transfer (PR #96). P4 corrects a field P3 already published, so the
    // entry was deleted from P3 — list AND draft — rather than duplicated. Pinned in both
    // directions, because the failure mode is asymmetric and each half is silent on its own:
    // leaving it in P3 too would put P3's draft at odds with the seed and turn P3's mandated
    // gate permanently red, while removing it from P3 without adding it here would leave the
    // field with NO wave asserting it, which no gate anywhere can notice.
    const MERSIN = targetKey({ name: 'Mersin', plate: '33', field: 'settlementNoteTr' });
    expect(P4_TARGETS.map(targetKey)).toContain(MERSIN);
    expect(P3_TARGETS.map(targetKey)).not.toContain(MERSIN);
  });

  it('P5 transfers nothing — every pair it claims is a field no earlier wave ever owned', () => {
    // P5 introduces a brand-new column (`climateCurriculumNoteTr`), so unlike PR #96's Mersin
    // move it should need ZERO deletions from P1-P4. Pinned as a positive statement rather than
    // trusted: if a later correction ever DOES move one of these pairs, this case is where the
    // reader is told the wave's "no transfer" claim has expired.
    const earlier = new Set(
      [...P1_TARGETS, ...P2_TARGETS, ...P3_TARGETS, ...P4_TARGETS].map(targetKey),
    );
    expect(P5_TARGETS.filter((target) => earlier.has(targetKey(target)))).toEqual([]);
    expect(P5_TARGETS.every((target) => target.field === 'climateCurriculumNoteTr')).toBe(true);
  });

  it('P5 covers the fourteen provinces the two owner rulings demand a note for', () => {
    // The wave's SIZE is the thing no other check can see: the runner refuses an empty list and
    // the seed invariant refuses a missing out-of-region note, but neither notices a boundary
    // note (DEC 2026-08-05f #3) quietly dropped from the list — that class of loss is silent
    // everywhere else. Ten boundary readings + seven out-of-region names, three provinces in
    // both sets, = 14.
    expect(P5_TARGETS).toHaveLength(14);
    expect(new Set(P5_TARGETS.map((target) => target.plate)).size).toBe(14);
  });

  it('every pair any wave has EVER owned is still owned by some wave (no orphaned field)', () => {
    // THE GENERAL FORM of the case above, and the one that scales. An ownership transfer is two
    // edits; the second is unguarded. Drop it and the field becomes an orphan: corrected prose
    // in the seed that no draft asserts, so no lane's `check` ever reads it again and it can
    // drift silently forever — the one failure in this toolchain that produces NO red anywhere.
    // Superset only: a wave may add pairs freely, it just may not lose one.
    const live = new Set(PROSE_WAVES.flatMap((wave) => wave.targets.map(targetKey)));
    const orphaned = HISTORICALLY_OWNED.filter((key) => !live.has(key));
    expect(orphaned).toEqual([]);
  });

  it('the historical record has no duplicate entries', () => {
    // Append-only lists grow by hand, and a pair re-appended on its transfer would make the
    // superset check above pass while quietly misrepresenting the history it exists to hold.
    expect(new Set(HISTORICALLY_OWNED).size).toBe(HISTORICALLY_OWNED.length);
  });
});
