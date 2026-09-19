/**
 * 我的房源页面
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ListingCard } from '@/components/listing/ListingCard';
import { PageLoading, EmptyState } from '@/components/ui/Loading';
import { Button } from '@/components/ui/Button';
import { listingApi, accountApi } from '@/lib/api';
import { useToastStore } from '@/store/useToastStore';
import type { Listing } from '@/types';

export default function MyListingsPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const toast = useToastStore();
  
  const fetchMyListings = useCallback(async () => {
    setLoading(true);
    try {
      const response = await listingApi.getMy();
      if (response.success && response.data) {
        setListings(response.data);
      } else {
        toast.error(response.error || '获取房源失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  }, [toast]);
  
  useEffect(() => {
    fetchMyListings();
  }, [fetchMyListings]);

  // 下载本人资料包：服务端按导出时刻生成静态快照，仅含本人有权查看的内容
  const handleDownloadPackage = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const result = await accountApi.downloadDataExport();
      if (result.success) {
        toast.success('资料包已开始下载');
      } else {
        toast.error(result.error || '资料包导出失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setExporting(false);
    }
  };

  // 按状态分组
  const pendingListings = listings.filter(l => l.status === 'pending');
  const approvedListings = listings.filter(l => l.status === 'approved');
  const rejectedListings = listings.filter(l => l.status === 'rejected');
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 页面标题 */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">我的房源</h1>
              <p className="text-gray-500 text-sm">管理您发布的所有房源</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              className="flex items-center gap-2"
              loading={exporting}
              onClick={handleDownloadPackage}
            >
              {!exporting && (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              )}
              下载我的资料包
            </Button>
            <Link href="/publish">
              <Button className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                发布新房源
              </Button>
            </Link>
          </div>
        </div>

        {/* 资料包说明：下载入口对应的内容范围与快照时间点 */}
        <div className="mb-6 flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4">
          <svg className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-blue-800 leading-relaxed">
            <p className="font-medium mb-1">关于「我的资料包」</p>
            <p>
              资料包仅包含您本人有权查看的内容：账号基本资料、您的全部投稿以及每条投稿的审核结果，
              不包含登录凭证或他人数据。文件在点击下载的那一刻生成，文件名与文件内均标注了对应的时间点，
              下载完成后平台数据再发生修改或删除，都不会改变已下载的文件；需要最新内容时重新下载即可。
            </p>
          </div>
        </div>
        
        {/* 统计卡片 */}
        {!loading && listings.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{pendingListings.length}</p>
                  <p className="text-xs text-gray-500">待审核</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{approvedListings.length}</p>
                  <p className="text-xs text-gray-500">已通过</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{rejectedListings.length}</p>
                  <p className="text-xs text-gray-500">已驳回</p>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {loading ? (
          <PageLoading />
        ) : listings.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12">
            <EmptyState
              title="暂无房源"
              description="您还没有发布任何房源，点击下方按钮发布您的第一个房源"
              action={
                <Link href="/publish">
                  <Button className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    发布第一个房源
                  </Button>
                </Link>
              }
            />
          </div>
        ) : (
          <div className="space-y-8">
            {/* 待审核 */}
            {pendingListings.length > 0 && (
              <section className="bg-yellow-50 rounded-2xl p-6 border border-yellow-100">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-yellow-800">待审核</h2>
                    <p className="text-sm text-yellow-600">{pendingListings.length} 个房源正在等待审核</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {pendingListings.map((listing, index) => (
                    <div
                      key={listing.id}
                      className="animate-fade-in"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <ListingCard listing={listing} showStatus />
                    </div>
                  ))}
                </div>
              </section>
            )}
            
            {/* 已通过 */}
            {approvedListings.length > 0 && (
              <section className="bg-green-50 rounded-2xl p-6 border border-green-100">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-green-800">已通过</h2>
                    <p className="text-sm text-green-600">{approvedListings.length} 个房源已发布展示</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {approvedListings.map((listing, index) => (
                    <div
                      key={listing.id}
                      className="animate-fade-in"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <ListingCard listing={listing} showStatus />
                    </div>
                  ))}
                </div>
              </section>
            )}
            
            {/* 已驳回 */}
            {rejectedListings.length > 0 && (
              <section className="bg-red-50 rounded-2xl p-6 border border-red-100">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-red-800">已驳回</h2>
                    <p className="text-sm text-red-600">{rejectedListings.length} 个房源审核未通过</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {rejectedListings.map((listing, index) => (
                    <div
                      key={listing.id}
                      className="animate-fade-in"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <ListingCard listing={listing} showStatus />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
