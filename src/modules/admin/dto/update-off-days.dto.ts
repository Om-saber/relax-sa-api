import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateOffDaysDto {
  @ApiProperty({
    example: [5, 6],
    description: 'Weekday numbers: 0=Sunday, 1=Monday, ..., 6=Saturday',
  })
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekdays!: number[];
}
