import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddClientNoteDto {
  @ApiProperty({ example: 'تفضل زيوت اللافندر، تفضل جلسات هادئة' })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  note!: string;
}
