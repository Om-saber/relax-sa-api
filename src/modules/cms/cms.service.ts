import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const BANNER_KEY_PREFIX = 'home-banner';

@Injectable()
export class CmsService {
  constructor(private readonly prisma: PrismaService) {}

  // Arabic is the primary language; English is the fallback when Arabic is empty.

  async listPages() {
    const pages = await this.prisma.cmsPage.findMany({
      where: { isPublished: true },
      orderBy: { slug: 'asc' },
      select: { slug: true, titleAr: true, titleEn: true },
    });
    return pages.map((p) => ({ slug: p.slug, title: p.titleAr || p.titleEn || '' }));
  }

  async getPage(slug: string) {
    const page = await this.prisma.cmsPage.findFirst({
      where: { slug, isPublished: true },
      select: { slug: true, titleAr: true, titleEn: true, contentAr: true, contentEn: true },
    });
    if (!page) throw new NotFoundException('الصفحة غير موجودة');
    return {
      slug: page.slug,
      title: page.titleAr || page.titleEn || '',
      content: page.contentAr || page.contentEn || '',
    };
  }

  async listFaqs() {
    const faqs = await this.prisma.faq.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, questionAr: true, questionEn: true, answerAr: true, answerEn: true, sortOrder: true },
    });
    return faqs.map((f) => ({
      id: f.id,
      question: f.questionAr || f.questionEn || '',
      answer: f.answerAr || f.answerEn || '',
      order: f.sortOrder,
    }));
  }

  async listBanners() {
    const blocks = await this.prisma.cmsBlock.findMany({
      where: { isActive: true, key: { startsWith: BANNER_KEY_PREFIX } },
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
      select: { key: true, titleAr: true, titleEn: true, contentAr: true, contentEn: true, imageUrl: true },
    });
    // CmsBlock has no subtitle/link columns: titleEn is used as the subtitle and
    // contentAr holds the link target (same convention as scripts/seed-demo.ts).
    return blocks.map((b) => ({
      key: b.key,
      title: b.titleAr || b.titleEn || '',
      subtitle: b.titleAr ? b.titleEn : null,
      image: b.imageUrl,
      link: b.contentAr || b.contentEn || null,
    }));
  }
}
