import React, { useState, useEffect } from 'react';
import { Form, Button, Card, Toast } from '@douyinfe/semi-ui';
import { IconSave, IconRefresh } from '@douyinfe/semi-icons';
import { updateGlobalAuthConfigAPI, getAdminUserKeyAPI, testAdminConnectionWithCustomAuthAPI } from '../../../api';
import { setAuthDataAfterLogin } from '../../../api/AuthUtils';
import { ADMIN_AUTH_CONFIG } from '../../../config/constants';

interface AuthConfigProps {
  onSave?: (config: AuthConfig) => void;
  onTest?: (config: AuthConfig) => Promise<boolean>;
  onError?: () => void;
}

interface AuthConfig {
  url: string;
  apiToken: string;
}

const AuthConfig: React.FC<AuthConfigProps> = ({ onSave, onTest, onError }) => {
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [formApi, setFormApi] = useState<any>(null);
  const [autoConfigDone, setAutoConfigDone] = useState(false);
  const [initializedDirectly, setInitializedDirectly] = useState(false);

  // 临时写死的配置 - TODO: 用户会告诉我具体的值
  // 【重要】要恢复自定义配置功能时，删除此常量并启用下面注释的逻辑
  const HARDCODED_CONFIG: AuthConfig = ADMIN_AUTH_CONFIG;

  // 自动保存配置的函数（提前定义，以便在useEffect中使用）
  const autoSaveConfig = async (values: AuthConfig) => {
    setLoading(true);
    try {
      const configContext = await window.JSSDK.configuration.getContext();
      const spaceId = configContext.spaceId;
      
      // 1. 调用 updateGlobalAuthConfigAPI 进行登录保存
      await updateGlobalAuthConfigAPI({
        zadig_address: values.url,
        api_token: values.apiToken,
        workspace_id: spaceId
      });

      // 2. 保存配置到本地存储（管理员配置直接存储）
      await window.JSSDK.storage.setItem('zadig-admin-auth-config', JSON.stringify(values));

      // 3. 获取用户密钥
      try {
        const authResult = await window.JSSDK.utils.getAuthCode();
        const keyPayload = {
          code: authResult.code,
          lark_type: 'lark'
        };
        const userKeyResponse = await getAdminUserKeyAPI(keyPayload);
        
        // 4. 使用 authUtils 保存管理员插件认证数据
        const pluginAuthData = {
          user_key: userKeyResponse.user_key,
          plugin_access_token: userKeyResponse.plugin_access_token,
          plugin_access_token_expire_time: userKeyResponse.plugin_access_token_expire_time,
          user_access_token: userKeyResponse.user_access_token,
          user_access_token_expire_time: userKeyResponse.user_access_token_expire_time
        };
        
        await setAuthDataAfterLogin({
          adminPluginAuthData: pluginAuthData
        });

        if (onSave) {
          onSave(values);
        }

        // Toast.success('自动配置完成，用户密钥已获取');
      } catch (authError) {
        console.error('AutoSaveConfig: Failed to get user key:', authError);
        Toast.warning('配置保存成功，但获取用户密钥失败，请检查配置');
      }
    } catch (error) {
      console.error('AutoSaveConfig: Error:', error);
      Toast.error('自动配置失败');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // 组件挂载时立即执行自动配置（不依赖formApi）
  useEffect(() => {
    const directInitializeConfig = async () => {
      if (initializedDirectly) return;
      
      try {
        // 直接保存配置到localStorage，不依赖表单
        await window.JSSDK.storage.setItem('zadig-admin-auth-config', JSON.stringify(HARDCODED_CONFIG));
        
        // 执行完整的自动配置流程
        await autoSaveConfig(HARDCODED_CONFIG);
        setAutoConfigDone(true);
        setInitializedDirectly(true);
        
      } catch (error) {
        Toast.error('自动配置失败: ' + error.message);
        
        // 通知父组件配置失败
        if (onError) {
          onError();
        }
      }
    };
    directInitializeConfig();
  }, [initializedDirectly, onError]);

  // 保留原有的基于formApi的自动初始化配置（作为备用）
  useEffect(() => {
    const initializeConfig = async () => {
      if (!formApi || autoConfigDone || initializedDirectly) return;
      
      try {
        // 使用写死的配置
        formApi.setValues(HARDCODED_CONFIG);
        
      } catch (error) {
        console.error('FormAutoConfig: Failed to set form values:', error);
      }
    };
    initializeConfig();
  }, [formApi, autoConfigDone, initializedDirectly]);

  // 保留原有的配置加载逻辑（用于后续支持自定义配置）
  // 注释：原有的 loadExistingConfig 逻辑已临时禁用，如需恢复可从git历史找回
  useEffect(() => {
    // 临时禁用配置加载逻辑
  }, [formApi]);

  // 已移动到前面定义，避免重复

  const handleSave = async (values: AuthConfig) => {
    setLoading(true);
    const configContext = await window.JSSDK.configuration.getContext();
    const spaceId = configContext.spaceId;
    try {
      // 1. 调用 updateGlobalAuthConfigAPI 进行登录保存
      await updateGlobalAuthConfigAPI({
        zadig_address: values.url,
        api_token: values.apiToken,
        workspace_id: spaceId
      });

      // 2. 保存配置到本地存储（管理员配置直接存储）
      await window.JSSDK.storage.setItem('zadig-admin-auth-config', JSON.stringify(values));

      // 3. 获取用户密钥
      try {
        const authResult = await window.JSSDK.utils.getAuthCode();
        const keyPayload = {
          code: authResult.code,
          lark_type: 'lark'
        };
        const userKeyResponse = await getAdminUserKeyAPI(keyPayload);
        
        // 4. 使用 authUtils 保存管理员插件认证数据
        const pluginAuthData = {
          user_key: userKeyResponse.user_key,
          plugin_access_token: userKeyResponse.plugin_access_token,
          plugin_access_token_expire_time: userKeyResponse.plugin_access_token_expire_time,
          user_access_token: userKeyResponse.user_access_token,
          user_access_token_expire_time: userKeyResponse.user_access_token_expire_time
        };
        
        await setAuthDataAfterLogin({
          adminPluginAuthData: pluginAuthData
        });

        if (onSave) {
          onSave(values);
        }

        Toast.success('配置保存成功，用户密钥已获取');
      } catch (authError) {
        console.error('Failed to get user key:', authError);
        Toast.warning('配置保存成功，但获取用户密钥失败，请检查配置');
      }
    } catch (error) {
      Toast.error('配置保存失败');
      console.error('Save config error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!formApi) return;

    const values = formApi.getValues();
    if (!values.url || !values.apiToken) {
      Toast.warning('请先填写完整的配置信息');
      return;
    }

    setTestLoading(true);
    try {
      // 使用新的测试连接API，直接传入用户输入的鉴权参数
      await testAdminConnectionWithCustomAuthAPI({
        url: values.url,
        apiToken: values.apiToken
      });

      Toast.success('连接测试成功');
      if (onTest) {
        await onTest(values);
      }
    } catch (error: any) {
      console.error('Test connection error:', error);
      if (error.response?.status === 401) {
        Toast.error('认证失败，请检查 API Token 是否正确');
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        Toast.error('无法连接到 Zadig 服务器，请检查地址配置');
      } else {
        Toast.error('连接测试失败，请检查配置');
      }
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <Card
      title="授权配置"
      style={{ marginBottom: 16 }}
      headerStyle={{ borderBottom: '1px solid var(--semi-color-border)' }}
    >
      {/* 临时显示自动配置状态 */}
      {autoConfigDone && (
        <div style={{ 
          marginBottom: 16, 
          padding: 12, 
          backgroundColor: 'var(--semi-color-success-light-default)',
          borderRadius: 6,
          color: 'var(--semi-color-success-dark)'
        }}>
          ✓ 授权配置已自动完成
        </div>
      )}
      
      <Form
        onSubmit={handleSave}
        labelPosition="left"
        labelWidth={120}
        style={{ maxWidth: 600 }}
        getFormApi={(api) => setFormApi(api)}
      >
        <Form.Input
          field="url"
          label="Zadig 地址"
          placeholder="https://zadig.example.com"
          disabled={autoConfigDone} // 自动配置完成后禁用编辑
          rules={[
            { required: true, message: 'Zadig 地址不能为空' },
            { type: 'url', message: '请输入有效的 URL 地址' }
          ]}
          suffix={
            <span style={{ color: 'var(--semi-color-text-2)', fontSize: '12px' }}>
              {autoConfigDone ? '(自动配置)' : '*'}
            </span>
          }
        />
        <Form.Input
          field="apiToken"
          label="API Token"
          placeholder="请输入 API Token"
          mode="password"
          disabled={autoConfigDone} // 自动配置完成后禁用编辑
          rules={[
            { required: true, message: 'API Token 不能为空' }
          ]}
          suffix={
            <span style={{ color: 'var(--semi-color-text-2)', fontSize: '12px' }}>
              {autoConfigDone ? '(自动配置)' : '*'}
            </span>
          }
        />

        <div style={{
          display: 'flex',
          gap: 12,
          marginTop: 24,
          paddingLeft: 120
        }}>
          <Button
            theme="solid"
            type="primary"
            htmlType="submit"
            loading={loading}
            disabled={autoConfigDone} // 自动配置完成后禁用保存
            icon={<IconSave />}
            >
            {autoConfigDone ? '已自动保存' : '保存'}
          </Button>
          <Button
            type="tertiary"
            onClick={handleTest}
            loading={testLoading}
            disabled={autoConfigDone} // 自动配置完成后禁用测试
            icon={<IconRefresh />}
            >
            {autoConfigDone ? '已验证' : '测试'}
          </Button>
          {/* 添加重置按钮，用于后续支持自定义配置 */}
          {autoConfigDone && (
            <Button
              type="warning"
              onClick={() => {
                setAutoConfigDone(false);
                if (formApi) {
                  formApi.reset();
                }
                Toast.info('已重置为手动配置模式');
              }}
              >
              重置为手动配置
            </Button>
          )}
        </div>
      </Form>
    </Card>
  );
};

export default AuthConfig;