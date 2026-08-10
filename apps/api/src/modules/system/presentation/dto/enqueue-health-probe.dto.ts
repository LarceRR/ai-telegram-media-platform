import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class EnqueueHealthProbeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  probeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
