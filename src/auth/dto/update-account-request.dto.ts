import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { canonicalizePhone } from '../phone-canonicalization';

const TURKISH_MOBILE_E164 = /^\+905[0-9]{9}$/;
const PROVINCE_PLATE_CODE = /^[0-9]{2}$/;

/**
 * `PUT /api/auth/account`'s request body (T-061).
 *
 * The personal block a member may change about themselves. **Full replacement semantics**, the
 * same contract `UpdateProfileRequestDto` already uses for the education block: every key must
 * be present on every request, and an omitted key is a 400 naming the property. Nothing here is
 * nullable — a member always has a name, a phone and a district. The one exception is
 * `marketingConsent` (T-101), optional with absent = unchanged; see its own docblock.
 *
 * Three fields deliberately absent, each for its own reason:
 * - `email` — changing it needs a proof-of-mailbox round trip to the NEW address, which is its
 *   own flow, not a field on this form. It is published read-only on `ProfileDto`.
 * - `accountRole` — a declared role is set once at registration; letting a request change it
 *   would let the profile matrix be dodged by flipping role and fields in one call.
 * - the six education fields — they are `PUT /api/auth/profile`'s, and splitting the two blocks
 *   is what lets one settings section fail without discarding the other's edits.
 *
 * The four shared field rules are NOT retyped from `RegisterRequestDto`: the same
 * `canonicalizePhone` transform and the same two patterns are imported/spelled identically, so
 * a member cannot store through this route a value registration would have refused.
 */
export class UpdateAccountRequestDto {
  @ApiProperty({ example: 'Ayşe', maxLength: 100, description: 'Ad — trim edilir, boş olamaz.' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({
    example: 'Yılmaz',
    maxLength: 100,
    description: 'Soyad — trim edilir, boş olamaz.',
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({
    example: '+905551234567',
    description:
      'Türkiye cep telefonu, E.164. Yaygın yazımlar (0532…, 90532…, boşluk/tire/parantezli) ' +
      'kabul edilip +90 biçimine katlanır; sonuç bu biçime uymuyorsa 400.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? canonicalizePhone(value) : value,
  )
  @Matches(TURKISH_MOBILE_E164, { message: 'phone must be a Turkish mobile number in +90 form' })
  phone!: string;

  @ApiProperty({
    example: '34',
    pattern: PROVINCE_PLATE_CODE.source,
    description:
      'İlin plaka kodu, iki hane ve başı sıfırla dolgulu — districtId ile birlikte doğrulanır.',
  })
  @Matches(PROVINCE_PLATE_CODE, {
    message: 'provincePlateCode must be exactly two digits (zero-padded)',
  })
  provincePlateCode!: string;

  @ApiProperty({
    format: 'uuid',
    example: '6b3f6f5a-6f5a-4f5a-8f5a-6f5a6f5a6f5a',
    description:
      "`GET /api/reference/districts?plateCode=…`'ün döndürdüğü id. Var olduğu ve " +
      'provincePlateCode ile ait olduğu tek sorguyla doğrulanır (D15).',
  })
  @IsUUID('4')
  districtId!: string;
  /**
   * The one OPTIONAL key on this full-replacement body (T-101), and optional on purpose: consent
   * is a separate decision from the personal block, so a client that only edits a name must not
   * be able to withdraw or grant it by omission. Absent = unchanged.
   */
  @ApiPropertyOptional({
    type: Boolean,
    description:
      'Ticari elektronik ileti onayı (T-101). true: onay verilir (zaten varsa ilk onay anı ' +
      'korunur). false: onay geri alınır. Gönderilmezse mevcut durum değişmez.',
  })
  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;
}
