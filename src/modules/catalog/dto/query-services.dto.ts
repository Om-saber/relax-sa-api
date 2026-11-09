import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class QueryServicesDto {
  @ApiPropertyOptional({ description: 'فلترة حسب مفتاح الفئة (packages, massage, moroccan...)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @ApiPropertyOptional({ description: 'بحث بالاسم (عربي أو إنجليزي)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: 'مفتاح المدينة (riyadh, khobar, dammam) لضبط السعر' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  city?: string;
}
