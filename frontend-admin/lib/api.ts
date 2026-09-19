/**
 * 客户端 API 请求封装
 */

import type { ApiResponse } from '@/types';

// API 基础地址 - 从环境变量获取，客户端使用浏览器可访问的地址
const getApiBaseUrl = () => {
  // 浏览器环境：使用 window.location 或环境变量
  if (typeof window !== 'undefined') {
    // 优先使用环境变量配置的公开地址
    return process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';
  }
  // 服务端环境：使用 Docker 内部网络地址
  return process.env.API_URL || 'http://backend:3001';
};

/**
 * 从 Cookie 获取 Token
 */
function getToken(): string | null {
  if (typeof document === 'undefined') return null;

  const tokenCookie = document.cookie
    .split('; ')
    .find((item) => item.startsWith('token='));

  if (!tokenCookie) {
    return null;
  }

  return decodeURIComponent(tokenCookie.substring('token='.length));
}

/**
 * 设置 Token（仅写入 Cookie）
 */
export function setToken(token: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `token=${encodeURIComponent(token)}; path=/; max-age=${7 * 24 * 60 * 60}; samesite=lax`;
}

/**
 * 移除 Token（仅清理 Cookie）
 */
export function removeToken(): void {
  if (typeof document === 'undefined') return;
  document.cookie = 'token=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; samesite=lax';
}

/**
 * 构建请求头
 */
function buildHeaders(customHeaders?: HeadersInit): Headers {
  const headers = new Headers(customHeaders);
  
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  
  const token = getToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  return headers;
}

/**
 * 通用请求方法
 */
async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${endpoint}`;
  
  const config: RequestInit = {
    ...options,
    headers: buildHeaders(options.headers),
  };

  try {
    const response = await fetch(url, config);
    const data = await response.json();
    
    if (!response.ok) {
      return {
        success: false,
        error: data.error || data.message || '请求失败',
      };
    }
    
    return data as ApiResponse<T>;
  } catch (error) {
    console.error('API request error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '网络错误',
    };
  }
}

/**
 * GET 请求
 */
export function get<T>(endpoint: string, params?: Record<string, string | number | undefined>): Promise<ApiResponse<T>> {
  let url = endpoint;
  
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        searchParams.append(key, String(value));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }
  
  return request<T>(url, { method: 'GET' });
}

/**
 * POST 请求
 */
export function post<T>(endpoint: string, data?: unknown): Promise<ApiResponse<T>> {
  return request<T>(endpoint, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  });
}

/**
 * PUT 请求
 */
export function put<T>(endpoint: string, data?: unknown): Promise<ApiResponse<T>> {
  return request<T>(endpoint, {
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
  });
}

/**
 * DELETE 请求
 */
export function del<T>(endpoint: string): Promise<ApiResponse<T>> {
  return request<T>(endpoint, { method: 'DELETE' });
}

// ==================== 业务 API ====================

import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  User,
  Listing,
  CreateListingRequest,
  UpdateListingRequest,
  ListingFilter,
  PaginatedResponse,
  RejectRequest,
} from '@/types';

/** 缓存的 RSA 公钥 */
let cachedPublicKey: string | null = null;

/**
 * 获取 RSA 公钥（带缓存）
 */
async function getPublicKey(): Promise<string> {
  if (cachedPublicKey) return cachedPublicKey;

  const res = await get<{ publicKey: string }>('/api/auth/public-key');
  if (res.success && res.data) {
    cachedPublicKey = res.data.publicKey;
    return cachedPublicKey;
  }
  throw new Error('获取公钥失败');
}

/**
 * 将 PEM 格式公钥转为 CryptoKey
 */
async function importPublicKey(pem: string): Promise<CryptoKey> {
  const pemBody = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\s/g, '');
  const raw = atob(pemBody);
  const binaryDer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(binaryDer);
  for (let i = 0; i < raw.length; i++) {
    view[i] = raw.charCodeAt(i);
  }

  return crypto.subtle.importKey(
    'spki',
    binaryDer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );
}

/**
 * 使用 RSA 公钥加密密码
 */
async function encryptPassword(password: string): Promise<string> {
  const pem = await getPublicKey();
  const key = await importPublicKey(pem);
  const encoded = new TextEncoder().encode(password);
  const encrypted = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, key, encoded);
  // 转为 Base64（兼容低版本 TS target）
  const bytes = new Uint8Array(encrypted);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * 认证相关 API
 */
export const authApi = {
  /** 注册（密码加密传输） */
  register: async (data: RegisterRequest) => {
    try {
      const encryptedPwd = await encryptPassword(data.password);
      return post<AuthResponse>('/api/auth/register', {
        ...data,
        password: encryptedPwd,
        encrypted: true,
      });
    } catch (err) {
      console.warn('[Auth] 密码加密失败，回退明文传输:', err);
      return post<AuthResponse>('/api/auth/register', data);
    }
  },
  
  /** 登录（密码加密传输） */
  login: async (data: LoginRequest) => {
    try {
      const encryptedPwd = await encryptPassword(data.password);
      return post<AuthResponse>('/api/auth/login', {
        ...data,
        password: encryptedPwd,
        encrypted: true,
      });
    } catch (err) {
      console.warn('[Auth] 密码加密失败，回退明文传输:', err);
      return post<AuthResponse>('/api/auth/login', data);
    }
  },
  
  /** 获取当前用户 */
  me: () => get<User>('/api/auth/me'),
};

/**
 * 房源相关 API
 */
export const listingApi = {
  /** 获取房源列表（公开） */
  getList: (filter?: ListingFilter) => get<PaginatedResponse<Listing>>('/api/listings', filter as Record<string, string | number | undefined>),
  
  /** 获取房源详情 */
  getById: (id: string) => get<Listing>(`/api/listings/${id}`),
  
  /** 创建房源 */
  create: (data: CreateListingRequest) => post<Listing>('/api/listings', data),
  
  /** 获取我的房源 */
  getMy: () => get<Listing[]>('/api/listings/my'),
  
  /** 更新房源 */
  update: (id: string, data: UpdateListingRequest) => put<Listing>(`/api/listings/${id}`, data),
  
  /** 删除房源 */
  delete: (id: string) => del<void>(`/api/listings/${id}`),
};

/**
 * 账号资料相关 API
 */
export const accountApi = {
  /**
   * 下载本人资料包（投稿与审核经历）
   * 返回的是导出时刻生成的静态快照文件，由浏览器直接保存到本地
   */
  downloadDataExport: async (): Promise<{ success: true; filename: string } | { success: false; error: string }> => {
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/api/me/data-export`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: buildHeaders(),
      });
    } catch (error) {
      console.error('Data export request error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '网络错误',
      };
    }

    if (!response.ok) {
      // 错误响应仍是 JSON，尝试解析出错误信息
      try {
        const data = await response.json();
        return { success: false, error: data.error || data.message || '资料包导出失败' };
      } catch {
        return { success: false, error: '资料包导出失败' };
      }
    }

    const blob = await response.blob();

    // 从 Content-Disposition 解析文件名（优先 filename* 的 UTF-8 名称）
    let filename = '我的投稿与审核记录.json';
    const disposition = response.headers.get('Content-Disposition');
    if (disposition) {
      const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      const asciiMatch = disposition.match(/filename="([^"]+)"/i);
      if (utf8Match?.[1]) {
        filename = decodeURIComponent(utf8Match[1]);
      } else if (asciiMatch?.[1]) {
        filename = asciiMatch[1];
      }
    }

    // 触发浏览器下载；下载到本地后即为不可变快照
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);

    return { success: true, filename };
  },
};

/**
 * 管理员相关 API
 */
export const adminApi = {
  /** 获取待审核房源 */
  getPendingListings: () => get<Listing[]>('/api/admin/listings'),

  /** 修改违规房源 */
  update: (id: string, data: UpdateListingRequest) => put<Listing>(`/api/admin/listings/${id}`, data),
  
  /** 审核通过 */
  approve: (id: string) => put<Listing>(`/api/admin/listings/${id}/approve`),
  
  /** 审核驳回 */
  reject: (id: string, data: RejectRequest) => put<Listing>(`/api/admin/listings/${id}/reject`, data),
  
  /** 删除房源 */
  delete: (id: string) => del<void>(`/api/admin/listings/${id}`),
};
