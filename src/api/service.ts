import { userRequest } from './UserRequest';
import { adminRequest } from './AdminRequest';

// ==================== 插件授权配置相关 ====================
// 管理
// 获取授权配置
export const getGlobalAuthConfigAPI = (spaceId: string): Promise<any> =>
  adminRequest.get(`/api/plugin/plugin/lark/config/auth?spaceId=${spaceId}`);

// 更新授权配置
export const updateGlobalAuthConfigAPI = (payload: any): Promise<any> =>
  adminRequest.put(`/api/plugin/plugin/lark/config/auth`, payload);

// 获取 User Key
export const getAdminUserKeyAPI = (payload: any): Promise<any> =>
  adminRequest.post(`/api/plugin/plugin/lark/login`, payload);

// 测试连接
export const testAdminConnectionAPI = (): Promise<any> =>
  adminRequest.get(`/api/plugin/v1/policy/permission`);

// 测试连接（使用自定义鉴权参数）
export const testAdminConnectionWithCustomAuthAPI = async (authConfig: {
  url: string;
  apiToken: string;
}, pluginAuthData?: {
  user_access_token?: string;
  user_key?: string;
}): Promise<any> => {
  const axios = (await import('axios')).default;
  
  // 创建独立的请求实例，绕过拦截器
  const instance = axios.create({
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const url = `${authConfig.url}/api/plugin/v1/policy/permission`;
  const headers: any = {};

  // 添加基本鉴权
  if (authConfig.apiToken) {
    headers['Authorization'] = `Bearer ${authConfig.apiToken}`;
  }

  // 添加插件特有的认证头（如果提供）
  if (pluginAuthData) {
    if (pluginAuthData.user_access_token) {
      headers['X-PLUGIN-TOKEN'] = pluginAuthData.user_access_token;
    }
    if (pluginAuthData.user_key) {
      headers['X-USER-KEY'] = pluginAuthData.user_key;
    }
  }

  try {
    // 获取工作空间ID
    const configContext = await window.JSSDK.configuration.getContext();
    if (configContext.spaceId) {
      headers['X-WORKSPACE-ID'] = configContext.spaceId;
    }
  } catch (error) {
    console.warn('Failed to get workspace ID:', error);
  }

  return instance.get(url, { headers });
};


// ==================== 插件工作流配置相关 ====================

// 获取工作项类型
export const getWorkflowItemTypesAPI = (): Promise<any> =>
  adminRequest.get(`/api/plugin/plugin/lark/workitem/type`);

// 获取工作项模板
export const getWorkflowItemTemplatesAPI = (workitemTypeKey: string): Promise<any> =>
  adminRequest.get(`/api/plugin/plugin/lark/workitem/type/${workitemTypeKey}/template`);

//获取工作项节点列表
export const getWorkflowItemNodesAPI = (workitemTypeKey: string, templateId: string): Promise<any> =>
  adminRequest.get(`/api/plugin/plugin/lark/workitem/type/${workitemTypeKey}/template/${templateId}/node`);

// 获取项目列表
export const getProjectsAPI = (pageNum = 1, pageSize = 99999, filter = '', groupName = '', ungrouped = false): Promise<any> =>
  adminRequest.get(`/api/plugin/v1/picket/projects?verbosity=detailed&page_num=${pageNum}&page_size=${pageSize}&filter=${filter}&group_name=${groupName}&ungrouped=${ungrouped}`);

// 获取工作流列表
export const getCustomWorkflowListAPI = (projectName, viewName = '', page_num = 1, page_size = 500): Promise<any> =>
  adminRequest.get(`/api/plugin/aslan/workflow/v4?project=${projectName}&view_name=${encodeURIComponent(viewName)}&page_num=${page_num}&page_size=${page_size}&projectName=${projectName}`)

//获取配置列表
export const getWorkflowConfigListAPI = (workspaceId: string): Promise<any> =>
  adminRequest.get(`/api/plugin/plugin/lark/config/workflow?workspace_id=${workspaceId}`);

//更新配置列表
export const updateWorkflowConfigListAPI = (payload: any): Promise<any> =>
  adminRequest.put(`/api/plugin/plugin/lark/config/workflow`, payload);

// ==================== 插件页面相关 ====================
export const testUserConnectionAPI = (): Promise<any> =>
  userRequest.get(`/api/plugin/v1/policy/permission`);

// 用户测试连接（使用自定义鉴权参数）
export const testUserConnectionWithCustomAuthAPI = async (authConfig: {
  url: string;
  apiToken: string;
}, pluginAuthData?: {
  user_access_token?: string;
  user_key?: string;
}): Promise<any> => {
  const axios = (await import('axios')).default;
  
  // 创建独立的请求实例，绕过拦截器
  const instance = axios.create({
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const url = `${authConfig.url}/api/plugin/v1/policy/permission`;
  const headers: any = {};

  // 添加基本鉴权
  if (authConfig.apiToken) {
    headers['Authorization'] = `Bearer ${authConfig.apiToken}`;
  }

  // 添加插件特有的认证头（如果提供）
  if (pluginAuthData) {
    if (pluginAuthData.user_access_token) {
      headers['X-PLUGIN-TOKEN'] = pluginAuthData.user_access_token;
    }
    if (pluginAuthData.user_key) {
      headers['X-USER-KEY'] = pluginAuthData.user_key;
    }
  }

  try {
    // 获取工作空间ID
    const configContext = await window.JSSDK.configuration.getContext();
    if (configContext.spaceId) {
      headers['X-WORKSPACE-ID'] = configContext.spaceId;
    }
  } catch (error) {
    console.warn('Failed to get workspace ID:', error);
  }

  return instance.get(url, { headers });
};

// 获取 User Key
export const getUserKeyAPI = (payload: any): Promise<any> =>
  userRequest.post(`/api/plugin/plugin/lark/login`, payload);

//获取工作项的工作流
export const getWorkItemWorkflowsAPI = (workitemTypeKey: string, workItemId: string): Promise<any> =>
  userRequest.get(`/api/plugin/plugin/lark/workitem/${workitemTypeKey}/${workItemId}/workflow`)

// 获取工作项工作流任务列表
export const getWorkItemWorkflowTasksAPI = (workitemTypeKey: string, workItemId: string, workflowName: string, pageNum: number, pageSize: number): Promise<any> =>
  userRequest.get(`/api/plugin/plugin/lark/workitem/${workitemTypeKey}/${workItemId}/workflow/${workflowName}/task?pageNum=${pageNum}&pageSize=${pageSize}`);

// 获取环境列表
export const getEnvironmentsAPI = (projectName: string): Promise<any> =>
  userRequest.get(`/api/plugin/v1/environment/environments?projectName=${projectName}`)

// 获取项目详情
export const getProjectInfoAPI = (projectName: string): Promise<any> =>
  userRequest.get(`/api/aslan/project/products/${projectName}?projectName=${projectName}`)


// 获取工作项工作流 Preset
export const getWorkflowItemPresetAPI=(workflowName: string, projectName: string, approvalTicketId: string): Promise<any> =>
  userRequest.get(`/api/plugin/aslan/workflow/v4/preset/${workflowName}?projectName=${projectName}&approval_ticket_id=${approvalTicketId}`);

// 运行工作项工作流
export const runWorkItemWorkflowAPI=(workitemTypeKey: string, workItemID: string, payload: any): Promise<any> =>
  userRequest.post(`/api/plugin/plugin/lark/workitem/${workitemTypeKey}/${workItemID}/workflow`, payload);

// 获取任务克隆数据
export function getCustomCloneDetailAPI (workflowName, taskId, projectName) {
  return userRequest.get(`/api/plugin/aslan/workflow/v4/workflowtask/clone/workflow/${workflowName}/task/${taskId}?projectName=${projectName}`)
}

// ==================== 插件页面-任务执行相关 ====================
// 构建任务
export const getAllBranchInfoAPI = (data: any, param = ''): Promise<any> =>
  userRequest.put(`/api/plugin/aslan/code/codehost/infos?param=${param}`, data)

export const getBranchCommitInfoAPI = (codehostId: string, repoNamespace: string, repoName: string, branchName: string): Promise<any> =>
  userRequest.get(`/api/plugin/aslan/code/codehost/${codehostId}/commits?repoNamespace=${repoNamespace}&repoName=${repoName}&branchName=${branchName}`)

//部署任务
export const getVersionListAPI = (projectName = '', pageNum = 1, pageSize = 200, verbosity = 'detailed', label = ''): Promise<any> =>
  userRequest.get(`/api/plugin/aslan/delivery/releases?projectName=${projectName}&page=${pageNum}&per_page=${pageSize}&verbosity=${verbosity}&label=${encodeURIComponent(label)}`);

export const getVersionListLabelsAPI = (projectName = ''): Promise<any> =>
  userRequest.get(`/api/plugin/aslan/delivery/releases/labels?projectName=${projectName}`);

export const getVersionDetailAPI = (projectName: string, versionId: string): Promise<any> =>
  userRequest.get(`/api/plugin/aslan/delivery/releases/${versionId}?projectName=${projectName}`);

export const imagesAPI = (projectName: string, payload: any, registry = ''): Promise<any> =>
  userRequest.post(`/api/plugin/aslan/system/registry/images?projectName=${projectName}&registryId=${registry}`, { names: payload });

export const previewChangedYamlAPI = (envName: string, serviceName: string, projectName: string, payload: any): Promise<any> =>
  userRequest.post(`/api/plugin/aslan/environment/environments/${envName}/services/${serviceName}/preview?projectName=${projectName}`, payload);

export const getCalculatedValuesYamlAPI = ({ projectName, serviceName, envName, scene, isHelmChartDeploy, updateServiceRevision, format, valueMergeStrategy = 'override' }: any, payload: any): Promise<any> =>
  userRequest.post(`/api/plugin/aslan/environment/environments/${envName}/estimated-values?projectName=${projectName}&serviceName=${serviceName}&scene=${scene}&isHelmChartDeploy=${isHelmChartDeploy}&updateServiceRevision=${updateServiceRevision}&format=${format}&valueMergeStrategy=${valueMergeStrategy}`, payload);

export const getProductionCalculatedValuesYamlAPI = ({ projectName, serviceName, envName, scene, isHelmChartDeploy, updateServiceRevision, format, valueMergeStrategy = 'override' }: any, payload: any): Promise<any> =>
  userRequest.post(`/api/plugin/aslan/environment/environments/${envName}/estimated-values?projectName=${projectName}&serviceName=${serviceName}&scene=${scene}&isHelmChartDeploy=${isHelmChartDeploy}&updateServiceRevision=${updateServiceRevision}&format=${format}&valueMergeStrategy=${valueMergeStrategy}&production=true`, payload);

export const mergeImageIntoHelmYamlAPI = (projectName: string, payload: any): Promise<any> =>
  userRequest.post(`/api/plugin/aslan/workflow/v4/deploy/mergeImage?projectName=${projectName}`, payload);

//人工审批
export const getBriefUsersAPI = (payload: any, projectName = ''): Promise<any> =>
  userRequest.post(`/api/plugin/v1/users/brief?projectName=${projectName}`, payload);

export const getLarkDepartmentAPI = (id: string, departmentId: string, projectName: string, type = 'open_id'): Promise<any> =>
  userRequest.get(`/api/plugin/aslan/system/lark/${id}/department/${departmentId}?projectName=${projectName}&user_id_type=${type}`);

export const getLarkUserGroupListAPI = (id: string, projectName: string, type = 'user_group', page_token = ''): Promise<any> =>
  userRequest.get(`/api/plugin/aslan/system/lark/${id}/user_group?type=${type}&projectName=${projectName}&page_token=${page_token}`);

export const getDingtalkDepartmentAPI = (id: string, departmentId: string, projectName: string): Promise<any> =>
  userRequest.get(`/api/plugin/aslan/system/dingtalk/${id}/department/${departmentId}?projectName=${projectName}`);

export const getWechatDepartmentAPI = (id: string, projectName: string): Promise<any> =>
  userRequest.get(`/api/plugin/aslan/system/workwx/${id}/department?projectName=${projectName}`);

export const getWechatDepartmentUsersAPI = (id: string, departmentId: string, projectName: string): Promise<any> =>
  userRequest.get(`/api/plugin/aslan/system/workwx/${id}/user?department_id=${departmentId}&projectName=${projectName}`);

export const getUserGroupListAPI = (page_num: number, page_size: number, name = ''): Promise<any> =>
  userRequest.get(`/api/plugin/v1/user-group?page_num=${page_num}&page_size=${page_size}&name=${name}`);

// Nacos 配置变更
export const getNacosNamespaceAPI = (nacosID: string): Promise<any> =>
  userRequest.get(`/api/plugin/aslan/system/nacos/${nacosID}`);

export const getNacosConfigAPI = (nacosID: string, nacosNamespaceID: string): Promise<any> =>
  userRequest.get(`/api/plugin/aslan/system/nacos/${nacosID}/namespace/${nacosNamespaceID}`);

export const getNacosConfigDetailAPI = (id: string, namespace: string, groupName: string, dataName: string, projectName: string): Promise<any> =>
  userRequest.get(`/api/plugin/aslan/system/configuration/nacos/${id}/namespace/${namespace}/group/${groupName}/data/${dataName}?projectName=${projectName}`);

// SQL 数据变更
export const getDatabaseListByProjectNameAPI = (projectName = ''): Promise<any> =>
  userRequest.get(`/api/plugin/aslan/system/dbinstance/project?projectName=${projectName}`);

export const validateSqlAPI = (payload: any): Promise<any> =>
  userRequest.post('/api/plugin/aslan/workflow/v4/sql/validate', payload);

// ==================== 扫描任务相关 ====================

// 获取扫描配置
export const getScanningConfigAPI = (projectName: string, scanningId: string): Promise<any> =>
  userRequest.get(`/api/plugin/aslan/scanning/config/${scanningId}?projectName=${projectName}`);

// 获取扫描目标服务
export const getScanningTargetsAPI = (projectName: string): Promise<any> =>
  userRequest.get(`/api/plugin/aslan/scanning/targets?projectName=${projectName}`);

// 获取标签信息
export const getTagInfoAPI = (data: any, param = ''): Promise<any> =>
  userRequest.put(`/api/plugin/aslan/code/codehost/tags?param=${param}`, data);

// 获取PR信息
export const getPRInfoAPI = (data: any, param = ''): Promise<any> =>
  userRequest.put(`/api/plugin/aslan/code/codehost/prs?param=${param}`, data);

// ==================== 工作流执行相关 ====================

// 执行工作流
export const runWorkflowAPI = (workflowName: string, projectName: string, payload: any): Promise<any> =>
  userRequest.post(`/api/plugin/aslan/workflow/v4/${workflowName}/task?projectName=${projectName}`, payload);

// 获取工作流执行历史
export const getWorkflowTaskHistoryAPI = (workflowName: string, projectName: string, pageNum = 1, pageSize = 20): Promise<any> =>
  userRequest.get(`/api/plugin/aslan/workflow/v4/workflowtask?workflow_name=${workflowName}&projectName=${projectName}&page_num=${pageNum}&page_size=${pageSize}`);

// 取消工作流任务
export const cancelWorkflowTaskAPI = (taskId: string, projectName: string): Promise<any> =>
  userRequest.delete(`/api/plugin/aslan/workflow/v4/workflowtask/id/${taskId}?projectName=${projectName}`);

// 重新执行工作流任务
export const restartWorkflowTaskAPI = (taskId: string, projectName: string): Promise<any> =>
  userRequest.post(`/api/plugin/aslan/workflow/v4/workflowtask/id/${taskId}/restart?projectName=${projectName}`);

// ==================== 手机验证相关 ====================
// 检查工作流审批
export const checkWorkflowApprovalAPI = (workflowName: string): Promise<any> =>
  userRequest.post(`/api/plugin/aslan/workflow/v4/check/${workflowName}`);

// 更新当前用户邮箱/手机号
export const updateCurrentUserMailAPI = (uid: string, payload: any): Promise<any> =>
  userRequest.put(`/api/plugin/v1/user/${uid}`, payload);

// ==================== 环境服务相关 ====================

// 获取环境服务详情
export const getEnvironmentServiceAPI = (projectName: string, envName: string): Promise<any> =>
  userRequest.get(`/api/plugin/aslan/environment/environments/${envName}/services?projectName=${projectName}`);


// 获取服务模块
export const getServiceModulesAPI = (projectName: string, serviceName: string): Promise<any> =>
  userRequest.get(`/api/plugin/aslan/service/services/${serviceName}/modules?projectName=${projectName}`);