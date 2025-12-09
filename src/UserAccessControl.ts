/**
 * 飞书插件访问控制模块
 * 基于 GitLab 插件的访问控制逻辑进行调整
 */

import { getUserKeyAPI, testUserConnectionAPI } from './api';

const sdk = window.JSSDK;

interface LocalAuthData {
  user_key: string;
  plugin_access_token: string;
  plugin_access_token_expire_time: number;
  user_access_token: string;
  user_access_token_expire_time: number;
}

// Token刷新状态管理
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

/**
 * 获取访问令牌 - 基于 AuthConfig.tsx 的授权逻辑
 * @param code 飞书授权码
 * @returns 是否成功获取令牌
 */
async function getToken(code: string): Promise<boolean> {
  try {
    const keyPayload = {
      code,
      lark_type: 'lark'
    };
    const userKeyResponse = await getUserKeyAPI(keyPayload);

    // token_expire_time 是倒计时秒数，需要转换为实际的过期时间戳（毫秒）并缩短 10 分钟
    const now = Date.now();
    const localAuthData: LocalAuthData = {
      user_key: userKeyResponse.user_key,
      plugin_access_token: userKeyResponse.plugin_access_token,
      plugin_access_token_expire_time: now + userKeyResponse.plugin_access_token_expire_time * 1000 - 600 * 1000,
      user_access_token: userKeyResponse.user_access_token,
      user_access_token_expire_time: now + userKeyResponse.user_access_token_expire_time * 1000 - 600 * 1000
    };
    await sdk.storage.setItem('plugin-local-auth', JSON.stringify(localAuthData));

    return true;
  } catch (error) {
    console.error('Failed to get token:', error);
    return false;
  }
}

/**
 * 检查Token是否即将过期（提前5分钟刷新）
 * @param expireTime Token过期时间戳（毫秒）
 * @returns 是否即将过期
 */
function isTokenExpiringSoon(expireTime: number): boolean {
  const fiveMinutesInMs = 5 * 60 * 1000; // 5分钟
  return (expireTime - Date.now()) < fiveMinutesInMs;
}

/**
 * 检查登录状态 - 基于 AuthConfig.tsx 的逻辑
 * @param checkExpiringSoon 是否检查即将过期的Token
 * @returns 是否已登录
 */
async function checkLogin(checkExpiringSoon: boolean = false): Promise<boolean> {
  try {
    const pluginLocalAuthStr = await sdk.storage.getItem('plugin-local-auth');
    if (!pluginLocalAuthStr) {
      return false;
    }

    const pluginLocalAuth: LocalAuthData = JSON.parse(pluginLocalAuthStr);
    const { plugin_access_token, plugin_access_token_expire_time, user_access_token, user_access_token_expire_time } = pluginLocalAuth;

    // 检查基本有效性
    if (!plugin_access_token || !plugin_access_token_expire_time || !user_access_token || !user_access_token_expire_time) {
      return false;
    }

    // 检查是否已过期（expire_time 已经是毫秒级时间戳）
    const pluginTokenExpired = plugin_access_token_expire_time <= Date.now();
    const userTokenExpired = user_access_token_expire_time <= Date.now();
    if (pluginTokenExpired || userTokenExpired) {
      return false;
    }

    // 如果需要检查即将过期的Token
    if (checkExpiringSoon) {
      const pluginTokenExpiringSoon = isTokenExpiringSoon(plugin_access_token_expire_time);
      const userTokenExpiringSoon = isTokenExpiringSoon(user_access_token_expire_time);
      
      if (pluginTokenExpiringSoon || userTokenExpiringSoon) {
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('Failed to check login status:', error);
    return false;
  }
}

/**
 * 刷新Token
 * @returns 是否刷新成功
 */
async function refreshToken(): Promise<boolean> {
  // 防止并发刷新
  if (isRefreshing) {
    return refreshPromise || Promise.resolve(false);
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      
      // 检查授权配置
      const authConfig = await getAuthConfig();
      if (!authConfig || !authConfig.url) {
        console.error('Auth config not found for token refresh');
        return false;
      }

      // 验证配置是否有效
      const isValidConfig = await validateConfig();
      if (!isValidConfig) {
        console.error('Auth config is invalid for token refresh');
        return false;
      }

      // 获取飞书授权码
      const authResult = await sdk.utils.getAuthCode();

      // 使用授权码获取新的访问令牌
      const success = await getToken(authResult.code);

      if (success) {
        return true;
      } else {
        console.error('Token refresh failed');
        return false;
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * 获取当前存储的令牌 - 基于 AuthConfig.tsx 的逻辑
 * @param autoRefresh 是否自动刷新即将过期的Token
 * @returns 访问令牌或 null
 */
export async function getStoredToken(autoRefresh: boolean = true): Promise<string | null> {
  try {
    // 检查当前登录状态（包括即将过期的Token）
    const isLoggedIn = await checkLogin(autoRefresh);
    
    if (!isLoggedIn && autoRefresh) {
      // 尝试刷新Token
      const refreshSuccess = await refreshToken();
      if (!refreshSuccess) {
        return null;
      }
    } else if (!isLoggedIn) {
      return null;
    }

    const pluginLocalAuthStr = await sdk.storage.getItem('plugin-local-auth');
    const pluginLocalAuth: LocalAuthData | null = pluginLocalAuthStr ? JSON.parse(pluginLocalAuthStr) : null;

    return pluginLocalAuth?.plugin_access_token || null;
  } catch (error) {
    console.error('Failed to get stored token:', error);
    return null;
  }
}

/**
 * 清除登录状态 - 基于 AuthConfig.tsx 的逻辑
 */
export async function clearAuth(): Promise<void> {
  try {
    await sdk.storage.removeItem('zadig-auth-config');
    await sdk.storage.removeItem('plugin-local-auth');
  } catch (error) {
    console.error('Failed to clear auth:', error);
  }
}

/**
 * 获取授权配置
 */
async function getAuthConfig() {
  try {
    const config = await sdk.storage.getItem('zadig-auth-config');
    return config ? JSON.parse(config) : null;
  } catch (error) {
    console.error('Failed to get auth config:', error);
    return null;
  }
}

/**
 * 验证配置有效性 - 基于 AuthConfig.tsx 的逻辑
 */
async function validateConfig(): Promise<boolean> {
  try {
    await testUserConnectionAPI();
    return true;
  } catch (error: any) {
    console.error('Config validation failed:', error);
    if (error.response?.status === 401) {
      // 配置失效，删除本地存储
      await sdk.storage.removeItem('zadig-auth-config');
      await sdk.storage.removeItem('plugin-local-auth');
    }
    return false;
  }
}

/**
 * 确保用户已登录 - 基于 AuthConfig.tsx 的授权逻辑
 * 如果未登录或Token即将过期，会自动触发刷新流程
 * 需要 authConfig 存在才能执行登录检查
 */
export async function isLogin(): Promise<void> {
  try {
    // 首先检查是否有授权配置
    const authConfig = await getAuthConfig();
    if (!authConfig || !authConfig.url) {
      throw new Error('Auth config not found. Please configure authentication first.');
    }

    // 检查登录状态（包括即将过期的Token）
    const login = await checkLogin(true);

    if (!login) {
      // 尝试刷新Token
      const refreshSuccess = await refreshToken();
      
      if (!refreshSuccess) {
        throw new Error('Token refresh failed. Please reconfigure authentication.');
      }
    }
  } catch (error) {
    console.error('Login process failed:', error);
    throw error;
  }
}

/**
 * 手动触发登录
 * @returns 是否登录成功
 */
export async function login(): Promise<boolean> {
  try {
    await isLogin();
    return true;
  } catch (error) {
    console.error('Manual login failed:', error);
    return false;
  }
}

/**
 * 检查是否已登录（不触发登录流程）
 * @returns 是否已登录
 */
export async function checkLoginStatus(): Promise<boolean> {
  return await checkLogin();
}

/**
 * 手动刷新Token
 * @returns 是否刷新成功
 */
export async function refreshTokenManually(): Promise<boolean> {
  return await refreshToken();
}