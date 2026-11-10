import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BookingPaymentDto {
  @ApiProperty({ example: 'uuid-here' })
  @IsUUID()
  bookingId!: string;
}

export class CaptureOrderDto {
  @ApiProperty({ example: 'PAYPAL-ORDER-ID' })
  paypalOrderId!: string;
}
