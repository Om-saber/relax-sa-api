import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AdminUsersService } from './admin-users.service';
import { AdminRolesService } from './admin-roles.service';
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
  ) {}

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
}
