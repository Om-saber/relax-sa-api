import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignSpecialistDto {
  @ApiProperty({ example: 'uuid-of-staff-profile' })
  @IsUUID()
  specialistId!: string;
}
