import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminUsersService } from './admin-users.service';
import { AdminRolesService } from './admin-roles.service';
import { AdminBookingsService } from './admin-bookings.service';

@Module({
  controllers: [AdminController],
  providers: [AdminUsersService, AdminRolesService, AdminBookingsService],
})
export class AdminModule {}
