// API 模块入口文件
export * from './types';
export * from './AdminRequest';
export * from './UserRequest';
export * from './service';
export * from './AuthUtils';

// 默认导出常用的 API 方法
import {
  getGlobalAuthConfigAPI,
  updateGlobalAuthConfigAPI,
  getAdminUserKeyAPI,
  getUserKeyAPI,
  testAdminConnectionAPI,
  testAdminConnectionWithCustomAuthAPI,
  testUserConnectionAPI,
  testUserConnectionWithCustomAuthAPI,
  getWorkflowItemTypesAPI,
  getWorkflowItemTemplatesAPI,
  getWorkflowConfigListAPI,
  updateWorkflowConfigListAPI,
  getWorkflowItemNodesAPI,
  getProjectsAPI,
  getCustomWorkflowListAPI,
  getEnvironmentsAPI,
  getWorkItemWorkflowsAPI,
  getWorkItemWorkflowTasksAPI,
  getWorkflowItemPresetAPI,
  getAllBranchInfoAPI,
  getBranchCommitInfoAPI,
  getVersionListAPI,
  getVersionListLabelsAPI,
  getVersionDetailAPI,
  imagesAPI,
  previewChangedYamlAPI,
  getCalculatedValuesYamlAPI,
  getProductionCalculatedValuesYamlAPI,
  mergeImageIntoHelmYamlAPI,
  getBriefUsersAPI,
  getLarkDepartmentAPI,
  getLarkUserGroupListAPI,
  getDingtalkDepartmentAPI,
  getWechatDepartmentAPI,
  getWechatDepartmentUsersAPI,
  getUserGroupListAPI,
  getNacosNamespaceAPI,
  getNacosConfigAPI,
  getNacosConfigDetailAPI,
  getDatabaseListByProjectNameAPI,
  validateSqlAPI,
} from './service';

import { adminRequest } from './AdminRequest';
import { userRequest } from './UserRequest';

export const api = {
  // 用户认证
  getGlobalAuthConfigAPI,
  updateGlobalAuthConfigAPI,
  getAdminUserKeyAPI,
  getUserKeyAPI,
  testAdminConnectionAPI,
  testAdminConnectionWithCustomAuthAPI,
  testUserConnectionAPI,
  testUserConnectionWithCustomAuthAPI,

  // 插件配置相关
  getWorkflowConfigListAPI,
  updateWorkflowConfigListAPI,
  getWorkflowItemTypesAPI,
  getWorkflowItemTemplatesAPI,
  getWorkflowItemNodesAPI,
  getProjectsAPI,
  getCustomWorkflowListAPI,
  getEnvironmentsAPI,

  // 插件页面相关
  getWorkItemWorkflowsAPI,
  getWorkItemWorkflowTasksAPI,
  getWorkflowItemPresetAPI,

  // 插件页面-任务执行相关
  getAllBranchInfoAPI,
  getBranchCommitInfoAPI,
  getVersionListAPI,
  getVersionListLabelsAPI,
  getVersionDetailAPI,
  imagesAPI,
  previewChangedYamlAPI,
  getCalculatedValuesYamlAPI,
  getProductionCalculatedValuesYamlAPI,
  mergeImageIntoHelmYamlAPI,

  // 人工审批相关
  getBriefUsersAPI,
  getLarkDepartmentAPI,
  getLarkUserGroupListAPI,
  getDingtalkDepartmentAPI,
  getWechatDepartmentAPI,
  getWechatDepartmentUsersAPI,
  getUserGroupListAPI,

  // Nacos 配置变更
  getNacosNamespaceAPI,
  getNacosConfigAPI,
  getNacosConfigDetailAPI,

  // SQL 数据变更
  getDatabaseListByProjectNameAPI,
  validateSqlAPI,

  // 通用请求
  adminRequest,
  userRequest,
};

export default api;