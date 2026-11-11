import { IsString, IsOptional, IsEnum, IsPhoneNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Priority } from '@prisma/client';

export class CreateTicketDto {
  @ApiProperty({ example: 'نورة فهد الدوسري' })
  @IsString()
  customerName!: string;

  @ApiProperty({ example: '0559876543' })
  @IsString()
  customerPhone!: string;

  @ApiProperty({ example: 'تأخير بسيط' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ example: 'تأخرت الأخصائية 12 دقيقة' })
  @IsString()
  subject!: string;

  @ApiProperty({ example: 'الأخصائية أبلغتني ولكن تأخرت...' })
  @IsString()
  description!: string;

  @ApiPropertyOptional({ enum: Priority, default: Priority.MEDIUM })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;
}
