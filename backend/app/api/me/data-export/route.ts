/**
 * 个人资料包导出 API
 * GET /api/me/data-export - 导出当前用户本人的账号资料、投稿与审核经历
 *
 * 设计说明：
 * - 仅返回当前登录账号本人有权查看的数据（本人资料 + 本人投稿及其审核结果），
 *   不包含密码等凭证，也不包含任何他人或管理端数据；
 * - 响应内容在请求处理时一次性序列化生成，文件本身即「导出时刻」的静态快照，
 *   下载完成后数据库再发生的任何修改都不会反过来改变已生成的文件；
 * - 通过 Content-Disposition 触发浏览器下载，文件名中包含导出时间点。
 */

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticateRequest, unauthorizedResponse } from '@/lib/auth';

const STATUS_TEXT: Record<string, string> = {
  pending: '待审核',
  approved: '审核通过',
  rejected: '审核驳回',
};

const RENT_TYPE_TEXT: Record<string, string> = {
  whole: '整租',
  shared: '合租',
};

/** 格式化为北京时间字符串，方便用户在资料包中直接阅读 */
function formatBeijingTime(date: Date): string {
  return date.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** 生成紧凑的时间戳，用于文件名，如 20260919-103045 */
function fileTimestamp(date: Date): string {
  const beijingParts = new Date(
    date.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' })
  );
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${beijingParts.getFullYear()}${pad(beijingParts.getMonth() + 1)}${pad(beijingParts.getDate())}` +
    `-${pad(beijingParts.getHours())}${pad(beijingParts.getMinutes())}${pad(beijingParts.getSeconds())}`
  );
}

export async function GET(request: NextRequest) {
  try {
    // 认证请求：未登录或令牌无效直接拒绝，保证资料包只属于本人
    const auth = await authenticateRequest(request);
    if (!auth.success || !auth.user) {
      return unauthorizedResponse(auth.error);
    }

    // 快照时间点：整个资料包只对应这一刻，提前取一次并贯穿全部内容
    const exportedAt = new Date();
    const exportedAtIso = exportedAt.toISOString();

    // 仅查询本人账号（显式不取 password）与本人名下投稿
    const [account, listings] = await Promise.all([
      prisma.user.findUnique({
        where: { id: auth.user.id },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.listing.findMany({
        where: { userId: auth.user.id },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!account) {
      return unauthorizedResponse('用户不存在');
    }

    const exportedListings = listings.map((listing) => ({
      id: listing.id,
      title: listing.title,
      rent: listing.rent,
      address: listing.address,
      rentType: listing.rentType,
      rentTypeText: RENT_TYPE_TEXT[listing.rentType] ?? listing.rentType,
      area: listing.area,
      floor: listing.floor,
      tags: listing.tags,
      description: listing.description,
      // 审核经历：平台留存的最新审核结果
      review: {
        status: listing.status,
        statusText: STATUS_TEXT[listing.status] ?? listing.status,
        rejectReason: listing.rejectReason,
        // updatedAt 为该投稿（含审核结果）最后一次变更的时间
        reviewedAt:
          listing.status === 'pending' ? null : listing.updatedAt.toISOString(),
      },
      submittedAt: listing.createdAt.toISOString(),
      updatedAt: listing.updatedAt.toISOString(),
    }));

    const dataPackage = {
      packageInfo: {
        platform: '租房信息发布与查询平台',
        version: '1.0',
        // 资料包对应的时间点
        exportedAt: exportedAtIso,
        exportedAtBeijing: formatBeijingTime(exportedAt),
        isSnapshot: true,
        scope:
          '本资料包仅包含该账号本人有权查看的内容：账号基本资料、本人的全部投稿（房源）及每条投稿的审核结果；不含登录凭证，也不含任何他人或管理端数据。',
        snapshotNotice:
          '本文件是上述 exportedAt 时刻一次性生成的静态快照。导出完成后，平台上的数据即使被修改或删除，也不会改变本文件中已经生成的内容；如需最新数据请重新导出。',
      },
      account: {
        id: account.id,
        email: account.email,
        name: account.name,
        role: account.role,
        createdAt: account.createdAt.toISOString(),
        updatedAt: account.updatedAt.toISOString(),
      },
      listings: exportedListings,
      summary: {
        total: exportedListings.length,
        pending: exportedListings.filter((l) => l.review.status === 'pending').length,
        approved: exportedListings.filter((l) => l.review.status === 'approved').length,
        rejected: exportedListings.filter((l) => l.review.status === 'rejected').length,
      },
    };

    // 序列化发生在请求处理期间；返回给客户端的就是这一刻定版的内容
    const payload = JSON.stringify(dataPackage, null, 2);

    const stamp = fileTimestamp(exportedAt);
    const asciiFilename = `my-data-package-${stamp}.json`;
    const utf8Filename = `我的投稿与审核记录-${stamp}.json`;

    return new Response(payload, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition':
          // ASCII 回退文件名 + RFC 5987 UTF-8 文件名
          `attachment; filename="${asciiFilename}"; ` +
          `filename*=UTF-8''${encodeURIComponent(utf8Filename)}`,
        // 个人数据不经过中间缓存
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache',
      },
    });
  } catch (error) {
    console.error('[Export] 个人资料包导出失败:', error);
    return Response.json(
      { success: false, error: '资料包导出失败' },
      { status: 500 }
    );
  }
}
