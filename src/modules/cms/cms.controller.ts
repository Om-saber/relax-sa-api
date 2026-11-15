import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CmsService } from './cms.service';

@ApiTags('CMS')
@Controller('cms')
export class CmsController {
  constructor(private readonly cms: CmsService) {}

  @Public()
  @Get('pages')
  @ApiOperation({ summary: 'قائمة الصفحات المنشورة' })
  listPages() {
    return this.cms.listPages();
  }

  @Public()
  @Get('pages/:slug')
  @ApiOperation({ summary: 'محتوى صفحة حسب المعرّف النصي' })
  getPage(@Param('slug') slug: string) {
    return this.cms.getPage(slug);
  }

  @Public()
  @Get('faqs')
  @ApiOperation({ summary: 'الأسئلة الشائعة' })
  listFaqs() {
    return this.cms.listFaqs();
  }

  @Public()
  @Get('banners')
  @ApiOperation({ summary: 'بنرات الصفحة الرئيسية النشطة' })
  listBanners() {
    return this.cms.listBanners();
  }
}
