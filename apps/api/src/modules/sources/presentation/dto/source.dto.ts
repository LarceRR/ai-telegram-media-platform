import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { sourceTypeSchema } from '@atmp/contracts';

export class CreateSourceDto {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsEnum(sourceTypeSchema.enum) type!: 'RSS' | 'WEB';
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) url!: string;
  @IsOptional() @IsInt() @Min(-100) @Max(100) priority?: number;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  categories?: string[];
}

export class UpdateSourceDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) name?: string;
  @IsOptional() @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) url?: string;
  @IsOptional() @IsEnum(['ACTIVE', 'PAUSED', 'DISABLED']) status?: 'ACTIVE' | 'PAUSED' | 'DISABLED';
  @IsOptional() @IsInt() @Min(-100) @Max(100) priority?: number;
  /** Channel-level binding switch: keeps the source but stops ingesting it here. */
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  categories?: string[];
}
