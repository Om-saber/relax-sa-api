import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class BookingItemDto {
  @ApiPropertyOptional({ example: 'calm-package' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  serviceSlug?: string;

  @ApiPropertyOptional({ example: 'spa-day' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  packageSlug?: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateBookingDto {
  @ApiProperty({ example: 'سارة الأحمد' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  customerName!: string;

  @ApiProperty({ example: '0501234567' })
  @IsString()
  @Matches(/^05\d{8}$/, { message: 'رقم الجوال يجب أن يبدأ بـ 05 ويتكون من 10 أرقام' })
  customerPhone!: string;

  @ApiProperty({ example: 'riyadh' })
  @IsString()
  @MaxLength(30)
  city!: string;

  @ApiPropertyOptional({ example: 'حي الملقا' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  district?: string;

  @ApiPropertyOptional({ example: 'شارع أنس بن مالك، فيلا 14' })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  address?: string;

  @ApiProperty({ example: '2026-11-20' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'صيغة التاريخ يجب أن تكون YYYY-MM-DD' })
  date!: string;

  @ApiProperty({ example: 'slot-3' })
  @IsString()
  @MaxLength(30)
  timeSlotKey!: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  beneficiariesCount?: number;

  @ApiProperty({ type: [BookingItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BookingItemDto)
  items!: BookingItemDto[];

  @ApiPropertyOptional({ example: 'TABBY' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  paymentMethod?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
