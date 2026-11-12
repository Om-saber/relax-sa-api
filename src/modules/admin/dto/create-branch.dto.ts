import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBranchDto {
  @ApiProperty({ example: 'uuid-of-city' })
  @IsUUID()
  cityId!: string;

  @ApiProperty({ example: 'فرع الرياض الرئيسي' })
  @IsString() @MinLength(2) @MaxLength(120)
  nameAr!: string;

  @ApiProperty({ example: 'Riyadh Main Branch' })
  @IsString() @MaxLength(120)
  nameEn!: string;

  @ApiPropertyOptional({ example: 'سارة الأحمد' })
  @IsOptional() @IsString() @MaxLength(120)
  managerName?: string;

  @ApiPropertyOptional({ example: '0501234567' })
  @IsOptional() @IsString() @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
