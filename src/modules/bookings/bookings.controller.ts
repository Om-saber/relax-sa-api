import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { BookingsService } from './bookings.service';
import { QuerySlotsDto } from './dto/query-slots.dto';
import { CreateBookingDto } from './dto/create-booking.dto';

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
}
