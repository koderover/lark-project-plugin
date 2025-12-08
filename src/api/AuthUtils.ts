/**
 * 统一认证管理工具 - 基于 mobx store
 * 
 * 这个文件提供了统一的认证管理接口，解决了 window.JSSDK.storage.getItem 速率限制的问题。
 * 
 * 使用方式：
 * 1. 登录后调用 setAuthData() 将认证信息同时保存到存储和 mobx store
 * 2. 后续请求会优先从 mobx store 获取数据，避免频繁调用存储API
 * 3. 如果 mobx store 中没有数据，会自动从存储中加载
 */

import { authStore, type PluginAuthData } from '../stores/AuthStore';
import type { AuthConfig } from './types';

// 用户认证工具
export const userAuthUtils = {
  /**
   * 设置用户认证配置（登录后调用）
   */
  setAuthConfig: async (config: AuthConfig | null): Promise<void> => {
    await authStore.setUserAuthConfig(config);
  },

  /**
   * 设置用户插件认证数据（登录后调用）
   */
  setPluginAuthData: async (data: PluginAuthData | null): Promise<void> => {
    await authStore.setPluginUserAuthData(data);
  },

  /**
   * 获取用户认证配置（优先从 mobx store 获取）
   */
  getAuthConfig: async (): Promise<AuthConfig | null> => {
    return await authStore.getUserAuthConfig();
  },

  /**
   * 获取用户插件认证数据（优先从 mobx store 获取）
   */
  getPluginAuthData: async (): Promise<PluginAuthData | null> => {
    return await authStore.getPluginUserAuthData();
  },

  /**
   * 清除用户认证数据
   */
  clearAuth: async (): Promise<void> => {
    await authStore.clearAllAuth();
  },

  /**
   * 强制刷新缓存（下次获取时会重新从存储加载）
   */
  forceRefresh: (): void => {
    authStore.forceRefresh();
  },
};

// 管理员认证工具
export const adminAuthUtils = {
  /**
   * 设置管理员插件认证数据（登录后调用）
   */
  setPluginAuthData: async (data: PluginAuthData | null): Promise<void> => {
    await authStore.setPluginAdminAuthData(data);
  },

  /**
   * 获取管理员认证配置（优先从 mobx store 获取）
   */
  getAuthConfig: async (): Promise<AuthConfig | null> => {
    return await authStore.getAdminAuthConfig();
  },

  /**
   * 获取管理员插件认证数据（优先从 mobx store 获取）
   */
  getPluginAuthData: async (): Promise<PluginAuthData | null> => {
    return await authStore.getPluginAdminAuthData();
  },

  /**
   * 清除所有认证数据
   */
  clearAuth: async (): Promise<void> => {
    await authStore.clearAllAuth();
  },

  /**
   * 强制刷新缓存（下次获取时会重新从存储加载）
   */
  forceRefresh: (): void => {
    authStore.forceRefresh();
  },
};

// 通用工具
export const commonAuthUtils = {
  /**
   * 获取工作空间 ID（优先从 mobx store 获取）
   */
  getWorkspaceId: async (): Promise<string | null> => {
    return await authStore.getWorkspaceId();
  },

  /**
   * 清除所有认证数据（包括用户和管理员）
   */
  clearAllAuth: async (): Promise<void> => {
    await authStore.clearAllAuth();
  },

  /**
   * 强制刷新所有缓存
   */
  forceRefreshAll: (): void => {
    authStore.forceRefresh();
  },

  /**
   * 检查是否已有用户认证配置
   */
  hasUserAuth: async (): Promise<boolean> => {
    const config = await authStore.getUserAuthConfig();
    return config !== null && config.apiToken.length > 0;
  },

  /**
   * 检查是否已有用户插件认证数据
   */
  hasUserPluginAuth: async (): Promise<boolean> => {
    const data = await authStore.getPluginUserAuthData();
    return data !== null && !!(data.user_access_token || data.user_key);
  },
};

// 登录后统一设置认证数据的便捷函数
export const setAuthDataAfterLogin = async (options: {
  // 用户认证配置
  userAuthConfig?: AuthConfig | null;
  // 用户插件认证数据
  userPluginAuthData?: PluginAuthData | null;
  // 管理员插件认证数据
  adminPluginAuthData?: PluginAuthData | null;
}) => {
  const { userAuthConfig, userPluginAuthData, adminPluginAuthData } = options;

  // 并行设置所有认证数据，提高性能
  const promises: Promise<void>[] = [];
  
  if (userAuthConfig !== undefined) {
    promises.push(authStore.setUserAuthConfig(userAuthConfig));
  }
  
  if (userPluginAuthData !== undefined) {
    promises.push(authStore.setPluginUserAuthData(userPluginAuthData));
  }
  
  if (adminPluginAuthData !== undefined) {
    promises.push(authStore.setPluginAdminAuthData(adminPluginAuthData));
  }

  await Promise.all(promises);
};

// 导出 authStore 实例以供高级用法
export { authStore };

// 默认导出包含所有工具的对象
export default {
  user: userAuthUtils,
  admin: adminAuthUtils,
  common: commonAuthUtils,
  setAuthDataAfterLogin,
  authStore,
};
