import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ClientTier } from '@prisma/client';

export class QueryAdminClientsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: ClientTier })
  @IsOptional()
  @IsEnum(ClientTier)
  tier?: ClientTier;
}
