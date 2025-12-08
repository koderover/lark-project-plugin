import React, { useState, useEffect } from 'react';
import { Layout, Nav, Banner } from '@douyinfe/semi-ui';
import { IconBranch } from '@douyinfe/semi-icons';
import AuthConfig from './components/AuthConfig'; // 需要导入以执行后台授权逻辑
import WorkflowConfig from './components/WorkflowConfig';
import './index.css';

const { Sider, Content } = Layout;

const App: React.FC = () => {
  // 【临时修改】默认显示工作流配置而不是授权配置
  // 恢复自定义配置时，改回 'auth'
  const [activeKey, setActiveKey] = useState('workflow');
  // 【临时修改】设置为 true，因为配置已写死
  // 恢复自定义配置时，改回 false
  const [_hasAuthConfig, _setHasAuthConfig] = useState(true);
  // 添加授权配置状态追踪
  const [authConfigStatus, setAuthConfigStatus] = useState<'initializing' | 'completed' | 'failed'>('initializing');

  // 检查是否存在授权配置
  useEffect(() => {
    // 【临时禁用】因为现在使用写死配置
    // 恢复自定义配置时，取消注释下面这行
    // checkAuthConfig();
  }, []);

  const checkAuthConfig = async () => {
    try {
      const authConfig = await window.JSSDK.storage.getItem('zadig-admin-auth-config');
      _setHasAuthConfig(!!authConfig);
    } catch (error) {
      console.error('Failed to check auth config:', error);
      _setHasAuthConfig(false);
    }
  };

  const handleNavSelect = (data: any) => {
    const selectedKey = data.selectedKeys[0] as string;
    setActiveKey(selectedKey);
  };

  const navItems = [
    // {
    //   itemKey: 'auth',
    //   text: '授权配置',
    //   icon: <IconSetting />
    // },
    {
      itemKey: 'workflow',
      text: '工作流配置',
      icon: <IconBranch />
    }
  ];

  const _handleAuthConfigSave = () => {
    // 当授权配置保存成功后，更新状态
    setAuthConfigStatus('completed');
    checkAuthConfig();
  };
  // 处理授权配置失败
  const _handleAuthConfigError = () => {
    setAuthConfigStatus('failed');
  };
  const handleSDKNavigation = (url: string) => {
    try {
      if (window.JSSDK?.navigation?.open) {
        window.JSSDK.navigation.open(url);
      } else {
        console.warn('SDK navigation not available, fallback to window.open');
        window.open(url, '_blank');
      }
    } catch (error) {
      console.error('Navigation failed:', error);
      // 降级处理
      window.open(url, '_blank');
    }
  };
  const renderContent = () => {
    return (
      <>
        <Banner style={{ marginBottom: 16 }}
          type="info" icon={null} closeIcon={null}
          description={<span>如需体验产品，欢迎随时联系<span style={{ color: 'var(--semi-color-link-visited)', cursor: 'pointer' ,fontWeight: 'bold' }} onClick={() => handleSDKNavigation('https://www.feishu.cn/invitation/page/add_contact/?token=137ha409-9055-45e0-8048-2c0fdffa3c53&amp;unique_id=180BKzFzPHQv2As4YRhyUg==')}>官方顾问</span></span>}
        />
        {/* 隐藏的AuthConfig组件，用于执行后台授权逻辑 */}
        {/* 注意：即使隐藏，AuthConfig组件的useEffect仍会执行，完成自动配置 */}
        <div style={{ display: 'none' }}>
          <AuthConfig
            onSave={_handleAuthConfigSave}
            onError={_handleAuthConfigError}
          />
        </div>

        {/* 根据AuthConfig状态决定是否显示WorkflowConfig */}
        {authConfigStatus === 'completed' && (
          <WorkflowConfig />
        )}

        {authConfigStatus === 'failed' && (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: 'var(--semi-color-danger)'
          }}>
            <div style={{ fontSize: '16px', marginBottom: '12px' }}>❌ 授权配置失败</div>
            <div style={{ fontSize: '14px', color: 'var(--semi-color-text-2)' }}>
              请检查控制台日志或联系管理员
            </div>
          </div>
        )}
      </>
    );

    // 保留原有逻辑以备后续恢复多页面功能
    // switch (activeKey) {
    //   case 'auth':
    //     return <AuthConfig onSave={_handleAuthConfigSave} />;
    //   case 'workflow':
    //     return <WorkflowConfig />; 
    //   default:
    //     return <WorkflowConfig />; 
    // }
  };

  return (
    <Layout style={{ height: '100vh' }}>
      <Sider style={{ backgroundColor: 'var(--semi-color-bg-1)' }}>
        <Nav
          style={{ maxWidth: 220, height: '100%' }}
          defaultSelectedKeys={[activeKey]}
          selectedKeys={[activeKey]}
          onSelect={handleNavSelect}
          items={navItems}
        />
      </Sider>
      <Content style={{ padding: '24px', backgroundColor: 'var(--semi-color-bg-0)' }}>
        {renderContent()}
      </Content>
    </Layout>
  );
};

export default App;