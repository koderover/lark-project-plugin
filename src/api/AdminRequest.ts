import { Toast } from '@douyinfe/semi-ui';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import type { AuthConfig } from './types';
import { getStoredToken, refreshTokenManually, checkLoginStatus } from '../AdminAccessControl';
import { authStore } from '../stores/AuthStore';

// 创建 axios 实例
const createRequest = (): AxiosInstance => {
  const instance = axios.create({
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  return instance;
};

const request = createRequest();

// Toast 缓存，避免重复显示相同错误
const toastCache: Record<string, boolean> = {};

const showErrorToast = (message: string) => {
  if (!toastCache[message]) {
    toastCache[message] = true;
    Toast.error({
      content: message,
      onClose: () => {
        delete toastCache[message];
      },
    });
  }
};

// 获取存储的认证配置 - 使用 mobx store
const getAuthConfig = async (): Promise<AuthConfig | null> => {
  return await authStore.getAdminAuthConfig();
};

// 获取本地存储的认证数据 - 使用 mobx store
const getPluginAuthData = async (): Promise<{ user_access_token?: string; user_key?: string } | null> => {
  return await authStore.getPluginAdminAuthData();
};

// 判断是否为全局配置 API
const isGlobalConfigAPI = (url: string): boolean => {
  return url.includes('/api/plugin/lark/auth/config');
};

// 判断是否需要插件认证的 API（排除获取 Token 的 API）
const needsPluginAuth = (url: string): boolean => {
  // 全局配置 API 不需要插件认证
  if (url.includes('/api/plugin/lark/auth/config')) {
    return false;
  }
  // 获取用户密钥 API 不需要插件认证（这是获取 Token 的 API）
  if (url.includes('/api/plugin/lark/user/key')) {
    return false;
  }
  // 测试连接 API 不需要插件认证
  if (url.includes('/api/plugin/lark/test')) {
    return false;
  }
  return true;
};

// 请求拦截器
request.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const authConfig = await getAuthConfig();
    const isGlobalAPI = config.url ? isGlobalConfigAPI(config.url) : false;
    const requiresPluginAuth = config.url ? needsPluginAuth(config.url) : false;

    if (authConfig) {
      // 设置 base URL
      if (config.url && !config.url.startsWith('http')) {
        config.url = `${authConfig.url}${config.url}`;
      }

      if (isGlobalAPI) {
        // 全局授权配置 API，只使用 Bearer Token
        if (authConfig.apiToken) {
          config.headers.set('Authorization', `Bearer ${authConfig.apiToken}`);
        }
      } else {
        // 其他所有 API，使用完整的鉴权信息
        if (authConfig.apiToken) {
          config.headers.set('Authorization', `Bearer ${authConfig.apiToken}`);
        }

        // 需要插件认证的 API，先确保 Token 有效
        if (requiresPluginAuth) {
          // 检查 Token 是否过期，如果过期则先刷新
          const isLoggedIn = await checkLoginStatus();
          if (!isLoggedIn) {
            // Token 已过期，尝试刷新
            const refreshSuccess = await refreshTokenManually();
            if (!refreshSuccess) {
              console.warn('Token refresh failed in request interceptor');
              // 刷新失败，继续请求，让响应拦截器处理 401 错误
            }
          }
        }

        // 添加插件特有的认证头
        const pluginAuthData = await getPluginAuthData();
        if (pluginAuthData) {
          if (pluginAuthData.user_access_token) {
            config.headers.set('X-PLUGIN-TOKEN', pluginAuthData.user_access_token);
          }
          if (pluginAuthData.user_key) {
            config.headers.set('X-USER-KEY', pluginAuthData.user_key);
          }
        }

        // 从 authStore 获取工作空间 ID
        try {
          const workspaceId = await authStore.getWorkspaceId();
          if (workspaceId) {
            config.headers.set('X-WORKSPACE-ID', workspaceId);
          }
        } catch (error) {
          console.warn('Failed to get workspace ID:', error);
        }
      }
    }

    return config;
  },
  (error) => {
    console.error('Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Token刷新状态管理
let isRefreshingToken = false;
let failedQueue: Array<{ resolve: Function; reject: Function }> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });

  failedQueue = [];
};

// 响应拦截器
request.interceptors.response.use(
  (response: AxiosResponse) => {
    const { data } = response;

    // 如果是 Zadig API 的标准响应格式
    if (typeof data === 'object' && data !== null) {
      // 检查是否有错误
      if (data.error) {
        const errorMsg = data.error.message || data.message || '请求失败';
        showErrorToast(errorMsg);
        return Promise.reject(new Error(errorMsg));
      }

      // 正常响应
      return data;
    }

    return data;
  },
  async (error) => {
    const originalRequest = error.config;

    // 处理401错误（Token过期）
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshingToken) {
        // 如果正在刷新Token，将请求加入队列
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers['Authorization'] = `Bearer ${token}`;
            return request(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshingToken = true;

      try {
        // 尝试刷新Token
        const refreshSuccess = await refreshTokenManually();

        if (refreshSuccess) {
          // 获取新的Token
          const newToken = await getStoredToken(false);
          if (newToken) {
            // 更新原始请求的Token
            originalRequest.headers['Authorization'] = `Bearer ${newToken}`;

            // 处理队列中的请求
            processQueue(null, newToken);

            // 重新发送原始请求
            return request(originalRequest);
          }
        }

        // 刷新失败，清除认证并跳转到配置页面
        processQueue(new Error('Token refresh failed'), null);
        showErrorToast('登录已过期，请重新配置鉴权信息');
        return Promise.reject(error);
      } catch (refreshError) {
        processQueue(refreshError, null);
        showErrorToast('登录已过期，请重新配置鉴权信息');
        return Promise.reject(error);
      } finally {
        isRefreshingToken = false;
      }
    }

    // 处理其他类型的错误
    let errorMessage = '网络请求失败';

    if (error.response) {
      // 服务器响应了错误状态码
      const { status, data } = error.response;

      switch (status) {
        case 401:
          errorMessage = 'API Token 无效或已过期';
          break;
        case 403:
          errorMessage = '没有权限访问该资源';
          break;
        case 404:
          errorMessage = '请求的资源不存在';
          break;
        case 500:
          errorMessage = '服务器内部错误';
          break;
        default:
          errorMessage = data?.message || data?.error?.message || `请求失败 (${status})`;
      }
    } else if (error.request) {
      // 请求发出但没有收到响应
      if (error.code === 'ECONNABORTED') {
        errorMessage = '请求超时';
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        errorMessage = '无法连接到 Zadig 服务器，请检查地址配置';
      } else {
        errorMessage = '网络连接失败';
      }
    } else {
      // 其他错误
      errorMessage = error.message || '未知错误';
    }

    console.error('API Error:', {
      message: errorMessage,
      error,
      config: error.config,
    });

    showErrorToast(errorMessage);
    return Promise.reject(error);
  }
);

// 通用请求方法
export const adminRequest = {
  get: <T = any>(url: string, config?: AxiosRequestConfig): Promise<T> => request.get(url, config),

  post: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => request.post(url, data, config),

  put: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => request.put(url, data, config),

  delete: <T = any>(url: string, config?: AxiosRequestConfig): Promise<T> => request.delete(url, config),

  patch: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => request.patch(url, data, config),
};


export default adminRequest;
