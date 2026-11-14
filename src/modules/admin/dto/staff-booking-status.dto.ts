import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';

export class StaffBookingStatusDto {
  @ApiProperty({
    enum: ['IN_PROGRESS', 'COMPLETED'],
    example: 'IN_PROGRESS',
  })
  @IsEnum(BookingStatus)
  status!: BookingStatus;
}
