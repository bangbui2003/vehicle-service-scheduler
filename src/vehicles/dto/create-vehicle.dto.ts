import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class CreateVehicleDto {
  @ApiProperty({ example: 'uuid-customer-id' })
  @IsString()
  @IsNotEmpty()
  customerId: string;

  @ApiProperty({ example: 'Toyota' })
  @IsString()
  @IsNotEmpty()
  make: string;

  @ApiProperty({ example: 'Camry' })
  @IsString()
  @IsNotEmpty()
  model: string;

  @ApiProperty({ example: 2022 })
  @IsInt()
  @Min(1900)
  @Max(2100)
  year: number;

  @ApiProperty({ example: '51A-123.45' })
  @IsString()
  @IsNotEmpty()
  licensePlate: string;
}
