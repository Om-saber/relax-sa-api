import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminUsersService } from './admin-users.service';
import { AdminRolesService } from './admin-roles.service';
import { AdminBookingsService } from './admin-bookings.service';
import { AdminOverviewService } from './admin-overview.service';
import { AdminServicesService } from './admin-services.service';
import { AdminCitiesService } from './admin-cities.service';
import { AdminClientsService } from './admin-clients.service';
import { AdminSettingsService } from './admin-settings.service';

@Module({
  controllers: [AdminController],
  providers: [AdminUsersService, AdminRolesService, AdminBookingsService, AdminOverviewService, AdminServicesService, AdminCitiesService, AdminClientsService, AdminSettingsService],
})
export class AdminModule {}
