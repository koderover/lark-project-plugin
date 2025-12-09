import React, { useState, useEffect, useCallback, useRef } from 'react';
import './index.css';
import { Typography, Card, Space, Button, Toast, Collapse, Empty, Modal, Form, Spin, Tag } from '@douyinfe/semi-ui';
import { IconRefresh, IconSetting, IconSave } from '@douyinfe/semi-icons';
import { IllustrationConstruction, IllustrationConstructionDark } from '@douyinfe/semi-illustrations';
import WorkflowTasksList from './components/WorkflowTasksList';
import ErrorBoundary from './components/ErrorBoundary';
import { getWorkItemWorkflowsAPI, getUserKeyAPI, testUserConnectionWithCustomAuthAPI, getCustomCloneDetailAPI } from '../../api/service';
import { isLogin } from '../../UserAccessControl';
import authUtils, { setAuthDataAfterLogin } from '../../api/AuthUtils';
import { ZADIG_SERVER_URL } from '../../config/constants';

const { Title, Text } = Typography;

interface WorkflowNode {
  node: {
    id: string;
    is_current: boolean;
    name: string;
  };
  workflows: Array<{
    can_execute?: boolean;
    workflow: {
      id?: string;
      project?: string;
      name: string;
      display_name?: string;
      hash?: string;
      description?: string;
      stages?: any[];
      params?: any[];
      is_current?: boolean;
    };
  }>;
}

// TaskItem 接口已移动到 WorkflowTasksList 组件中

const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workflowNodes, setWorkflowNodes] = useState<WorkflowNode[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<string[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<any>(null);
  const [currentWorkItemId, setCurrentWorkItemId] = useState<string>('');
  const [workItemTypeKey, setWorkItemTypeKey] = useState<string>('');
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authFormApi, setAuthFormApi] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [hasAuthConfig, setHasAuthConfig] = useState(false);
  const [cloneWorkflow, setCloneWorkflow] = useState<any>({});
  const hasAuthConfigRef = useRef(false);

  // 使用 ref 保持最新值
  useEffect(() => {
    hasAuthConfigRef.current = hasAuthConfig;
  }, [hasAuthConfig]);

  useEffect(() => {
    checkAuthConfig();
  }, []);

  // 轻量级的数据加载函数，用于 context 变化时，避免过度的认证验证
  const loadWorkItemDataSafe = useCallback(async () => {
    try {
      // 使用 authUtils 检查基本的认证配置
      const hasUserAuth = await authUtils.common.hasUserAuth();
      const hasPluginAuth = await authUtils.common.hasUserPluginAuth();

      if (!hasUserAuth || !hasPluginAuth) {
        return;
      }

      // 获取当前工作项ID - 加入错误处理
      let context;
      try {
        context = await window.JSSDK.Context.load();
      } catch (contextError) {
        return;
      }

      const workItemId = (context as any)?.activeWorkItem?.id;
      const workItemTypeKeyValue = (context as any)?.activeWorkItem?.workObjectId;

      if (!workItemId) {
        return;
      }

      setCurrentWorkItemId(workItemId);
      setWorkItemTypeKey(workItemTypeKeyValue || '');

      // 直接尝试获取工作流列表，如果失败就静默处理
      // @ts-ignore
      const workflowsResponse = await getWorkItemWorkflowsAPI(workItemTypeKeyValue, workItemId);
      const nodes = workflowsResponse?.nodes || [];
      setWorkflowNodes(nodes);

      // 设置默认展开的节点（is_current 为 true 的节点）
      const defaultExpandedNodes = nodes.filter((node: WorkflowNode) => node.node.is_current).map((node: WorkflowNode) => node.node.id);
      setExpandedNodes(defaultExpandedNodes);
    } catch (error: any) {
      console.error('Context change data reload failed:', error);
      // 如果是认证相关错误且不是API限制错误，回退到完整的加载流程
      if ((error.message?.includes('Auth') || error.response?.status === 401) && !error.message?.includes('limit')) {
        // 延迟执行以避免API限制
        setTimeout(() => {
          loadWorkItemData();
        }, 1000);
      }
      // 其他错误静默处理，不影响用户体验
    }
  }, []);

  // 监听 context 变化
  useEffect(() => {
    let contextWatcher: any = null;
    let currentTimer: number | null = null;
    let lastSelectedNode: any = null;

    const initContextWatch = async () => {
      try {
        const context = await window.JSSDK.Context.load();
        const initialSelectedNode = (context as any)?.selectedWorkflowNode;
        lastSelectedNode = initialSelectedNode;

        // 监听上下文变化
        contextWatcher = context.watch((ctx: any) => {
          const newSelectedNode = ctx?.selectedWorkflowNode;

          // 使用深度比较来检查 selectedWorkflowNode 是否真正变化
          const isNodeChanged = JSON.stringify(newSelectedNode) !== JSON.stringify(lastSelectedNode);

          if (isNodeChanged) {
            // 更新最后记录的节点
            lastSelectedNode = newSelectedNode;

            // 清除之前的防抖定时器
            if (currentTimer) {
              clearTimeout(currentTimer);
            }

            // 设置新的防抖定时器
            currentTimer = window.setTimeout(() => {
              // 使用 ref 来检查认证状态，避免闭包问题
              if (hasAuthConfigRef.current) {
                loadWorkItemDataSafe();
              }
            }, 1000); // 1秒防抖，避免频繁调用
          }
        });
      } catch (error) {
        console.error('Failed to setup context watch:', error);
      }
    };

    // 只在组件首次挂载时初始化
    initContextWatch();

    // 清理函数
    return () => {
      if (currentTimer) {
        clearTimeout(currentTimer);
      }
      if (contextWatcher && typeof contextWatcher === 'function') {
        // 如果有取消监听的方法，调用它
        contextWatcher();
      }
    };
  }, []); // 空依赖数组，只在组件挂载时执行一次

  const checkAuthConfig = async () => {
    try {
      // 使用 authUtils 检查认证配置
      const hasAuth = await authUtils.common.hasUserAuth();
      if (hasAuth) {
        // 检查登录状态并自动刷新Token
        try {
          await isLogin(); // 这会自动处理Token刷新
          setHasAuthConfig(true);
          await loadWorkItemData();
        } catch (error: any) {
          console.error('登录检查失败:', error);
          // 如果isLogin失败，说明配置有问题或无法刷新Token
          setHasAuthConfig(false);
          Toast.warning('鉴权配置已失效，请重新配置');
          setShowAuthModal(true);
        }
      } else {
        setHasAuthConfig(false);
        Toast.warning('请先配置鉴权信息');
        setShowAuthModal(true);
      }
    } catch (error) {
      console.error('检查鉴权配置失败:', error);
      setHasAuthConfig(false);
    } finally {
      setLoading(false);
    }
  };

  const handleAuthSave = async (values: { apiToken: string; url?: string }) => {
    setAuthLoading(true);
    try {
      // 1. 先测试配置有效性（使用固定的URL）
      const configWithFixedUrl = {
        url: ZADIG_SERVER_URL,
        apiToken: values.apiToken,
      };

      try {
        // 使用新的测试连接API，直接传入配置参数
        await testUserConnectionWithCustomAuthAPI(configWithFixedUrl);
        // 测试成功后设置认证数据
        await setAuthDataAfterLogin({
          userAuthConfig: configWithFixedUrl,
        });
      } catch (testError: any) {
        console.error('Authentication test failed:', testError);
        if (testError.response?.status === 401) {
          Toast.error('认证失败，请检查 API Token 是否正确');
        } else if (testError.code === 'ENOTFOUND' || testError.code === 'ECONNREFUSED') {
          Toast.error('无法连接到 Zadig 服务器，请检查网络连接');
        } else {
          Toast.error('连接测试失败，请检查配置');
        }
        return;
      }

      // 2. 获取用户密钥
      try {
        const authResult = await window.JSSDK.utils.getAuthCode();
        const keyPayload = {
          code: authResult.code,
          lark_type: 'lark',
        };
        const userKeyResponse = await getUserKeyAPI(keyPayload);

        // 3. 使用 authUtils 统一保存认证数据
        // token_expire_time 是倒计时秒数，需要转换为实际的过期时间戳（毫秒）并缩短 10 分钟
        const now = Date.now();
        const pluginAuthData = {
          user_key: userKeyResponse.user_key,
          plugin_access_token: userKeyResponse.plugin_access_token,
          plugin_access_token_expire_time: now + userKeyResponse.plugin_access_token_expire_time * 1000 - 600 * 1000,
          user_access_token: userKeyResponse.user_access_token,
          user_access_token_expire_time: now + userKeyResponse.user_access_token_expire_time * 1000 - 600 * 1000,
        };

        await setAuthDataAfterLogin({
          userAuthConfig: configWithFixedUrl,
          userPluginAuthData: pluginAuthData,
        });

        Toast.success('鉴权配置保存成功');
        setHasAuthConfig(true);
        setShowAuthModal(false);

        // 配置成功后加载工作项数据
        await loadWorkItemData();
      } catch (authError) {
        console.error('Failed to get user key:', authError);
        Toast.warning('配置保存成功，但获取用户密钥失败，请检查配置');
      }
    } catch (error) {
      Toast.error('配置保存失败');
      console.error('Save config error:', error);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAuthTest = async () => {
    if (!authFormApi) return;

    const values = authFormApi.getValues();
    if (!values.apiToken) {
      Toast.warning('请先填写 API Token');
      return;
    }

    setAuthLoading(true);
    try {
      // 使用固定的URL进行测试
      const testConfig = {
        url: ZADIG_SERVER_URL,
        apiToken: values.apiToken,
      };

      // 使用新的测试连接API，直接传入配置参数
      await testUserConnectionWithCustomAuthAPI(testConfig);

      Toast.success('连接测试成功');
    } catch (error: any) {
      console.error('Test connection error:', error);
      if (error.response?.status === 401) {
        Toast.error('认证失败，请检查 API Token 是否正确');
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        Toast.error('无法连接到 Zadig 服务器，请检查网络连接');
      } else {
        Toast.error('连接测试失败，请检查配置');
      }
    } finally {
      // 清理加载状态
      setAuthLoading(false);
    }
  };

  const loadWorkItemData = async () => {
    // 使用 authUtils 检查认证配置
    const hasAuth = await authUtils.common.hasUserAuth();
    if (!hasAuthConfig && !hasAuth) {
      Toast.warning('请先配置鉴权信息');
      setShowAuthModal(true);
      return;
    }

    setLoading(true);
    try {
      // 确保用户已登录并Token有效
      await isLogin();

      // 获取当前工作项ID（这里需要根据实际情况获取）
      const context = await window.JSSDK.Context.load();
      // 模拟工作项ID，实际项目中应该从context中获取
      const workItemId = (context as any)?.activeWorkItem?.id;
      const workItemTypeKeyValue = (context as any)?.activeWorkItem?.workObjectId;

      if (!workItemId) {
        Toast.warning('未找到工作项信息');
        setLoading(false);
        return;
      }

      setCurrentWorkItemId(workItemId);
      setWorkItemTypeKey(workItemTypeKeyValue || '');

      // 获取工作流列表
      // @ts-ignore
      const workflowsResponse = await getWorkItemWorkflowsAPI(workItemTypeKeyValue, workItemId);
      const nodes = workflowsResponse?.nodes || [];
      setWorkflowNodes(nodes);

      // 设置默认展开的节点（is_current 为 true 的节点）
      const defaultExpandedNodes = nodes.filter((node: WorkflowNode) => node.node.is_current).map((node: WorkflowNode) => node.node.id);
      setExpandedNodes(defaultExpandedNodes);
    } catch (error) {
      console.error('加载工作项数据失败:', error);
      if (error.message?.includes('Auth config')) {
        setHasAuthConfig(false);
        setShowAuthModal(true);
        Toast.warning('鉴权配置已失效，请重新配置');
      } else {
        Toast.error('加载数据失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadWorkItemData();
      // 触发所有任务列表刷新
      setRefreshTrigger((prev) => prev + 1);
      Toast.success('刷新成功');
    } catch (error) {
      console.error('刷新失败:', error);
      Toast.error('刷新失败');
    } finally {
      setRefreshing(false);
    }
  };

  const handleRunWorkflow = async (workflow: any) => {
    try {
      // 获取当前工作项上下文
      const context = await window.JSSDK.Context.load();
      const workItemTypeKey = (context as any)?.activeWorkItem?.workObjectId || '';

      // 打开全局模态框
      const modal = await window.JSSDK.modal.open({
        entry: 'WorkflowRunnerModal',
        width: '80%',
        height: 'calc(100vh - 100px)',
        maskClosable: false,
        context: {
          workitemTypeKey: workItemTypeKey,
          workItemId: currentWorkItemId,
          workflowName: workflow.name,
          displayName: workflow.display_name || workflow.name,
          projectName: workflow.project,
          cloneWorkflow: {},
          payload: {
            workflow_name: workflow.name,
            note: '',
            stages: workflow.stages || [],
            params: workflow.params || [],
          },
          viewMode: false,
          triggerMode: false,
          releasePlanMode: false,
          stageExecMode: false,
          editRunner: false,
        },
        onSubmit: (data: any) => {
          modal.close();

          // 触发任务列表刷新
          setRefreshTrigger((prev) => prev + 1);
        },
        afterClose: () => {},
      });
    } catch (error) {
      console.error('❌ handleRunWorkflow 执行失败:', error);
      Toast.error('打开工作流运行器失败');
    }
  };

  const handleCollapseChange = (activeKeys: string[]) => {
    setExpandedNodes(activeKeys);
  };

  const handleCloneTask = async (task: any) => {
    try {
      // 使用 API 获取克隆数据
      // 优先使用任务中的 project_name，如果没有则使用当前选中的工作流项目
      const projectName =
        task.project_name ||
        (selectedWorkflow && selectedWorkflow.project) ||
        workflowNodes.find((node) => node.workflows.some((wf) => wf.workflow.name === task.workflow_name))?.workflows.find((wf) => wf.workflow.name === task.workflow_name)
          ?.workflow.project;

      if (!projectName) {
        Toast.error('无法确定项目名称');
        return;
      }

      const cloneTaskData = await getCustomCloneDetailAPI(task.workflow_name, task.task_id, projectName);

      if (cloneTaskData) {
        // 设置克隆的工作流数据（用于 state 管理）
        setCloneWorkflow(cloneTaskData);

        // 设置选中的工作流 - 需要找到对应的工作流定义
        const targetWorkflow = workflowNodes.flatMap((node) => node.workflows).find((wf) => wf.workflow.name === task.workflow_name);

        if (targetWorkflow) {
          setSelectedWorkflow({
            ...targetWorkflow.workflow,
            workitemTypeKey: workItemTypeKey,
          });

          // 获取当前工作项上下文
          const context = await window.JSSDK.Context.load();
          const currentWorkItemTypeKey = (context as any)?.activeWorkItem?.workObjectId || '';

          // 打开全局模态框，传递克隆数据
          const modal = await window.JSSDK.modal.open({
            entry: 'WorkflowRunnerModal',
            width: '80%',
            height: 'calc(100vh - 100px)',
            maskClosable: false,
            context: {
              workitemTypeKey: currentWorkItemTypeKey,
              workItemId: currentWorkItemId,
              workflowName: targetWorkflow.workflow.name,
              displayName: targetWorkflow.workflow.display_name || targetWorkflow.workflow.name,
              projectName: targetWorkflow.workflow.project || projectName,
              cloneWorkflow: cloneTaskData, // 🔑 传递克隆数据
              payload: {
                workflow_name: targetWorkflow.workflow.name,
                note: cloneTaskData.note || '',
                stages: cloneTaskData.stages || targetWorkflow.workflow.stages || [],
                params: cloneTaskData.params || targetWorkflow.workflow.params || [],
              },
              viewMode: false,
              triggerMode: false,
              releasePlanMode: false,
              stageExecMode: false,
              editRunner: true, // 克隆模式
            },
            onSubmit: (data: any) => {
              modal.close();

              // 清理克隆工作流状态
              setCloneWorkflow({});

              // 触发所有任务列表刷新
              setRefreshTrigger((prev) => prev + 1);
            },
            afterClose: () => {
              // 清理克隆工作流状态
              setCloneWorkflow({});
            },
          });

          Toast.success(`准备克隆任务 #${task.task_id}`);
        } else {
          console.error('❌ 未找到对应的工作流定义:', task.workflow_name);
          Toast.error('未找到对应的工作流定义');
        }
      } else {
        console.error('❌ 获取克隆数据为空');
        Toast.error('获取克隆数据失败');
      }
    } catch (error: any) {
      console.error('❌ 克隆任务失败:', error);
      Toast.error(error.message || '克隆任务失败');
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0', height: '100%', width: '100%' }}>
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>
          <Text>正在加载工作流数据...</Text>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="zadig-dashboard">
        <Card style={{ margin: '16px 0', border: 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Title heading={6} style={{ margin: 0 }}>
              工作流
            </Title>
            <Space>
              <Button theme="borderless" icon={<IconRefresh />} onClick={handleRefresh} loading={refreshing}>
                刷新
              </Button>
              <Button type="tertiary" icon={<IconSetting />} onClick={() => setShowAuthModal(true)}>
                鉴权配置
              </Button>
            </Space>
          </div>

          {!hasAuthConfig ? (
            <Empty
              image={<IllustrationConstruction style={{ width: 150, height: 150 }} />}
              darkModeImage={<IllustrationConstructionDark style={{ width: 150, height: 150 }} />}
              description="请先配置鉴权信息"
              style={{ padding: '40px 0' }}
            >
              <Button type="primary" onClick={() => setShowAuthModal(true)} style={{ marginTop: 16 }}>
                配置鉴权
              </Button>
            </Empty>
          ) : workflowNodes.length === 0 ? (
            <Empty
              image={<IllustrationConstruction style={{ width: 150, height: 150 }} />}
              darkModeImage={<IllustrationConstructionDark style={{ width: 150, height: 150 }} />}
              description="暂无工作流配置"
            />
          ) : (
            <Collapse activeKey={expandedNodes} onChange={handleCollapseChange} accordion={false}>
              {workflowNodes.map((node) => (
                <Collapse.Panel
                  key={node.node.id}
                  header={
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <Text style={{ margin: 0 }}>{node.node.name}</Text>
                      {node.node.is_current && (
                        <Tag color="blue" style={{ marginLeft: 8 }}>
                          当前节点
                        </Tag>
                      )}
                    </div>
                  }
                  itemKey={node.node.id}
                >
                  {node.workflows.length === 0 ? (
                    <Empty
                      image={<IllustrationConstruction style={{ width: 120, height: 120 }} />}
                      darkModeImage={<IllustrationConstructionDark style={{ width: 120, height: 120 }} />}
                      description="该节点暂无工作流"
                      style={{ padding: '20px 0' }}
                    />
                  ) : (
                    <div style={{ marginTop: 5 }}>
                      {node.workflows.map((item) => {
                        const canExecute = item.can_execute && node.node.is_current;
                        const workflow = item.workflow;
                        const workflowKey = `${workItemTypeKey}-${workflow.name}`;

                        return (
                          <Card key={workflowKey} style={{ marginBottom: 16 }} bodyStyle={{ padding: 0 }}>
                            {/* 工作流标题和执行按钮 */}
                            <div
                              style={{
                                padding: '8px 12px',
                                borderBottom: '1px solid var(--semi-color-border)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                              }}
                            >
                              <Text style={{ margin: 0 }}>{workflow.display_name || workflow.name}</Text>
                              <Button
                                type="primary"
                                theme="solid"
                                size="small"
                                onClick={() => {
                                  if (canExecute) {
                                    handleRunWorkflow(workflow);
                                  }
                                }}
                                disabled={!canExecute}
                                title={!canExecute ? '无执行权限或节点未激活' : '执行'}
                              >
                                执行
                              </Button>
                            </div>

                            {/* 任务列表 */}
                            <div style={{ padding: '0px' }}>
                              <WorkflowTasksList
                                workItemTypeKey={workItemTypeKey}
                                workItemId={currentWorkItemId}
                                workflow={workflow}
                                projectKey={workflow.project}
                                onCloneTask={handleCloneTask}
                                refreshTrigger={refreshTrigger}
                                disabledRun={!canExecute}
                              />
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </Collapse.Panel>
              ))}
            </Collapse>
          )}
        </Card>

        {/* 鉴权配置弹框 */}
        <Modal
          title="鉴权配置"
          visible={showAuthModal}
          onCancel={() => setShowAuthModal(false)}
          footer={null}
          width={600}
          afterClose={() => {
            authFormApi?.reset();
          }}
        >
          <Form
            onSubmit={handleAuthSave}
            labelPosition="left"
            labelWidth={120}
            getFormApi={async (api) => {
              setAuthFormApi(api);
              // 使用 authUtils 加载已有配置
              try {
                const savedConfig = await authUtils.user.getAuthConfig();
                if (savedConfig && savedConfig.apiToken) {
                  // 只设置apiToken，url始终使用固定值
                  api.setValues({
                    url: ZADIG_SERVER_URL,
                    apiToken: savedConfig.apiToken,
                  });
                } else {
                  // 没有配置时也设置默认URL
                  api.setValues({
                    url: ZADIG_SERVER_URL,
                    apiToken: '',
                  });
                }
              } catch (error) {
                console.error('Failed to load saved config:', error);
                // 发生错误时也设置默认URL
                api.setValues({
                  url: ZADIG_SERVER_URL,
                  apiToken: '',
                });
              }
            }}
          >
            <Form.Input field="url" label="Zadig 地址" placeholder={ZADIG_SERVER_URL} disabled={true} style={{ backgroundColor: 'var(--semi-color-fill-1)' }} />
            <Form.Input field="apiToken" label="API Token" placeholder="请输入 API Token" mode="password" rules={[{ required: true, message: 'API Token 不能为空' }]} />

            <div
              style={{
                display: 'flex',
                gap: 12,
                margin: '24px 0',
                paddingLeft: 120,
              }}
            >
              <Button theme="solid" type="primary" htmlType="submit" loading={authLoading} icon={<IconSave />}>
                保存
              </Button>
              <Button type="tertiary" onClick={handleAuthTest} loading={authLoading} icon={<IconRefresh />}>
                测试连接
              </Button>
            </div>
          </Form>
        </Modal>
      </div>
    </ErrorBoundary>
  );
};

export default App;
