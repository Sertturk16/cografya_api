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
  P6_TARGETS,
  P7_TARGETS,
  PROSE_WAVES,
  targetKey,
} from './oneoff-province-prose-targets.ts';

describe('prose wave target lists — per-wave shape', () => {
  it('covers every shipped wave (the table the other cases iterate is complete)', () => {
    // A wave added to the module but forgotten in PROSE_WAVES would be invisible to every
    // assertion below — unguarded while looking guarded, which is worse than no spec.
    expect(PROSE_WAVES.map((w) => w.label)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7']);
    expect(PROSE_WAVES.map((w) => w.targets)).toEqual([
      P1_TARGETS,
      P2_TARGETS,
      P3_TARGETS,
      P4_TARGETS,
      P5_TARGETS,
      P6_TARGETS,
      P7_TARGETS,
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

  it('P6 owns its three transferred pairs and P3/P4 no longer do (ownership MOVED)', () => {
    // Same shape as the Mersin case above, three pairs at once: Ankara/06 and İstanbul/34 come
    // from P3, Samsun/55 from P4. Pinned in both directions for the same asymmetric reason —
    // leaving a pair behind turns the older wave's gate permanently red, dropping it from both
    // leaves the field with no wave asserting it at all.
    const moved = [
      {
        previous: P3_TARGETS,
        key: targetKey({ name: 'Ankara', plate: '06', field: 'settlementNoteTr' }),
      },
      {
        previous: P3_TARGETS,
        key: targetKey({ name: 'İstanbul', plate: '34', field: 'hydrographyNoteTr' }),
      },
      {
        previous: P4_TARGETS,
        key: targetKey({ name: 'Samsun', plate: '55', field: 'settlementNoteTr' }),
      },
    ];
    for (const { previous, key } of moved) {
      expect(P6_TARGETS.map(targetKey)).toContain(key);
      expect(previous.map(targetKey)).not.toContain(key);
    }
  });

  it('P6 does NOT claim the two pairs that were back-ported to P1/P2 instead', () => {
    // The structural reason this wave is ten pairs and not twelve. Çorum/19 and Sivas/58
    // `hydrographyNoteTr` are the SOLE entries of P1 and P2, so moving them would empty those
    // lists — tripping the `$label is non-empty` case above and the runner's "nothing expected"
    // refusal together. Their corrections were back-ported into the P1/P2 DRAFTS instead, which
    // is invisible from this file; this case is what tells the next reader that the omission is
    // deliberate rather than a forgotten entry, and fails if someone "completes" the wave.
    const backPorted = [
      targetKey({ name: 'Çorum', plate: '19', field: 'hydrographyNoteTr' }),
      targetKey({ name: 'Sivas', plate: '58', field: 'hydrographyNoteTr' }),
    ];
    for (const key of backPorted) expect(P6_TARGETS.map(targetKey)).not.toContain(key);
    expect(P1_TARGETS.map(targetKey)).toContain(backPorted[0]!);
    expect(P2_TARGETS.map(targetKey)).toContain(backPorted[1]!);
  });

  it('P6 is exactly the ten pairs of W1 that were not back-ported', () => {
    // Same reason P5 carries a length: the wave's SIZE is what no other check can see. Non-overlap
    // and the historical superset both stay green if an eleventh pair is appended or a tenth
    // quietly dropped, and the seed itself cannot object — a field simply stops being asserted.
    // The two structural cases above pin WHICH pairs must and must not be here; this pins HOW
    // MANY, which is the half that catches a boundary edit neither of them names.
    expect(P6_TARGETS).toHaveLength(10);
  });

  it('P7 transfers nothing — every pair it claims is one no earlier wave ever owned', () => {
    // The claim P7's docblock makes, pinned rather than trusted. Three of its four plates ARE
    // owned by P3 on `settlementNoteTr`, so "this wave takes nothing from anyone" is exactly the
    // kind of statement that reads true and can be false; the PAIR is what has to be checked.
    const earlier = new Set(
      [P1_TARGETS, P2_TARGETS, P3_TARGETS, P4_TARGETS, P5_TARGETS, P6_TARGETS].flatMap((wave) =>
        wave.map(targetKey),
      ),
    );
    expect(P7_TARGETS.filter((target) => earlier.has(targetKey(target)))).toEqual([]);
    // …and the control that keeps the assertion above honest: the same plates DO collide when
    // the key is the plate alone, which is the mistake this lane's identity rule exists to stop.
    const earlierPlates = new Set([...earlier].map((key) => key.split(' ')[0]));
    expect(P7_TARGETS.filter((target) => earlierPlates.has(target.plate))).toHaveLength(3);
  });

  it('P7 is exactly the four W8-VOLKAN province rows', () => {
    // Same reason P5 and P6 carry a length: the wave's SIZE is what no other check can see.
    expect(P7_TARGETS).toHaveLength(4);
    expect(P7_TARGETS.every((target) => target.field === 'landformNoteTr')).toBe(true);
  });

  it('P5 covers the fifteen provinces the owner rulings demand a note for', () => {
    // The wave's SIZE is the thing no other check can see: the runner refuses an empty list and
    // the seed invariant refuses a missing out-of-region note, but neither notices a boundary
    // note (DEC 2026-08-05f #3) quietly dropped from the list — that class of loss is silent
    // everywhere else. Eleven boundary readings + eight out-of-region names, four provinces in
    // both sets, = 15 (Denizli joined both sets with DEC 2026-08-06b).
    expect(P5_TARGETS).toHaveLength(15);
    expect(new Set(P5_TARGETS.map((target) => target.plate)).size).toBe(15);
  });

  it('every pair any wave has EVER owned is still owned by some wave (no orphaned field)', () => {
    // THE GENERAL FORM of the case above, and the one that scales. An ownership transfer is two
    // edits; the second is unguarded. Drop it and the field becomes an orphan: corrected prose
    // in the seed that no draft asserts, so no lane's `check` ever reads it again and it can
    // drift silently forever — the one failure in this toolchain that produces NO red anywhere.
    const live = new Set(PROSE_WAVES.flatMap((wave) => wave.targets.map(targetKey)));
    const orphaned = HISTORICALLY_OWNED.filter((key) => !live.has(key));
    expect(orphaned).toEqual([]);
  });

  it('the historical record covers every live pair (the list a new wave is appended to BY HAND)', () => {
    // THE OTHER DIRECTION, and the one PR #103 found missing (TA103-M1). The case above is a
    // superset check: it can only fail when a pair LEAVES the waves. But `HISTORICALLY_OWNED`
    // is maintained by hand — a new wave appends its own new pairs — and appending six of seven
    // failed NOTHING, because a short historical list satisfies "subset of live" perfectly.
    //
    // Why that matters rather than being mere bookkeeping: this list is the SOLE input to the
    // orphan check above, which is the only assertion in this toolchain that can detect a field
    // no wave asserts any more. A pair missing from the record is invisible to it forever — so
    // the guard against orphans silently stops guarding the pair most likely to become one.
    //
    // Deliberately NOT folded into one equality assertion with the case above: the two
    // directions fail for different reasons (a dropped transfer half vs. a forgotten append),
    // and a single `toEqual` would report either as the same opaque set difference.
    const recorded = new Set(HISTORICALLY_OWNED);
    const live = PROSE_WAVES.flatMap((wave) => wave.targets.map(targetKey));
    expect(live.filter((key) => !recorded.has(key))).toEqual([]);
  });

  it('the historical record has no duplicate entries', () => {
    // Append-only lists grow by hand, and a pair re-appended on its transfer would make the
    // superset check above pass while quietly misrepresenting the history it exists to hold.
    expect(new Set(HISTORICALLY_OWNED).size).toBe(HISTORICALLY_OWNED.length);
  });
});
