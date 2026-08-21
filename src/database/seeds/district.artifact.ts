import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

/**
 * The committed ilçe artefact and the refusals that stand between it and the database
 * (üyelik plan §3, PR-1).
 *
 * ## The artefact is COPIED, never transcribed — and that is the whole design
 * `Owner's Inbox/oturum-lite/ilce-listesi.json` is copied into this repo **byte for byte** and read
 * from disk at runtime. Nobody retypes 973 Turkish place names into a `.ts` file, so the failure
 * class playbook §8 was written for cannot occur here: `Şarkışla` mistyped as `Şarkişla` is a
 * defect no structural test can see, and it would be published on a form 973 users pick from. The
 * `data/books/` artefact established this shape; this is the second lane to use it.
 *
 * The consequence worth stating: there is no transcription step, so there is nothing to verify a
 * transcription against, and this leg adds no `tools/seed-transcription/` lane. What it adds
 * instead is the JOIN in {@link assertArtifactMatchesProvinces}, which is a stronger check than any
 * transcription lane could run — see its own note.
 *
 * ## Provenance, and what the seed owes the source
 * TÜİK Coğrafi İstatistik Portalı, Düzey-4 (ilçe) + Düzey-3 (il) geometry, accessed 2026-08-20;
 * the licence, the verbatim TÜİK legal notice and the MGM verification boundary are recorded in
 * `provenance/datasets.md` (the two 2026-08-20 rows) and restated for this repo in
 * `data/reference/README.md`. TÜİK's terms require **no prior permission and mandatory
 * attribution**, so the credit is an obligation this repo carries, not a courtesy.
 *
 * **MGM contributed nothing that is published here.** 969 of these 973 names were independently
 * confirmed against MGM's own spelling, but MGM's legal notice requires PRIOR PERMISSION, so
 * `CONVENTIONS.md` §7 is not met and no MGM string may ship. That is why {@link districtSchema}
 * declares `mgmConfirmed` and {@link normalizeArtifact} drops it: the field is a research record,
 * and making its exclusion structural is cheaper than promising it in a comment.
 *
 * ## What the SHA-256 pin below does, and what it deliberately does NOT do
 * {@link EXPECTED_ARTIFACT_SHA256} is compared against the file this module actually reads, and a
 * mismatch refuses the whole run. **It catches exactly one thing:** somebody editing the committed
 * copy by hand — "fixing" a name in the repo instead of taking it up with the source — which is a
 * real temptation here (TÜİK itself ships `KahramanKAZAN`) and would otherwise be silent.
 *
 * **It does NOT prove the committed copy still matches the Inbox source.** That file lives outside
 * this repository, so no runtime check and no CI job here can reach it; the two are compared by
 * hand with the `sha256sum` + `cmp` pair recorded in `data/reference/README.md`. A guard that looks
 * like it closes a gap it cannot reach is worse than no guard, so the boundary is stated rather
 * than implied. When the list is legitimately re-collected, the artefact AND this constant move
 * together in one PR; forgetting the constant fails loudly and names both values.
 *
 * ## Playbook §8's four shared refusals, on a JSON-artefact lane
 * §8 requires a new lane to carry all four "or state, at the refusal's site, why it has no
 * analogue", and "'No analogue' is only acceptable when it is written down where the next reader
 * will look". This is that statement:
 *
 * - **Refusal 1 ("nothing expected")** is carried twice: by `.min(1)` on {@link artifactSchema},
 *   and — because a non-empty artefact can still be a partial export — by
 *   {@link ARTIFACT_COVERAGE_FLOOR}, which a recomputation cannot discharge.
 * - **Refusal 2 ("the committed seed does not parse") has no analogue.** Its reason is that
 *   `ts.createSourceFile` is ERROR-TOLERANT, so a transcription lane would silently read a partial
 *   index. Nothing here parses TypeScript, and `JSON.parse` throws rather than returning a partial
 *   document — a throw {@link readDistrictsArtifact} catches and renames.
 * - **Refusal 3 ("an unreadable path")** is carried by {@link DistrictsArtifactError}, which names
 *   the file in every message instead of surfacing a `node:fs` stack trace.
 * - **Refusal 4 ("tight joins reported in `check`") has no analogue.** Its reason is that a lane
 *   reconstructing prose from several source lines can glue two of them together and then AGREE
 *   WITH ITSELF, since both sides run the same parser. This lane reconstructs nothing: every value
 *   is one JSON scalar. With no join heuristic there is nothing that could agree with itself.
 */

/** Where the committed artefact lives, relative to the repo root (the `data/books` pattern). */
export const DISTRICTS_ARTIFACT_FILENAME = 'districts.tuik.json';

/** Absolute path of the committed artefact, resolved from the process working directory. */
export function districtsArtifactPath(): string {
  return join(process.cwd(), 'data', 'reference', DISTRICTS_ARTIFACT_FILENAME);
}

/**
 * SHA-256 of the committed artefact, measured on 2026-08-21 against the Inbox source with
 * `sha256sum` on both sides plus a byte `cmp` (73 638 B, no trailing newline). See the module note
 * for its exact scope.
 */
export const EXPECTED_ARTIFACT_SHA256 =
  '5963b103e2a5a0ac9e0fdf7ac9d11ca206fd2f52fd3c854381483b1c48afc9df';

/**
 * The coverage the COMMITTED artefact must never silently fall below.
 *
 * ## Why the SHA-256 pin does not already cover this
 * The pin's own documented procedure for a legitimate re-collection is "the artefact AND the
 * constant move together in one PR". So a truncated artefact — 40 provinces instead of 81, from a
 * partial export — turns the pin red, and the author then updates the pin, which is the CORRECT
 * procedure applied to a defective input. Every per-row refusal below passes on the remainder, and
 * the seed writes 40 provinces' worth of districts and exits 0 — the same exit code as a complete
 * run, while playbook §8 makes the exit code what a run is judged by.
 *
 * A FLOOR is the one thing in that chain a recomputation cannot discharge: lowering it is a
 * deliberate line in a diff saying "Türkiye now has fewer ilçe". A re-collection that ADDS one
 * needs no change to it.
 *
 * **These are floors, not equalities, and the district figure is a live question.** 973 is what
 * TÜİK's own Düzey-4 geometry carries and what `provinces.district_count` has published since the
 * geography seed landed; the SPEC's 975 was the reference product's number and is wrong for a
 * measured reason (two Antalya districts duplicated under Artvin — `Owner's Inbox/oturum-lite/
 * ilce-listesi.md` §2). An ilçe is created by law, so the real total can rise; equality here would
 * turn a lawful new ilçe into a red gate, while the floor turns a truncated export into one.
 */
export const ARTIFACT_COVERAGE_FLOOR = {
  provinces: 81,
  districts: 973,
} as const;

/** Türkiye's plate codes, zero-padded to two characters — the join key with `provinces`. */
const PLATE_CODE_PATTERN = /^(0[1-9]|[1-7][0-9]|8[01])$/;

/**
 * The combining dot above, U+0307 — invisible in every editor and every review diff.
 *
 * `'İ'.toLowerCase()` emits it under the default (English) casing rules, so any locale-blind
 * ALL-CAPS→Title conversion of this source produces it: measured over these same 973 names, a
 * ready-made converter puts it in **308** of them (`ilce-listesi.md` §5A). The artefact was built
 * with a hand-written `İ`→`i` / `I`→`ı` mapping instead, and carries 0. This constant is what makes
 * that a checked fact rather than a claim in a dossier.
 *
 * **It is deliberately NOT the whole invisible-character rule** — see the NFC clause in
 * {@link assertWritingForm}, which owns the class this constant is one member of. The two do not
 * subsume each other in either direction: `i` + U+0307 has no precomposed form, so it is already in
 * NFC and the normalisation clause cannot see it (measured: `'i\u0307'.normalize('NFC')` is
 * unchanged), while a decomposed `ğ` is perfectly composable and this constant cannot see that.
 */
const COMBINING_DOT_ABOVE = '̇';

/**
 * One ilçe, exactly as the artefact carries it.
 *
 * `mgmConfirmed` is validated and then DISCARDED — see {@link normalizeArtifact}. Declaring it is
 * deliberate: `z.strictObject` refuses unknown keys, so an artefact whose shape changes (a renamed
 * field, an added one) fails loudly instead of being silently stripped.
 */
const districtSchema = z.strictObject({
  nameTr: z.string().min(1).max(100),
  mgmConfirmed: z.boolean(),
});

/**
 * One il's record.
 *
 * `districtCount` is the artefact's OWN declared count. It is validated against the length of
 * `districts` in {@link assertArtifactIsSeedable} — the artefact's internal witness, in the same
 * role the `Soru {n}` tag plays on the books lane: a truncated list stops agreeing with the number
 * printed beside it.
 */
const provinceSchema = z.strictObject({
  plateCode: z.string().regex(PLATE_CODE_PATTERN),
  provinceNameTr: z.string().min(1).max(100),
  districtCount: z.number().int().min(1),
  districts: z.array(districtSchema).min(1),
});

/**
 * The artefact's `_meta` block.
 *
 * Not decoration: `toplamIlce` is a second independent witness of the total, written by the
 * collector at collection time, and it is cross-checked in {@link assertArtifactIsSeedable}. The
 * provenance strings are declared so the strict object cannot silently absorb a shape change; they
 * are never read into a published value and never translated (`data-provenance.md`: licence and
 * attribution strings are copied verbatim).
 */
const metaSchema = z.strictObject({
  kaynak: z.string().min(1),
  ikinciKaynak: z.string().min(1),
  erisimTarihi: z.string().min(1),
  toplamIlce: z.number().int().min(1),
  mgmIleDogrulanan: z.number().int().min(0),
  ilIlceEslemesi: z.string().min(1),
  yaziBicimi: z.string().min(1),
  statu: z.string().min(1),
});

/**
 * Refusal 1, first half: an EMPTY artefact fails rather than reporting "0 checked".
 *
 * `.min(1)` here together with `districts.min(1)` above bounds the product — at least one province
 * carrying at least one ilçe — so it is the schema-level half of playbook §8's first refusal. The
 * half that catches a PARTIAL export is {@link ARTIFACT_COVERAGE_FLOOR}.
 */
const artifactSchema = z.strictObject({
  _meta: metaSchema,
  iller: z.array(provinceSchema).min(1),
});

/** One il's districts, reduced to exactly the values the table stores plus the join key. */
export interface DistrictProvinceSeed {
  readonly plateCode: string;
  /** The artefact's own name for this il — the JOIN witness, never written to any column. */
  readonly provinceNameTr: string;
  readonly districtNamesTr: readonly string[];
}

/** What a validated artefact reduces to. */
export interface DistrictsArtifact {
  readonly provinces: readonly DistrictProvinceSeed[];
  /** District total across every province — carried so a caller prints a count it computed. */
  readonly districtCount: number;
}

/** The province facts {@link assertArtifactMatchesProvinces} joins against. */
export interface DistrictProvinceReference {
  readonly plateCode: string;
  readonly nameTr: string;
  readonly districtCount: number | null;
}

/**
 * Every refusal on this lane throws this, and every message names the artefact file.
 *
 * Playbook §8's refusal 3: an unreadable path is answered with a message naming the file, never
 * with a `node:fs` stack trace the operator has to decode.
 */
export class DistrictsArtifactError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DistrictsArtifactError';
  }
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
}

/**
 * An uppercase letter anywhere but the first character or immediately after a space.
 *
 * Split out of {@link assertWritingForm} only because the whole-name ALL-CAPS test and this one are
 * mutually exclusive by construction — a fully-uppercase name trivially satisfies both — and running
 * them as `if/else if` keeps one defect from being reported twice under two names.
 */
function hasInteriorUpperCase(name: string): boolean {
  for (let index = 1; index < name.length; index += 1) {
    const character = name[index] ?? '';
    const isCased = character !== character.toLocaleLowerCase('tr');
    if (isCased && character === character.toLocaleUpperCase('tr') && name[index - 1] !== ' ') {
      return true;
    }
  }
  return false;
}

/**
 * The writing-form refusals — the ones the database deliberately does not carry.
 *
 * `CHK_districts_name_tr` rejects padding and the empty string; it admits an ALL-CAPS name and an
 * invisible combining mark on purpose, because both are defects of the SOURCE TRANSFORMATION and a
 * transformation is judged in the load phase, where the message can name the source and the row.
 * This function is that judgement. Each rule is a defect somebody measured, not a hypothetical:
 *
 * 1. **Padding / empty** — the reference product ships ` Finike` with a leading space.
 * 2. **A whitespace character that is not a plain space, or a doubled space** — an interior NBSP or
 *    tab is invisible, breaks the unique constraint's notion of "the same name", and would sort and
 *    compare wrongly for ever. Measured over the artefact: exactly one name contains a space at all
 *    (`19 Mayıs`), and it is a single U+0020.
 * 3. **U+0307** — see {@link COMBINING_DOT_ABOVE}. 308 of these names would carry it under a
 *    ready-made converter.
 * 4. **Not in Unicode NFC** — the class U+0307 is one member of. A name whose `ğ`/`ö`/`ü`/`ç`/`ş`
 *    arrives DECOMPOSED (base letter + a combining mark) looks identical in every editor, is a
 *    different string from the same name typed normally, and would therefore sort wrongly, compare
 *    unequal and let `UQ_districts_province_name_tr` hold what a reader sees as one ilçe twice.
 *    Measured over this artefact: **404 of the 973** names change under NFD, and **0** are
 *    currently non-NFC — so the clause is satisfied today and is what keeps it so.
 * 5. **ALL-CAPS, whole or partial** — the source is ALL-CAPS and `DEC 2026-08-20p` md.5 rules the
 *    reader sees normal writing for all 973 of these names (it is the ruling that extends
 *    `DEC 2026-08-20m` md.6 — written for university and department names — to this list, and it
 *    binds the STORED value, naming `IĞDIR`→`Iğdır`, `ŞIRNAK`→`Şırnak` and `ONİKİŞUBAT`'s
 *    invisible U+0307 as the traps). A name that survived unconverted is an untransformed row
 *    rather than a style choice. Two clauses, because one does not imply the other: the whole-name
 *    test (`=== upper`, with a `!== lower` guard so it cannot fire on a name with no cased letters)
 *    misses `KADIköy`, which a half-working converter produces and which no other refusal here
 *    would see. The partial test allows an uppercase letter only as the first character or after a
 *    space — measured over this artefact, **0 of 973** violate it, and the two names that could
 *    plausibly have (`Kahramankazan`, which TÜİK itself ships as `KahramanKAZAN`, and `19 Mayıs`,
 *    the only name containing a space at all) both pass.
 */
function assertWritingForm(plateCode: string, names: readonly string[], problems: string[]): void {
  for (const name of names) {
    const label = `${plateCode} ${JSON.stringify(name)}`;

    if (name !== name.trim() || name === '') {
      problems.push(`${label} — is empty or carries leading/trailing whitespace`);
      continue;
    }
    if (/[^\S ]/.test(name)) {
      problems.push(`${label} — carries a whitespace character that is not a plain space`);
    }
    if (name.includes('  ')) {
      problems.push(`${label} — carries a doubled space`);
    }
    if (name.includes(COMBINING_DOT_ABOVE)) {
      problems.push(
        `${label} — carries the invisible combining dot above (U+0307): the name was lowercased ` +
          'with English casing rules instead of the İ→i / I→ı mapping',
      );
    }
    if (name !== name.normalize('NFC')) {
      problems.push(
        `${label} — is not in Unicode NFC: a Turkish letter arrived decomposed (base letter + a ` +
          'combining mark), which is invisible on screen but is a different string from the same ' +
          'name typed normally',
      );
    }
    if (name === name.toLocaleUpperCase('tr') && name !== name.toLocaleLowerCase('tr')) {
      problems.push(
        `${label} — is still in the source's ALL-CAPS form; DEC 2026-08-20p md.5 rules the reader ` +
          'sees normal writing',
      );
    } else if (hasInteriorUpperCase(name)) {
      problems.push(
        `${label} — carries an uppercase letter that neither starts the name nor follows a space, ` +
          'so the ALL-CAPS source was only PARTLY converted; DEC 2026-08-20p md.5 rules the reader ' +
          'sees normal writing',
      );
    }
  }
}

/**
 * The cross-row refusals zod cannot express, each of which is a real silent defect.
 *
 * A zod schema sees one value at a time. Coverage, uniqueness, plate-set completeness and the
 * count/length agreement are all claims about a row's RELATIONSHIP to its neighbours or to the
 * whole, so they run here — before anything is written, and over the whole set, so a violation
 * refuses the artefact WHOLE.
 */
function assertArtifactIsSeedable(artifact: z.infer<typeof artifactSchema>): void {
  const problems: string[] = [];
  const seenPlates = new Set<string>();
  let districtTotal = 0;

  for (const province of artifact.iller) {
    const { plateCode } = province;

    if (seenPlates.has(plateCode)) {
      problems.push(`plate ${plateCode} appears more than once`);
    }
    seenPlates.add(plateCode);

    const names = province.districts.map((district) => district.nameTr);
    districtTotal += names.length;

    // The artefact's own witness of its own list length. A truncated list stops agreeing with the
    // number the collector printed beside it — the books lane's `Soru {n}` tag, in this lane's form.
    if (province.districtCount !== names.length) {
      problems.push(
        `plate ${plateCode} declares districtCount=${String(province.districtCount)} but carries ` +
          `${String(names.length)} district(s)`,
      );
    }

    const seenNames = new Set<string>();
    for (const name of names) {
      if (seenNames.has(name)) {
        // `UQ_districts_province_name_tr` would reject the second row mid-transaction anyway;
        // failing here names the province instead of surfacing a raw constraint violation.
        problems.push(`plate ${plateCode} lists ${JSON.stringify(name)} more than once`);
      }
      seenNames.add(name);
    }

    assertWritingForm(plateCode, names, problems);
  }

  // Türkiye has exactly 81 plate codes and every one of them is an il. A missing plate is a hole in
  // the registration form nobody would notice until a user from that province tried to register.
  const missing: string[] = [];
  for (let plate = 1; plate <= ARTIFACT_COVERAGE_FLOOR.provinces; plate += 1) {
    const code = String(plate).padStart(2, '0');
    if (!seenPlates.has(code)) {
      missing.push(code);
    }
  }
  if (missing.length > 0) {
    problems.push(`plate code(s) absent from the artefact: ${missing.join(', ')}`);
  }

  // The `_meta` total is a SECOND independent witness, written by the collector rather than derived
  // from the array this loop just walked.
  if (artifact._meta.toplamIlce !== districtTotal) {
    problems.push(
      `_meta.toplamIlce=${String(artifact._meta.toplamIlce)} disagrees with the ` +
        `${String(districtTotal)} district(s) the artefact actually carries`,
    );
  }

  if (artifact.iller.length < ARTIFACT_COVERAGE_FLOOR.provinces) {
    problems.push(
      `coverage floor: ${String(artifact.iller.length)} province(s) < ` +
        `${String(ARTIFACT_COVERAGE_FLOOR.provinces)}`,
    );
  }
  if (districtTotal < ARTIFACT_COVERAGE_FLOOR.districts) {
    problems.push(
      `coverage floor: ${String(districtTotal)} district(s) < ` +
        `${String(ARTIFACT_COVERAGE_FLOOR.districts)}`,
    );
  }

  if (problems.length > 0) {
    throw new DistrictsArtifactError(
      `${DISTRICTS_ARTIFACT_FILENAME} is not seedable:\n  ${problems.join('\n  ')}`,
    );
  }
}

/**
 * The MAPPING-AND-PLAUSIBILITY gate — `CONVENTIONS.md` §2's requirement on a PR that commits bulk
 * external data, and the plan's PR-1 acceptance criterion 4.
 *
 * ## Why this is the strongest check on the lane
 * Every other refusal above is internal: the artefact is checked against itself. This one joins it
 * to data that was collected years earlier, by other people, from other sources — the 81 rows of
 * `provinces`. Two independent facts must agree for every one of them:
 *
 * 1. **The il's NAME at that plate code.** This is what catches a row-shifted or mis-assigned
 *    mapping — the failure mode plausible names hide. The artefact derived its plate↔ilçe mapping
 *    geometrically (point-in-polygon over TÜİK's own Düzey-3 polygons), so a systematic off-by-one
 *    would produce 973 perfectly-spelled names attached to the wrong provinces, and every internal
 *    refusal would pass.
 * 2. **The il's DISTRICT COUNT.** `provinces.district_count` is already PUBLISHED — it renders on
 *    the il detail page and in the map summary — so if the two disagree the site states two
 *    different numbers of ilçe for one il at the same time. The seed refuses rather than picking
 *    one.
 *
 * ## Why it refuses instead of correcting
 * A mismatch is a FACT question, not a data-entry slip: either the province table is stale (an ilçe
 * was created by law) or the artefact is wrong. Both answers are a research and ruling matter
 * (NOVA + Atlas), and neither is knowable from inside a seed. So the seed writes nothing and names
 * every disagreeing province, which is the plan's "bir il bile tutmazsa tohum hiçbir şey yazmaz".
 *
 * ## One implementation, two callers
 * The unit spec drives it with the committed `SEED_PROVINCES` (offline, on every CI run); the seed
 * drives it with the rows actually in the database (which may have been seeded from an older
 * province corpus). What the CI gate proves and what the write path refuses are therefore the same
 * list by construction, which is the property `db:seed:books --check` has and the reason it is
 * worth having.
 */
export function assertArtifactMatchesProvinces(
  artifact: DistrictsArtifact,
  provinces: readonly DistrictProvinceReference[],
): void {
  const problems: string[] = [];
  const byPlate = new Map(provinces.map((province) => [province.plateCode, province]));

  for (const province of artifact.provinces) {
    const reference = byPlate.get(province.plateCode);

    if (reference === undefined) {
      problems.push(
        `plate ${province.plateCode} (${province.provinceNameTr}) has no province row — run the ` +
          'geography seed first',
      );
      continue;
    }

    if (reference.nameTr !== province.provinceNameTr) {
      problems.push(
        `plate ${province.plateCode} — the artefact calls this il ` +
          `${JSON.stringify(province.provinceNameTr)}, the province row calls it ` +
          `${JSON.stringify(reference.nameTr)}: the plate↔il mapping disagrees`,
      );
    }

    if (reference.districtCount !== province.districtNamesTr.length) {
      problems.push(
        `plate ${province.plateCode} (${province.provinceNameTr}) — the artefact carries ` +
          `${String(province.districtNamesTr.length)} ilçe, provinces.district_count says ` +
          `${String(reference.districtCount)}`,
      );
    }
  }

  // A province row with no artefact entry is the same hole from the other side: its users would
  // find an empty "İlçe" select. Checked explicitly rather than inferred from the counts above,
  // which only walk the artefact.
  const artefactPlates = new Set(artifact.provinces.map((province) => province.plateCode));
  for (const province of provinces) {
    if (!artefactPlates.has(province.plateCode)) {
      problems.push(
        `plate ${province.plateCode} (${province.nameTr}) exists as a province but has no ilçe in ` +
          'the artefact',
      );
    }
  }

  if (problems.length > 0) {
    throw new DistrictsArtifactError(
      `${DISTRICTS_ARTIFACT_FILENAME} does not agree with the province table — nothing was ` +
        `written:\n  ${problems.join('\n  ')}`,
    );
  }
}

/**
 * Drops everything the tables do not store.
 *
 * `mgmConfirmed` dies here. MGM's legal notice requires prior permission, so `CONVENTIONS.md` §7 is
 * not met and no MGM-derived value may be published; the field records which names MGM independently
 * confirmed, which is evidence about the collection, not data about an ilçe. Discarding it in one
 * place makes "the seed does not publish anything from MGM" a structural property of this module
 * rather than a promise in a comment.
 */
function normalizeArtifact(parsed: z.infer<typeof artifactSchema>): DistrictsArtifact {
  const provinces = parsed.iller.map((province) => ({
    plateCode: province.plateCode,
    provinceNameTr: province.provinceNameTr,
    districtNamesTr: province.districts.map((district) => district.nameTr),
  }));

  return {
    provinces,
    districtCount: provinces.reduce(
      (total, province) => total + province.districtNamesTr.length,
      0,
    ),
  };
}

/**
 * Parses and validates raw artefact text. Pure — no filesystem, no hash — so the unit spec can
 * drive every refusal with a mutated copy instead of writing files.
 */
export function parseDistrictsArtifact(raw: string): DistrictsArtifact {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (cause) {
    throw new DistrictsArtifactError(`${DISTRICTS_ARTIFACT_FILENAME} is not valid JSON.`, {
      cause,
    });
  }

  const parsed = artifactSchema.safeParse(json);
  if (!parsed.success) {
    throw new DistrictsArtifactError(
      `${DISTRICTS_ARTIFACT_FILENAME} does not match the expected shape:\n${formatIssues(parsed.error)}`,
    );
  }

  assertArtifactIsSeedable(parsed.data);
  return normalizeArtifact(parsed.data);
}

/**
 * Reads, hash-checks and validates the committed artefact.
 *
 * The hash is compared BEFORE the shape, so an artefact that was hand-edited into a still-valid
 * shape is reported as what it is — an edited file — rather than passing silently.
 *
 * Both parameters exist so the unit spec can point the real code path at a fixture; nothing in
 * `src/` passes either.
 */
export async function readDistrictsArtifact(
  path: string = districtsArtifactPath(),
  expectedSha256: string = EXPECTED_ARTIFACT_SHA256,
): Promise<DistrictsArtifact> {
  // Read as BYTES and hash the bytes. Hashing the decoded string instead would silently be a
  // DIFFERENT check from the `sha256sum` this module's note and `data/reference/README.md`
  // document, because Node substitutes U+FFFD for an invalid UTF-8 sequence on decode — so two
  // distinct byte files can share one text hash. On a file whose whole content is Turkish place
  // names that is not a corner case: a corrupted `ğ` is exactly the byte a hand-edit produces.
  // (The `data/books` lane's reasoning, which applies here with more force.)
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch (cause) {
    throw new DistrictsArtifactError(
      `cannot read the committed ilçe artefact at ${path}. It is a byte copy of ` +
        "Owner's Inbox/oturum-lite/ilce-listesi.json and must be committed; run this command from " +
        'the repository root.',
      { cause },
    );
  }

  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== expectedSha256) {
    throw new DistrictsArtifactError(
      `${path} does not match its pinned SHA-256. The committed copy is never hand-edited: it is ` +
        'replaced wholesale by a new collection, and the pin moves with it in the same PR. This ' +
        'check cannot see the Inbox source, so it does not tell you the two copies agree — only ' +
        `that this one is unchanged since review.\n  expected ${expectedSha256}\n  actual   ${actual}`,
    );
  }

  return parseDistrictsArtifact(bytes.toString('utf8'));
}
