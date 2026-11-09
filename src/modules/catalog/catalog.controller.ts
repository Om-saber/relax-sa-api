import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CatalogService } from './catalog.service';
import { QueryServicesDto } from './dto/query-services.dto';

@ApiTags('Catalog')
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Public()
  @Get('categories')
  @ApiOperation({ summary: 'قائمة فئات الخدمات' })
  listCategories() {
    return this.catalog.listCategories();
  }

  @Public()
  @Get('cities')
  @ApiOperation({ summary: 'قائمة المدن النشطة' })
  listCities() {
    return this.catalog.listCities();
  }

  @Public()
  @Get('services')
  @ApiOperation({ summary: 'قائمة الخدمات (مع فلترة اختيارية بالفئة/البحث/المدينة)' })
  listServices(@Query() query: QueryServicesDto) {
    return this.catalog.listServices(query);
  }

  @Public()
  @Get('services/:slug')
  @ApiParam({ name: 'slug', description: 'معرّف الخدمة (مثل calm-package)' })
  @ApiOperation({ summary: 'تفاصيل خدمة واحدة + المتغيرات + الإضافات' })
  getService(@Param('slug') slug: string) {
    return this.catalog.getServiceBySlug(slug);
  }

  @Public()
  @Get('packages')
  @ApiOperation({ summary: 'قائمة الباقات' })
  listPackages() {
    return this.catalog.listPackages();
  }

  @Public()
  @Get('packages/:slug')
  @ApiParam({ name: 'slug', description: 'معرّف الباقة' })
  @ApiOperation({ summary: 'تفاصيل باقة واحدة + الخدمات المضمنة' })
  getPackage(@Param('slug') slug: string) {
    return this.catalog.getPackageBySlug(slug);
  }
}
