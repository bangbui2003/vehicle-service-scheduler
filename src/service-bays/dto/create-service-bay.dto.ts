import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateServiceBayDto {
  @ApiProperty({ example: 'uuid-dealership-id' })
  @IsString()
  @IsNotEmpty()
  dealershipId: string;

  @ApiProperty({ example: 'Bay 1' })
  @IsString()
  @IsNotEmpty()
  name: string;
}
