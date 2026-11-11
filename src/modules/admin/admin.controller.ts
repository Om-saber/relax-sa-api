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
import { AdminSettingsService } from './admin-settings.service';
import { AdminReportsService } from './admin-reports.service';
import { AdminTicketsService } from './admin-tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { AdminBlackoutsService } from './admin-blackouts.service';
import { CreateBlackoutDto } from './dto/create-blackout.dto';
import { QueryAdminBookingsDto } from './dto/query-admin-bookings.dto';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { QueryAdminServicesDto } from './dto/query-admin-services.dto';
import { CreateCityDto } from './dto/create-city.dto';
import { QueryAdminClientsDto } from './dto/query-admin-clients.dto';
import { AddClientNoteDto } from './dto/add-client-note.dto';
import { AssignSpecialistDto } from './dto/assign-specialist.dto';
import { UpdateOffDaysDto } from './dto/update-off-days.dto';
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
    private readonly settingsService: AdminSettingsService,
    private readonly reportsService: AdminReportsService,
    private readonly ticketsService: AdminTicketsService,
    private readonly blackoutsService: AdminBlackoutsService,
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



  @Patch('staff-profiles/:id/off-days')
  @Permissions('manageStaff')
  @ApiOperation({ summary: 'Update weekly off-days for a staff member' })
  updateStaffOffDays(
    @Param('id') id: string,
    @Body() dto: UpdateOffDaysDto,
  ) {
    return this.users.updateOffDays(id, dto.weekdays);
  }

  @Get('settings/cms')
  @Permissions('manageContent')
  @ApiOperation({ summary: 'Get CMS settings' })
  getCmsSettings() {
    return this.settingsService.getCmsSettings();
  }

  @Patch('settings/cms')
  @Permissions('manageContent')
  @ApiOperation({ summary: 'Update CMS settings' })
  updateCmsSettings(@Body() body: Record<string, unknown>) {
    return this.settingsService.updateCmsSettings(body);
  }

  // ===== Blackouts (Capacity) =====

  @Get('blackouts')
  @Permissions('manageServices')
  @ApiOperation({ summary: 'List active blackout dates' })
  listBlackouts() {
    return this.blackoutsService.list();
  }

  @Post('blackouts')
  @Permissions('manageServices')
  @ApiOperation({ summary: 'Create a blackout date' })
  createBlackout(@Body() dto: CreateBlackoutDto) {
    return this.blackoutsService.create(dto);
  }

  @Delete('blackouts/:id')
  @Permissions('manageServices')
  @ApiOperation({ summary: 'Deactivate a blackout date' })
  deleteBlackout(@Param('id') id: string) {
    return this.blackoutsService.remove(id);
  }

  // ===== Reports =====

  @Get('reports/overview')
  @Permissions('viewReports')
  @ApiOperation({ summary: 'Get reports overview (KPIs + sales by city + top services)' })
  getReportsOverview() {
    return this.reportsService.getOverview();
  }

  // ===== Tickets (CRM) =====

  @Get('tickets')
  @Permissions('manageComplaints')
  @ApiOperation({ summary: 'List all tickets' })
  listTickets() {
    return this.ticketsService.list();
  }

  @Post('tickets')
  @Permissions('manageComplaints')
  @ApiOperation({ summary: 'Create a new ticket' })
  createTicket(@Body() dto: CreateTicketDto) {
    return this.ticketsService.create(dto);
  }

  @Patch('tickets/:id/status')
  @Permissions('manageComplaints')
  @ApiOperation({ summary: 'Update ticket status' })
  updateTicketStatus(
    @Param('id') id: string,
    @Body() body: { status: any; resolutionNotes?: string },
  ) {
    return this.ticketsService.updateStatus(id, body.status, body.resolutionNotes);
  }

  // ===== Settings =====

  @Get('settings/booking')
  @Permissions('manageServices')
  @ApiOperation({ summary: 'Get booking settings' })
  getBookingSettings() {
    return this.settingsService.getBookingSettings();
  }

  @Patch('settings/booking')
  @Permissions('manageServices')
  @ApiOperation({ summary: 'Update booking settings' })
  updateBookingSettings(@Body() body: Record<string, unknown>) {
    return this.settingsService.updateBookingSettings(body);
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


  @Patch('bookings/:id/assign')
  @Permissions('editBookings')
  @ApiOperation({ summary: 'Assign specialist to booking (with double-booking guard)' })
  assignSpecialist(@Param('id') id: string, @Body() dto: AssignSpecialistDto) {
    return this.bookings.assignSpecialist(id, dto.specialistId);
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
