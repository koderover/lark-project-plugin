import { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import { Table, Tag, Button, Space, Empty, Spin, Toast, Typography, Tooltip } from '@douyinfe/semi-ui';
import { IconClock } from '@douyinfe/semi-icons';

const { Text } = Typography;
import { IllustrationConstruction, IllustrationConstructionDark } from '@douyinfe/semi-illustrations';
import { getWorkItemWorkflowTasksAPI } from '../../../api/service';
import RepoJump, { RepoInfo } from './RepoJump';

// 服务模块接口（适配最新API）
interface ServiceModule {
  service_name: string;
  service_module: string;
}

// 部署环境接口
interface DeployEnv {
  env_name?: string;
  namespace?: string;
  [key: string]: any;
}

// 主要任务项接口（适配最新API）
interface TaskItem {
  task_id: number;
  task_creator: string;
  project_name: string;
  workflow_name: string;
  workflow_display_name: string;
  remark: string;
  status: 'disabled' | 'created' | 'running' | 'failed' | 'passed' | 'timeout' | 'cancelled' | 
          'wait_for_approval' | 'waitforapprove' | 'waiting' | 'queued' | 'blocked' | 'skipped' | 
          'prepare' | 'reject' | 'pending' | 'debug_before' | 'debug_after' | 'checking' | 
          'unfinished' | 'abnormal' | 'normal' | 'done' | 'pause' | 'unstable' | 'wait_for_manual_error_handling';
  reverted: boolean;
  create_time: number;
  start_time: number;
  end_time: number;
  hash: string;
  repos: RepoInfo[]; // 代码仓库信息数组
  service_modules: ServiceModule[]; // 服务模块数组
  deploy_envs: DeployEnv[]; // 部署环境数组
}

interface WorkflowTasksListProps {
  // 数据加载参数
  workItemTypeKey: string;
  workItemId: string;
  workflow: {
    name: string;
    display_name?: string;
    project?: string;
  };
  projectKey?: string;
  
  // 基本配置
  workflowName?: string; // 工作流名称
  displayName?: string; // 工作流显示名称
  workflowHash?: string; // 工作流hash，用于判断配置是否变更
  
  // 权限控制
  disabledRun?: boolean; // 是否禁用运行
  
  // 回调函数
  onCloneTask: (task: TaskItem) => void;
  onTasksLoad?: (tasks: TaskItem[], total: number) => void; // 可选的数据加载回调
  
  // 控制参数
  autoLoad?: boolean; // 是否自动加载数据，默认为 true
  autoRefresh?: boolean; // 是否启用自动刷新，默认为 true
  refreshInterval?: number; // 刷新间隔（毫秒），默认 3000ms
  refreshTrigger?: number; // 刷新触发器，改变此值会重新加载数据
}

// 暴露给外部的方法接口
export interface WorkflowTasksListRef {
  refresh: () => void;
  loadTasks: (pageNum?: number, pageSize?: number) => Promise<void>;
  startAutoRefresh: () => void;
  stopAutoRefresh: () => void;
}

const WorkflowTasksList = forwardRef<WorkflowTasksListRef, WorkflowTasksListProps>(({
  workItemTypeKey,
  workItemId,
  workflow,
  projectKey,
  workflowName,
  displayName,
  workflowHash,
  disabledRun = false,
  onCloneTask,
  onTasksLoad,
  autoLoad = true,
  autoRefresh = true,
  refreshInterval = 3000,
  refreshTrigger
}, ref) => {
  // 内部状态管理
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [backgroundLoading, setBackgroundLoading] = useState(false); // 后台刷新状态
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 200,
    total: 0
  });
  
  // 自动刷新相关状态
  const [isVisible, setIsVisible] = useState(true); // 页面可见性
  const [isUserInteracting, setIsUserInteracting] = useState(false); // 用户是否正在交互
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLoadTimeRef = useRef<number>(0);
  const mountedRef = useRef(true);

  // 加载任务数据（带防抖和性能优化）
  const loadTasks = async (pageNum?: number, pageSize?: number, isAutoRefresh: boolean = false) => {
    // 使用传入的参数或当前分页状态
    const currentPageNum = pageNum ?? pagination.current;
    const currentPageSize = pageSize ?? pagination.pageSize;
    if (!workItemTypeKey || !workItemId || !workflow.name || !mountedRef.current) {
      if (!mountedRef.current) {
      } else {
        console.warn('缺少必要的参数，无法加载任务数据');
      }
      return;
    }

    // 防抖：如果距离上次加载时间太短，则跳过（除非是用户主动操作）
    const now = Date.now();
    if (isAutoRefresh && now - lastLoadTimeRef.current < 1000) {
      return;
    }

    // 如果正在加载中且是自动刷新，则跳过
    if ((loading || backgroundLoading) && isAutoRefresh) {
      return;
    }

    lastLoadTimeRef.current = now;
    
    // 区分前台加载和后台刷新
    if (isAutoRefresh) {
      setBackgroundLoading(true);
    } else {
      setLoading(true);
    }
    
    try {
      const tasksResponse = await getWorkItemWorkflowTasksAPI(workItemTypeKey, workItemId, workflow.name, currentPageNum, currentPageSize);
      
      // 检查组件是否仍然挂载
      if (!mountedRef.current) {
        return;
      }
      
      const tasksData = tasksResponse?.tasks || [];
      const total = tasksResponse?.count || 0;
      
      
      // 平滑更新数据，避免闪烁
      setTasks(tasksData);
      setPagination({
        current: currentPageNum,
        pageSize: currentPageSize,
        total: total
      });

      // 调用外部回调
      if (onTasksLoad) {
        onTasksLoad(tasksData, total);
      }
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }
      
      console.error('加载工作流任务失败:', error);
      
      // 自动刷新时的错误不显示 Toast，避免干扰用户
      if (!isAutoRefresh) {
        Toast.error('加载任务列表失败');
        // 只有用户主动操作失败时才清空数据
        setTasks([]);
        setPagination(prev => ({ ...prev, total: 0 }));
      }
      // 自动刷新失败时保持原有数据，不清空
    } finally {
      if (mountedRef.current) {
        if (isAutoRefresh) {
          setBackgroundLoading(false);
        } else {
          setLoading(false);
        }
      }
    }
  };

  // 清除定时器
  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // 启动自动刷新定时器
  const startAutoRefresh = () => {
    if (!autoRefresh || !isVisible || isUserInteracting) {
      return;
    }
    
    clearTimer();
    timerRef.current = setTimeout(() => {
      if (mountedRef.current && autoRefresh && isVisible && !isUserInteracting) {
        loadTasks(pagination.current, pagination.pageSize, true);
        startAutoRefresh(); // 递归启动下一次定时器
      }
    }, refreshInterval);
  };

  // 停止自动刷新
  const stopAutoRefresh = () => {
    clearTimer();
  };

  // 页面可见性检测
  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = !document.hidden;
      setIsVisible(visible);
      
      if (visible) {
        // 页面变为可见时，立即刷新一次数据
        loadTasks(pagination.current, pagination.pageSize, true);
      } else {
        stopAutoRefresh();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [pagination.current, pagination.pageSize]);

  // 组件挂载和卸载处理
  useEffect(() => {
    mountedRef.current = true;
    
    return () => {
      mountedRef.current = false;
      stopAutoRefresh();
    };
  }, []);

  // 自动加载数据
  useEffect(() => {
    if (autoLoad) {
      loadTasks(1, 5); // 明确指定初始页码和页面大小
    }
  }, [workItemTypeKey, workItemId, workflow.name, autoLoad]);

  // 响应刷新触发器
  useEffect(() => {
    if (refreshTrigger !== undefined) {
      setIsUserInteracting(true);
      stopAutoRefresh();
      loadTasks(pagination.current, pagination.pageSize, false);
      
      // 延迟恢复自动刷新
      setTimeout(() => {
        setIsUserInteracting(false);
      }, 3000);
    }
  }, [refreshTrigger]);

  // 自动刷新控制
  useEffect(() => {
    if (autoRefresh && isVisible && !isUserInteracting && !loading && !backgroundLoading) {
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
    
    return () => {
      stopAutoRefresh();
    };
  }, [autoRefresh, isVisible, isUserInteracting, loading, backgroundLoading, refreshInterval]);

  // 暴露给外部的方法
  useImperativeHandle(ref, () => ({
    refresh: () => {
      setIsUserInteracting(true);
      stopAutoRefresh();
      loadTasks(pagination.current, pagination.pageSize, false);
      setTimeout(() => {
        setIsUserInteracting(false);
      }, 3000);
    },
    loadTasks: async (pageNum?: number, pageSize?: number) => {
      await loadTasks(pageNum, pageSize, false);
    },
    startAutoRefresh: () => {
      setIsUserInteracting(false);
      startAutoRefresh();
    },
    stopAutoRefresh: () => {
      stopAutoRefresh();
    }
  }));

  // 时间格式化工具函数
  const timeFormat = (seconds: number): string => {
    if (!seconds || seconds <= 0) return '0s';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h${minutes}m${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m${secs}s`;
    } else {
      return `${secs}s`;
    }
  };



  // 状态类型映射（对标Vue版本的$utils.taskElTagType）
  const getStatusTagType = (status: string): string => {
    // 对标Vue版本的taskElTagType逻辑
    switch (status) {
      case 'passed':
      case 'done':
      case 'normal':
        return 'success';
      case 'failed':
      case 'timeout':
      case 'abnormal':
      case 'reject':
      case 'wait_for_manual_error_handling':
        return 'danger';
      case 'running':
      case 'prepare':
      case 'checking':
      case 'debug_before':
      case 'debug_after':
        return 'primary';
      case 'wait_for_approval':
      case 'waitforapprove':
      case 'blocked':
      case 'pause':
      case 'unstable':
        return 'warning';
      case 'cancelled':
      case 'skipped':
      case 'unfinished':
      case 'disabled':
        return 'default';
      case 'created':
      case 'waiting':
      case 'queued':
      case 'pending':
        return 'info';
      default:
        return 'default';
    }
  };

  // 状态文本映射（对标Vue版本的国际化）
  const getStatusText = (status: string): string => {
    const statusTextMap: Record<string, string> = {
      // 对标Vue版本的workflowTaskStatus翻译
      wait_for_approval: '待审批',
      waitforapprove: '待审批',
      reject: '拒绝',
      created: '排队中',
      waiting: '排队中', 
      queued: '队列中',
      pending: '排队中',
      blocked: '阻塞',
      pause: '等待手动执行',
      running: '正在运行',
      prepare: '准备环境',
      checking: '检测中',
      debug_before: '执行前调试',
      debug_after: '执行后调试',
      passed: '成功',
      done: '已完成',
      normal: '正常',
      failed: '失败',
      timeout: '超时',
      abnormal: '异常',
      unstable: '不稳定',
      wait_for_manual_error_handling: '失败待确认',
      cancelled: '取消',
      skipped: '跳过',
      unfinished: '未完成',
      disabled: '未开始',
      notRunning: '未运行'
    };

    return statusTextMap[status] || status;
  };

  // 格式化状态（严格对标Vue版本）
  const getStatusTag = (status: string, reverted?: boolean) => {
    const tagType = getStatusTagType(status);
    const statusText = getStatusText(status);
    
    // Semi UI的Tag组件颜色映射
    const colorMap: Record<string, any> = {
      success: 'green',
      danger: 'red', 
      primary: 'blue',
      warning: 'orange',
      info: 'cyan',
      default: 'grey'
    };

    return (
      <Space>
        <Tag color={colorMap[tagType]}>{statusText}</Tag>
        {reverted && <Tag color="orange" size="small">回滚</Tag>}
      </Space>
    );
  };

  // 格式化时间戳（严格对标Vue版本的moment.unix(value).format('MM-DD HH:mm')）
  const formatTime = (timestamp: number) => {
    if (!timestamp) return '-';
    const date = new Date(timestamp * 1000);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${month}-${day} ${hours}:${minutes}`;
  };

  // 计算任务耗时（简化版本，直接使用API数据）
  const getDuration = (task: TaskItem) => {
    if (task.status === 'running') {
      // 正在运行的任务，计算当前时间与开始时间的差值
      if (!task.start_time) return '-';
      const currentTime = Math.floor(Date.now() / 1000);
      return timeFormat(currentTime - task.start_time);
    } else {
      // 已完成的任务，使用结束时间和开始时间的差值
      if (!task.start_time || !task.end_time) return '-';
      return timeFormat(task.end_time - task.start_time);
    }
  };

  // 生成任务详情URL（对标您提供的生成规则）
  const generateTaskDetailUrl = async (taskId: number, status: string, workflowName: string, workflowDisplayName: string, projectKey: string) => {
    try {
      const savedConfig = await window.JSSDK.storage.getItem('zadig-auth-config');
      if (!savedConfig) {
        console.error('未找到配置信息');
        return '';
      }
      
      const config = JSON.parse(savedConfig);
      const baseUrl = config.url;
      
      // URL模板：${baseUrl}/v1/projects/detail/${项目key}/pipelines/custom/${工作流key}/${任务ID}?status=${状态}&id=&display_name=${工作流displayname}
      const url = `${baseUrl}/v1/projects/detail/${projectKey}/pipelines/custom/${workflowName}/${taskId}?status=${status}&id=&display_name=${encodeURIComponent(workflowDisplayName)}`;
      
      return url;
    } catch (error) {
      console.error('生成任务详情URL失败:', error);
      return '';
    }
  };

  // 渲染服务模块列表（适配最新API）
  const renderServiceModules = (serviceModules?: ServiceModule[]) => {
    if (!serviceModules || serviceModules.length === 0) {
      return <Text type="tertiary">-</Text>;
    }

    return (
      <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
        {serviceModules.map((item, index) => (
          <div key={index} style={{ marginBottom: '2px' }}>
            <Tooltip content={`${item.service_module}(${item.service_name})`}>
              <Text 
                ellipsis={{ showTooltip: true }}
                style={{ 
                  fontSize: '13px',
                  display: 'block',
                  maxWidth: '160px',
                  cursor: 'default'
                }}
              >
                {item.service_module}({item.service_name})
              </Text>
            </Tooltip>
          </div>
        ))}
      </div>
    );
  };

  // 渲染部署环境列表（适配最新API）
  const renderDeployEnvs = (deployEnvs?: DeployEnv[]) => {
    if (!deployEnvs || deployEnvs.length === 0) {
      return <Text type="tertiary">-</Text>;
    }

    return (
      <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
        {deployEnvs.map((env, index) => (
          <div key={index} style={{ marginBottom: '2px' }}>
            <Text style={{ fontSize: '13px' }}>
              {env.env_name || env.namespace || '-'}
            </Text>
          </div>
        ))}
      </div>
    );
  };

  // 渲染代码仓库详情（适配最新API）
  const renderRepoInfo = (repos?: RepoInfo[]) => {
    if (!repos || repos.length === 0) {
      return <Text type="tertiary">-</Text>;
    }

    return (
      <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
        {repos.map((repo, index) => {
          return (
            <div key={index} style={{ marginBottom: '2px' }}>
              <RepoJump build={repo} showCommit={true} />
            </div>
          );
        })}
      </div>
    );
  };

  // 构建表格列（严格按照用户指定的字段）
  const buildColumns = () => {
    const columns: any[] = [];

    // 1. ID列（必须显示）
    columns.push({
      title: 'ID',
      dataIndex: 'task_id',
      key: 'task_id',
      width: 60,
      fixed: 'left',
        render: (id: number, record: TaskItem) => (
          <Text 
            link={{
              onClick: async () => {
                // 使用新的URL生成规则
                const url = await generateTaskDetailUrl(
                  id, 
                  record.status, 
                  workflowName || workflow.name, 
                  displayName || workflow.display_name || '', 
                  projectKey || ''
                );
                if (url) {
                  window.JSSDK?.navigation?.open(url);
                }
              }
            }}
            style={{ cursor: 'pointer', color: '#0066cc' }}
          >
            {`#${id}`}
          </Text>
        ),
    });

    // 2. 运行状态列（必须显示）
    columns.push({
      title: '运行状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string, record: TaskItem) => getStatusTag(status, record.reverted),
    });

    // 3. 持续时间列（必须显示）
    columns.push({
      title: '持续时间',
      key: 'duration',
      width: 100,
      render: (_: any, record: TaskItem) => (
        <Space>
          <IconClock size="small" style={{ color: '#1c1f239e', verticalAlign: 'bottom' }} />
          <Text style={{ fontSize: '13px' }}>
            {getDuration(record)}
          </Text>
        </Space>
      ),
    });

    // 4. 执行人列（必须显示）
    columns.push({
      title: '执行人',
      key: 'executor',
      width: 120,
      render: (_: any, record: TaskItem) => (
        <div>
          <Text style={{ fontSize: '13px' }}>{record.task_creator || '-'}</Text>
          <Text type="tertiary" style={{ fontSize: '11px', display: 'block' }}>
            {formatTime(record.create_time)}
          </Text>
        </div>
      ),
    });

    // 5. 分支信息列（必须显示）
    columns.push({
      title: '分支信息',
      key: 'branch',
      minWidth: 100,
      width: 200,
      render: (_: any, record: TaskItem) => renderRepoInfo(record.repos),
    });

    // 6. 服务组件列（必须显示）
    columns.push({
      title: '服务组件',
      key: 'service_modules',
      width: 180,
      render: (_: any, record: TaskItem) => renderServiceModules(record.service_modules),
    });

    // 7. 部署环境列（必须显示）
    columns.push({
      title: '部署环境',
      key: 'deploy_envs',
      width: 120,
      render: (_: any, record: TaskItem) => renderDeployEnvs(record.deploy_envs),
    });

    // 8. 操作列（必须显示）
    columns.push({
      title: '操作',
      key: 'action',
      width: 90,
      fixed: 'right',
      render: (_: any, record: TaskItem) => {
        const isDisabled = disabledRun || (workflowHash && workflowHash !== record.hash);
        return isDisabled ? (
            <Button
              size="small"
              disabled
              style={{ fontSize: '12px' }}
            >
              克隆
            </Button>
        ) : (
          <Button
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onCloneTask(record);
            }}
            style={{ fontSize: '12px' }}
          >
            克隆
          </Button>
        );
      },
    });

    return columns;
  };

  const columns = buildColumns();

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <Spin size="large" />
        <Text style={{ display: 'block', marginTop: 16 }}>正在加载任务列表...</Text>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <Empty
        image={<IllustrationConstruction style={{ width: 150, height: 150 }} />}
        darkModeImage={<IllustrationConstructionDark style={{ width: 150, height: 150 }} />}
        description="暂无任务记录"
      />
    );
  }

  return (
    <div className="workflow-tasks-list">
      <div 
        onMouseEnter={() => {
          setIsUserInteracting(true);
        }}
        onMouseLeave={() => {
          setTimeout(() => {
            setIsUserInteracting(false);
          }, 1000); // 1秒后恢复自动刷新
        }}
      >
        <Table
          columns={columns}
          dataSource={tasks}
          rowKey="task_id"
          pagination={false}
          size="small"
          onRow={(record) => ({
            onClick: async () => {
              // 使用新的URL生成规则
              const url = await generateTaskDetailUrl(
                record?.task_id || 0,
                record?.status || '',
                workflowName || workflow.name,
                displayName || workflow.display_name || '',
                projectKey || ''
              );
              if (url) {
                window.JSSDK?.navigation?.open(url);
              }
            },
            style: { cursor: 'pointer' }
          })}
        />
      </div>
    </div>
  );
});

WorkflowTasksList.displayName = 'WorkflowTasksList';

export default WorkflowTasksList;