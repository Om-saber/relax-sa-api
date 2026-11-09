import { IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RescheduleBookingDto {
  @ApiProperty({ example: '2026-11-25' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'صيغة التاريخ يجب أن تكون YYYY-MM-DD' })
  date!: string;

  @ApiProperty({ example: 'slot-2' })
  @IsString()
  @MaxLength(30)
  timeSlotKey!: string;
}
