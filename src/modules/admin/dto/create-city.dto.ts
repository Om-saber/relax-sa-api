import { Type } from 'class-transformer';
import {
  IsBoolean, IsInt, IsNumber, IsOptional, IsString,
  Matches, MaxLength, Min, MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCityDto {
  @ApiProperty({ example: 'jeddah' })
  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'key must be lowercase letters, digits, or hyphens' })
  @MaxLength(50)
  key!: string;

  @ApiProperty({ example: 'جدة' })
  @IsString() @MinLength(2) @MaxLength(80)
  nameAr!: string;

  @ApiProperty({ example: 'Jeddah' })
  @IsString() @MaxLength(80)
  nameEn!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 25 })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  deliveryFee?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.1)
  surgeMultiplier?: number;

  @ApiPropertyOptional({ example: '10:00 - 23:00' })
  @IsOptional() @IsString() @MaxLength(100)
  operatingHours?: string;

  @ApiPropertyOptional({ example: 40 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  maxDailyCapacity?: number;
}
