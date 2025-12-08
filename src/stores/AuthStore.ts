import { makeAutoObservable, runInAction } from 'mobx';
import type { AuthConfig } from '../api/types';
import { ADMIN_AUTH_CONFIG } from '../config/constants';

export interface PluginAuthData {
  user_access_token?: string;
  user_key?: string;
}

class AuthStore {
  // 用户认证配置
  userAuthConfig: AuthConfig | null = null;
  
  // 管理员认证配置
  adminAuthConfig: AuthConfig | null = null;
  
  // 插件用户认证数据
  pluginUserAuthData: PluginAuthData | null = null;
  
  // 插件管理员认证数据
  pluginAdminAuthData: PluginAuthData | null = null;
  
  // 工作空间 ID
  workspaceId: string | null = null;
  
  // 缓存标记，避免重复从存储读取
  private userAuthConfigLoaded = false;
  private adminAuthConfigLoaded = false;
  private pluginUserAuthDataLoaded = false;
  private pluginAdminAuthDataLoaded = false;
  private workspaceIdLoaded = false;

  constructor() {
    makeAutoObservable(this);
  }

  // 获取用户认证配置
  async getUserAuthConfig(): Promise<AuthConfig | null> {
    if (this.userAuthConfig || this.userAuthConfigLoaded) {
      return this.userAuthConfig;
    }

    try {
      const config = await window.JSSDK.storage.getItem('zadig-auth-config') || 
                    await window.JSSDK.storage.getItem('zadig-auth-config-temp');
      
      const parsedConfig = config ? JSON.parse(config) : null;
      
      runInAction(() => {
        this.userAuthConfig = parsedConfig;
        this.userAuthConfigLoaded = true;
      });
      
      return parsedConfig;
    } catch (error) {
      console.error('Failed to get user auth config:', error);
      runInAction(() => {
        this.userAuthConfigLoaded = true;
      });
      return null;
    }
  }

  // 设置用户认证配置
  async setUserAuthConfig(config: AuthConfig | null): Promise<void> {
    runInAction(() => {
      this.userAuthConfig = config;
      this.userAuthConfigLoaded = true;
    });

    if (config) {
      try {
        await window.JSSDK.storage.setItem('zadig-auth-config', JSON.stringify(config));
      } catch (error) {
        console.error('Failed to save user auth config:', error);
      }
    } else {
      try {
        await window.JSSDK.storage.removeItem('zadig-auth-config');
        await window.JSSDK.storage.removeItem('zadig-auth-config-temp');
      } catch (error) {
        console.error('Failed to remove user auth config:', error);
      }
    }
  }

  // 获取管理员认证配置（硬编码）
  async getAdminAuthConfig(): Promise<AuthConfig | null> {
    if (this.adminAuthConfig || this.adminAuthConfigLoaded) {
      return this.adminAuthConfig;
    }

    runInAction(() => {
      this.adminAuthConfig = ADMIN_AUTH_CONFIG;
      this.adminAuthConfigLoaded = true;
    });

    return ADMIN_AUTH_CONFIG;
  }

  // 获取插件用户认证数据
  async getPluginUserAuthData(): Promise<PluginAuthData | null> {
    if (this.pluginUserAuthData || this.pluginUserAuthDataLoaded) {
      return this.pluginUserAuthData;
    }

    try {
      const data = await window.JSSDK.storage.getItem('plugin-local-auth');
      const parsedData = data ? JSON.parse(data) : null;
      
      runInAction(() => {
        this.pluginUserAuthData = parsedData;
        this.pluginUserAuthDataLoaded = true;
      });
      
      return parsedData;
    } catch (error) {
      console.error('Failed to get plugin user auth data:', error);
      runInAction(() => {
        this.pluginUserAuthDataLoaded = true;
      });
      return null;
    }
  }

  // 设置插件用户认证数据
  async setPluginUserAuthData(data: PluginAuthData | null): Promise<void> {
    runInAction(() => {
      this.pluginUserAuthData = data;
      this.pluginUserAuthDataLoaded = true;
    });

    if (data) {
      try {
        await window.JSSDK.storage.setItem('plugin-local-auth', JSON.stringify(data));
      } catch (error) {
        console.error('Failed to save plugin user auth data:', error);
      }
    } else {
      try {
        await window.JSSDK.storage.removeItem('plugin-local-auth');
      } catch (error) {
        console.error('Failed to remove plugin user auth data:', error);
      }
    }
  }

  // 获取插件管理员认证数据
  async getPluginAdminAuthData(): Promise<PluginAuthData | null> {
    if (this.pluginAdminAuthData || this.pluginAdminAuthDataLoaded) {
      return this.pluginAdminAuthData;
    }

    try {
      const data = await window.JSSDK.storage.getItem('plugin-admin-local-auth');
      const parsedData = data ? JSON.parse(data) : null;
      
      runInAction(() => {
        this.pluginAdminAuthData = parsedData;
        this.pluginAdminAuthDataLoaded = true;
      });
      
      return parsedData;
    } catch (error) {
      console.error('Failed to get plugin admin auth data:', error);
      runInAction(() => {
        this.pluginAdminAuthDataLoaded = true;
      });
      return null;
    }
  }

  // 设置插件管理员认证数据
  async setPluginAdminAuthData(data: PluginAuthData | null): Promise<void> {
    runInAction(() => {
      this.pluginAdminAuthData = data;
      this.pluginAdminAuthDataLoaded = true;
    });

    if (data) {
      try {
        await window.JSSDK.storage.setItem('plugin-admin-local-auth', JSON.stringify(data));
      } catch (error) {
        console.error('Failed to save plugin admin auth data:', error);
      }
    } else {
      try {
        await window.JSSDK.storage.removeItem('plugin-admin-local-auth');
      } catch (error) {
        console.error('Failed to remove plugin admin auth data:', error);
      }
    }
  }

  // 获取工作空间 ID
  async getWorkspaceId(): Promise<string | null> {
    if (this.workspaceId || this.workspaceIdLoaded) {
      return this.workspaceId;
    }

    try {
      const context = await window.JSSDK.Context.load();
      const workspaceId = context && (context as any).mainSpace?.id || null;
      runInAction(() => {
        this.workspaceId = workspaceId;
        this.workspaceIdLoaded = true;
      });
      
      return workspaceId;
    } catch (error) {
      console.warn('Failed to get workspace ID:', error);
      runInAction(() => {
        this.workspaceIdLoaded = true;
      });
      return null;
    }
  }

  // 清除所有认证数据
  async clearAllAuth(): Promise<void> {
    runInAction(() => {
      this.userAuthConfig = null;
      this.pluginUserAuthData = null;
      this.pluginAdminAuthData = null;
      this.workspaceId = null;
      // 重置加载标记，允许重新加载
      this.userAuthConfigLoaded = false;
      this.pluginUserAuthDataLoaded = false;
      this.pluginAdminAuthDataLoaded = false;
      this.workspaceIdLoaded = false;
    });

    try {
      await Promise.all([
        window.JSSDK.storage.removeItem('zadig-auth-config'),
        window.JSSDK.storage.removeItem('zadig-auth-config-temp'),
        window.JSSDK.storage.removeItem('plugin-local-auth'),
        window.JSSDK.storage.removeItem('plugin-admin-local-auth')
      ]);
    } catch (error) {
      console.error('Failed to clear auth data from storage:', error);
    }
  }

  // 刷新缓存（强制重新加载）
  forceRefresh(): void {
    runInAction(() => {
      this.userAuthConfigLoaded = false;
      this.adminAuthConfigLoaded = false;
      this.pluginUserAuthDataLoaded = false;
      this.pluginAdminAuthDataLoaded = false;
      this.workspaceIdLoaded = false;
    });
  }
}

// 创建全局单例
export const authStore = new AuthStore();
export default authStore;
