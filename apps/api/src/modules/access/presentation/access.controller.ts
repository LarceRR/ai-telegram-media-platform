import { Body, Controller, Headers, Post } from '@nestjs/common';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { AccessService } from '../application/access.service';
class BootstrapDto { @IsEmail() email!: string; @IsString() @MinLength(1) @MaxLength(120) displayName!: string; }
class CreateUserDto extends BootstrapDto {}
@Controller('access')
export class AccessController {
  constructor(private readonly access: AccessService) {}
  @Post('bootstrap') bootstrap(@Body() dto: BootstrapDto) { return this.access.bootstrap(dto.email, dto.displayName); }
  @Post('users') createUser(@Headers('x-actor-id') actorId: string, @Body() dto: CreateUserDto) { return this.access.createUser(actorId, dto.email, dto.displayName); }
}
