import { IsEnum, IsInt, IsOptional, IsString, IsUrl, Max, Min, MinLength } from 'class-validator';
import { sourceTypeSchema } from '@atmp/contracts';

export class CreateSourceDto {
  @IsString() @MinLength(1) name!: string;
  @IsEnum(sourceTypeSchema.enum) type!: 'RSS' | 'WEB';
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) url!: string;
  @IsOptional() @IsInt() @Min(-100) @Max(100) priority?: number;
}
export class UpdateSourceDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) url?: string;
  @IsOptional() @IsEnum(['ACTIVE', 'PAUSED', 'DISABLED']) status?: 'ACTIVE' | 'PAUSED' | 'DISABLED';
  @IsOptional() @IsInt() @Min(-100) @Max(100) priority?: number;
}
