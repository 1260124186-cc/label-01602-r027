/**
 * 我的房源资料包导出 API
 * GET /api/listings/my/export - 导出当前用户的投稿与审核记录快照（JSON 文件下载）
 *
 * 说明：
 * - 仅包含当前登录用户本人有权查看的内容（自己发布的房源及其审核状态）
 * - exportedAt 标记本资料包对应的数据时间点
 * - 文件在请求时一次性生成，下载完成后发生的任何修改都不会改变已生成的内容
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticateRequest, unauthorizedResponse } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // 认证请求
    const auth = await authenticateRequest(request);
    if (!auth.success || !auth.user) {
      return unauthorizedResponse(auth.error);
    }

    // 快照时间点：在读取数据前确定，资料包内容对应该时刻
    const exportedAt = new Date();

    // 只查询当前用户本人的房源（含审核状态与驳回原因）
    const listings = await prisma.listing.findMany({
      where: { userId: auth.user.id },
      orderBy: { createdAt: 'desc' },
    });

    // 生成完整快照（此刻之后的数据修改不影响已生成内容）
    const snapshot = {
      exportedAt: exportedAt.toISOString(),
      note: '本文件是 exportedAt 时刻生成的数据快照，仅包含您本人有权查看的投稿与审核记录；生成之后对平台数据的任何修改都不会改变本文件的内容。',
      user: {
        id: auth.user.id,
        name: auth.user.name,
        email: auth.user.email,
        registeredAt: auth.user.createdAt,
      },
      summary: {
        total: listings.length,
        pending: listings.filter(l => l.status === 'pending').length,
        approved: listings.filter(l => l.status === 'approved').length,
        rejected: listings.filter(l => l.status === 'rejected').length,
      },
      listings: listings.map(listing => ({
        id: listing.id,
        title: listing.title,
        rent: listing.rent,
        address: listing.address,
        rentType: listing.rentType,
        area: listing.area,
        floor: listing.floor,
        tags: listing.tags,
        description: listing.description,
        status: listing.status,
        rejectReason: listing.rejectReason,
        submittedAt: listing.createdAt.toISOString(),
        updatedAt: listing.updatedAt.toISOString(),
      })),
    };

    // 文件名携带快照时间点（冒号替换为连字符以兼容各操作系统）
    const timestamp = exportedAt.toISOString().replace(/:/g, '-');
    const filename = `my-listings-export-${timestamp}.json`;

    console.log(`[Listings] 资料包导出成功: user=${auth.user.email}, listings=${listings.length}`);

    return new NextResponse(JSON.stringify(snapshot, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        // 个人数据不缓存，确保每次下载都是新生成的快照
        'Cache-Control': 'no-store',
      },
    });

  } catch (error) {
    console.error('[Listings] 资料包导出失败:', error);
    return NextResponse.json(
      { success: false, error: '导出资料包失败' },
      { status: 500 }
    );
  }
}
