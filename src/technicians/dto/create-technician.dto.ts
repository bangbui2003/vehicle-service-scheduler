import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEmail, IsNotEmpty, IsString, ArrayNotEmpty } from 'class-validator';

export class CreateTechnicianDto {
  @ApiProperty({ example: 'uuid-dealership-id' })
  @IsString()
  @IsNotEmpty()
  dealershipId: string;

  @ApiProperty({ example: 'John Smith' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'john.smith@dealership.com' })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: ['OIL_CHANGE', 'TIRE_ROTATION'],
    description: 'List of service types this technician can perform',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  specializations: string[];
}
