import { IsEmail, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty()
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiProperty()
  @IsEmail()
  @MaxLength(120)
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password!: string;

  @ApiProperty()
  @IsUUID()
  roleId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}
