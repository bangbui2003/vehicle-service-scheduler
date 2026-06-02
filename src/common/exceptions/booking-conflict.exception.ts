import { HttpException, HttpStatus } from '@nestjs/common';
import { NextAvailableSlot } from '../../slots/slots.service';

export interface BookingConflictResponse {
  statusCode: number;
  message: string;
  nextAvailableSlot?: NextAvailableSlot;
}

export class BookingConflictException extends HttpException {
  constructor(message: string, nextAvailableSlot?: NextAvailableSlot) {
    const responseBody: BookingConflictResponse = {
      statusCode: HttpStatus.CONFLICT,
      message,
      nextAvailableSlot,
    };
    super(responseBody, HttpStatus.CONFLICT);
  }
}
