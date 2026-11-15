import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaymentsService } from './payments.service';
import { BookingPaymentDto } from './dto/booking-payment.dto';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @ApiBearerAuth()
  @Post('paypal/create-order')
  @HttpCode(201)
  @ApiOperation({ summary: 'إنشاء PayPal Order لحجز معين' })
  createOrder(@Body() dto: BookingPaymentDto, @CurrentUser('id') userId: string) {
    return this.payments.createOrderForBooking(dto.bookingId, userId);
  }

  @Public()
  @Post('paypal/capture/:orderId')
  @HttpCode(200)
  @ApiOperation({ summary: 'تأكيد الدفع بعد رجوع العميلة من PayPal' })
  captureOrder(@Param('orderId') orderId: string) {
    return this.payments.captureOrderForBooking(orderId);
  }

  @ApiBearerAuth()
  @Get('booking/:bookingId/status')
  @ApiOperation({ summary: 'حالة الدفع لحجز' })
  getStatus(
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.payments.getPaymentStatusForBooking(bookingId, userId);
  }
}
