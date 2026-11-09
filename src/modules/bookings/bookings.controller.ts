import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BookingsService } from './bookings.service';
import { QuerySlotsDto } from './dto/query-slots.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { RescheduleBookingDto } from './dto/reschedule-booking.dto';

@ApiTags('Bookings')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Public()
  @Get('available-slots')
  @ApiOperation({ summary: 'المواعيد المتاحة لتاريخ معين (يستخدمه العميل قبل الحجز)' })
  getAvailableSlots(@Query() query: QuerySlotsDto) {
    return this.bookings.getAvailableSlots(query);
  }

  @Public()
  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'إنشاء حجز جديد (يدعم الضيف والمسجلة)' })
  create(@Body() dto: CreateBookingDto) {
    return this.bookings.create(dto);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'حجوزات المستخدمة الحالية (سابقة + قادمة)' })
  getMyBookings(@CurrentUser('id') userId: string) {
    return this.bookings.getMyBookings(userId);
  }

  @ApiBearerAuth()
  @Get(':id')
  @ApiOperation({ summary: 'تفاصيل حجز محدد (مع التحقق من الملكية)' })
  getBooking(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.bookings.getBookingById(id, userId);
  }

  @ApiBearerAuth()
  @Patch(':id/cancel')
  @ApiOperation({ summary: 'إلغاء حجز (بتعليل اختياري)' })
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelBookingDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.bookings.cancelBooking(id, dto.reason, userId);
  }

  @ApiBearerAuth()
  @Patch(':id/reschedule')
  @ApiOperation({ summary: 'إعادة جدولة حجز (تاريخ + موعد جديد)' })
  reschedule(
    @Param('id') id: string,
    @Body() dto: RescheduleBookingDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.bookings.rescheduleBooking(id, dto, userId);
  }
}
