import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CancelBookingDto {
  @ApiPropertyOptional({ example: 'ظرف طارئ' })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  reason?: string;
}
