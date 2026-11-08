import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RequestOtpDto {
  @IsString()
  @MinLength(9)
  @MaxLength(20)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;
}
