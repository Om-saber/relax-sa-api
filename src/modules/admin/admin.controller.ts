import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AdminUsersService } from './admin-users.service';
import { AdminRolesService } from './admin-roles.service';
import { AdminBookingsService } from './admin-bookings.service';
import { AdminOverviewService } from './admin-overview.service';
import { AdminServicesService } from './admin-services.service';
import { AdminCitiesService } from './admin-cities.service';
import { AdminClientsService } from './admin-clients.service';
import { QueryAdminBookingsDto } from './dto/query-admin-bookings.dto';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { QueryAdminServicesDto } from './dto/query-admin-services.dto';
import { CreateCityDto } from './dto/create-city.dto';
import { QueryAdminClientsDto } from './dto/query-admin-clients.dto';
import { AddClientNoteDto } from './dto/add-client-note.dto';
import { UpdateCityDto } from './dto/update-city.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly users: AdminUsersService,
    private readonly roles: AdminRolesService,
    private readonly bookings: AdminBookingsService,
    private readonly overview: AdminOverviewService,
    private readonly services: AdminServicesService,
    private readonly cities: AdminCitiesService,
    private readonly clientsService: AdminClientsService,
  ) {}
  @Get('overview')
  @Permissions('viewBookings')
  @ApiOperation({ summary: 'Dashboard overview stats (revenue, bookings, clients, staff)' })
  getOverview() {
    return this.overview.getOverview();
  }


  @Get('users')
  @Permissions('manageStaff')
  @ApiOperation({ summary: 'قائمة الموظفات والمديرين' })
  listUsers(@Query() query: QueryUsersDto) {
    return this.users.list(query);
  }

  @Post('users')
  @Permissions('manageStaff')
  @ApiOperation({ summary: 'إنشاء موظفة/مدير جديد' })
  createUser(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch('users/:id')
  @Permissions('manageStaff')
  @ApiOperation({ summary: 'تعديل بيانات مستخدمة' })
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Delete('users/:id')
  @Permissions('manageStaff')
  @ApiOperation({ summary: 'حذف/تعطيل مستخدمة' })
  deleteUser(@Param('id') id: string) {
    return this.users.remove(id);
  }

  @Post('users/:id/reset-password')
  @Permissions('manageStaff')
  @ApiOperation({ summary: 'إعادة تعيين كلمة المرور' })
  resetPassword(@Param('id') id: string) {
    return this.users.resetPassword(id);
  }

  @Get('roles')
  @Permissions('manageRoles')
  @ApiOperation({ summary: 'قائمة الأدوار + الصلاحيات' })
  listRoles() {
    return this.roles.listRoles();
  }

  @Get('permissions')
  @Permissions('manageRoles')
  @ApiOperation({ summary: 'قائمة الصلاحيات المتاحة' })
  listPermissions() {
    return this.roles.listPermissions();
  }

  @Patch('roles/:id/permissions')
  @Permissions('manageRoles')
  @ApiOperation({ summary: 'تعديل صلاحيات دور' })
  updateRolePermissions(@Param('id') id: string, @Body() dto: UpdateRolePermissionsDto) {
    return this.roles.updateRolePermissions(id, dto);
  }

  @Get('bookings')
  @Permissions('viewBookings')
  @ApiOperation({ summary: 'قائمة الحجوزات (مع فلاتر + pagination)' })
  listBookings(@Query() query: QueryAdminBookingsDto) {
    return this.bookings.list(query);
  }

  @Patch('bookings/:id/status')
  @Permissions('editBookings')
  @ApiOperation({ summary: 'تحديث حالة حجز' })
  updateBookingStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.bookings.updateStatus(id, status);
  }


  // ═══════════════ Services (CRUD) ═══════════════

  @Get('services')
  @Permissions('manageServices')
  @ApiOperation({ summary: 'قائمة الخدمات (مع فلاتر)' })
  listServices(@Query() query: QueryAdminServicesDto) {
    return this.services.list(query);
  }

  @Post('services')
  @Permissions('manageServices')
  @ApiOperation({ summary: 'إنشاء خدمة جديدة' })
  createService(@Body() dto: CreateServiceDto) {
    return this.services.create(dto);
  }

  @Patch('services/:id')
  @Permissions('manageServices')
  @ApiOperation({ summary: 'تعديل خدمة' })
  updateService(@Param('id') id: string, @Body() dto: UpdateServiceDto) {
    return this.services.update(id, dto);
  }

  @Patch('services/:id/toggle')
  @Permissions('manageServices')
  @ApiOperation({ summary: 'تفعيل/تعطيل خدمة' })
  toggleService(@Param('id') id: string) {
    return this.services.toggle(id);
  }

  @Delete('services/:id')
  @Permissions('manageServices')
  @ApiOperation({ summary: 'حذف خدمة (لو مش مستخدمة)' })
  deleteService(@Param('id') id: string) {
    return this.services.remove(id);
  }



  // ===== Cities (CRUD) =====
  @Get('cities')
  @Permissions('manageServices')
  @ApiOperation({ summary: 'list cities' })
  listCities() {
    return this.cities.list();
  }

  @Post('cities')
  @Permissions('manageServices')
  @ApiOperation({ summary: 'create city' })
  createCity(@Body() dto: CreateCityDto) {
    return this.cities.create(dto);
  }

  @Patch('cities/:id')
  @Permissions('manageServices')
  @ApiOperation({ summary: 'update city' })
  updateCity(@Param('id') id: string, @Body() dto: UpdateCityDto) {
    return this.cities.update(id, dto);
  }

  @Patch('cities/:id/toggle')
  @Permissions('manageServices')
  @ApiOperation({ summary: 'toggle city' })
  toggleCity(@Param('id') id: string) {
    return this.cities.toggle(id);
  }

  @Delete('cities/:id')
  @Permissions('manageServices')
  @ApiOperation({ summary: 'delete city' })
  deleteCity(@Param('id') id: string) {
    return this.cities.remove(id);
  }


  // ===== Clients (CRM) =====

  @Get('clients')
  @Permissions('viewBookings')
  @ApiOperation({ summary: 'list clients' })
  listClients(@Query() query: QueryAdminClientsDto) {
    return this.clientsService.list(query);
  }

  @Get('clients/:id')
  @Permissions('viewBookings')
  @ApiOperation({ summary: 'client details with bookings and payments' })
  getClient(@Param('id') id: string) {
    return this.clientsService.getOne(id);
  }

  @Post('clients/:id/notes')
  @Permissions('viewBookings')
  @ApiOperation({ summary: 'add internal note to client' })
  addClientNote(@Param('id') id: string, @Body() dto: AddClientNoteDto) {
    return this.clientsService.addNote(id, dto.note);
  }
}
