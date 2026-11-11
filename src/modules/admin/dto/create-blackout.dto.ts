import { IsString, IsOptional, IsUUID, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBlackoutDto {
  @ApiProperty({ example: 'صيانة دورية' })
  @IsString()
  title!: string;

  @ApiProperty({ example: '2026-12-25' })
  @IsDateString()
  date!: string;

  @ApiPropertyOptional({ example: 'uuid-of-city' })
  @IsOptional()
  @IsUUID()
  cityId?: string;
}
