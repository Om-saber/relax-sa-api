import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class QuerySlotsDto {
  @ApiProperty({ description: 'Date in YYYY-MM-DD format', example: '2026-11-20' })
  @IsDateString()
  date!: string;

  @ApiPropertyOptional({ description: 'City key (riyadh/khobar/dammam)', example: 'riyadh' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  city?: string;
}
