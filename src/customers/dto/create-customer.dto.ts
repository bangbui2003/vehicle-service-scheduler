import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty({ example: 'Nguyen Van A' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'nguyenvana@email.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ required: false, example: '+84912345678' })
  @IsString()
  @IsOptional()
  phone?: string;
}
