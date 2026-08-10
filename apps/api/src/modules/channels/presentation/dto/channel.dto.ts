import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateChannelDto {
  @IsString() @MinLength(1) @MaxLength(40) telegramChatId!: string;
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(100) username?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(10) language?: string;
  @IsOptional() @IsIn(['MODERATED', 'AUTO']) mode?: 'MODERATED' | 'AUTO';
}

export class UpdateChannelDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(100) username?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(10) language?: string;
  @IsOptional() @IsIn(['MODERATED', 'AUTO']) mode?: 'MODERATED' | 'AUTO';
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateSettingsDto {
  @IsOptional() @IsInt() @Min(0) @Max(10) minInterest?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10) minQuality?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10) minEvidence?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10) minOriginality?: number;
  @IsOptional() @IsInt() @Min(0) @Max(3) researchMaxLevel?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) forbiddenTopics?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) legalRestrictions?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) blacklist?: string[];
  @IsOptional() @IsString() @MaxLength(80) hookStyle?: string;
  @IsOptional() @IsInt() @Min(80) @Max(10000) maxLength?: number;
  @IsOptional() @IsBoolean() emojiPolicy?: boolean;
  @IsInt() @Min(1) expectedVersion!: number;
}

export class AddMemberDto {
  @IsString() @MinLength(1) @MaxLength(200) externalId!: string;
  @IsString() @MinLength(1) @MaxLength(200) displayName!: string;
  @IsIn(['OWNER', 'EDITOR', 'VIEWER']) role!: 'OWNER' | 'EDITOR' | 'VIEWER';
}

export class UpsertCredentialReferenceDto {
  @IsIn(['TELEGRAM']) provider!: 'TELEGRAM';
  @IsString() @MinLength(1) @MaxLength(200) reference!: string;
}

export function actorExternalId(headers: Record<string, unknown>): string {
  const value = headers['x-user-id'];
  if (typeof value !== 'string' || value.length < 1 || value.length > 200) {
    throw new Error('x-user-id header is required');
  }
  return value;
}
