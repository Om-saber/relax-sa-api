import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { BookingsService } from './bookings.service';
import { QuerySlotsDto } from './dto/query-slots.dto';

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
}
