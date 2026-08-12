import { ApiProperty } from '@nestjs/swagger';
import { EARTHQUAKE_PROVIDER_AFAD, type EarthquakeProvider } from '../earthquake.types';

/**
 * Provider attribution — DATA, and a LEGAL obligation rather than a nicety.
 *
 * The duty comes from the TDVMS Yönetmeliği (RG 28.08.2015/29459): m.5/1-f serves the data with
 * no preconditions, and **m.9/4 makes crediting the providing institution mandatory**
 * (DEC 2026-07-30j). A missing attribution row is therefore a regulatory breach, not a degraded
 * widget — which is why E3 will carry these values as a COMPILED CONSTANT rather than seed data
 * (the marine attribution-catalogue precedent: an unseeded database would publish AFAD data
 * uncredited), and why the array is populated on EVERY response including the cold path, at
 * every `dataStatus`.
 *
 * ## Why this class carries no example values in E1
 * The strings themselves are E3's (SPEC §16), and their canonical home is the ledger:
 * `provenance/integrations.md`, "AFAD TDVMS earthquakes". SPEC §20.2 recorded that the
 * attribution line already lives in three places in two different forms; minting a fourth copy
 * here — in a committed artifact the web repo codegens from — before E3's byte-pinned constant
 * exists is exactly the drift that record complains about. The descriptions point at the ledger
 * instead. The strings are also an untouchable class (`CONTENT-STYLE.md` §22: licence, liability
 * and KVKK text), so when they land they are copied verbatim and never translated, shortened or
 * rewritten.
 *
 * No string on this leg may imply endorsement — no "AFAD approved", no "official AFAD app"
 * (`CONVENTIONS.md` §7). The existing `endorsement-guard` denylist runs over every string this
 * leg serves once E3 serves any.
 */
export class EarthquakeAttributionDto {
  @ApiProperty({
    type: String,
    enum: [EARTHQUAKE_PROVIDER_AFAD],
    description: 'Machine token for the source. AFAD is the sole Faz-1 provider.',
  })
  providerId!: EarthquakeProvider;

  @ApiProperty({
    type: String,
    description:
      'Provider name as credited. Verbatim from the provenance ledger ' +
      '("AFAD TDVMS earthquakes" in provenance/integrations.md); never translated or shortened.',
  })
  providerName!: string;

  @ApiProperty({
    type: String,
    description:
      'The required attribution line, verbatim and untranslated. Its canonical text lives in ' +
      'provenance/integrations.md and is byte-pinned by a spec when it lands in E3. Display is ' +
      'the web repo\'s decision; carrying it on every response removes "it was not shown" as a ' +
      'possibility.',
  })
  requiredNoticeTr!: string;

  @ApiProperty({
    type: String,
    description:
      'The regulation the attribution duty arises from, verbatim. Same untouchable class as ' +
      'the notice.',
  })
  regulationReference!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Always null for AFAD, deliberately: there is no CC-style licence URL, because the ' +
      'obligation arises from a regulation rather than a licence. Inventing a plausible URL ' +
      'would be a false statement about the terms.',
  })
  licenceUrl!: string | null;
}
