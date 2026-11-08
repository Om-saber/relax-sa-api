import { IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @MinLength(9)
  @MaxLength(20)
  phone!: string;

  @IsString()
  @Length(4, 6)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;
}
