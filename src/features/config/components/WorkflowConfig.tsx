import React, { useState, useEffect } from 'react';
import {
  Card,
  Button,
  Form,
  Select,
  Toast,
  Row,
  Col,
  Spin
} from '@douyinfe/semi-ui';
import { IconPlus, IconDelete } from '@douyinfe/semi-icons';
import {
  getWorkflowItemTypesAPI,
  getWorkflowItemTemplatesAPI,
  getWorkflowItemNodesAPI,
  getProjectsAPI,
  getCustomWorkflowListAPI,
  getWorkflowConfigListAPI,
  updateWorkflowConfigListAPI
} from '../../../api/service';
import { isLogin } from '../../../AdminAccessControl';


interface WorkflowConfigItem {
  nodes: {
    node_id: string;
    node_name: string;
    project_key: string;
    template_id: number;
    template_name: string;
    workflow_name: string;
  }[];
  work_item_type_key: string;
  workspace_id: string;
}

interface WorkflowConfigRequest {
  configs: WorkflowConfigItem[];
  workspace_id: string;
}

interface WorkItemType {
  type_key: string;
  name: string;
  api_name: string;
}

interface WorkItemNode {
  id: string;
  name: string;
}

interface WorkItemTemplate {
  id: number;
  name: string;
}

interface Project {
  alias: string;
  name: string;
  key: string;
}

interface Workflow {
  name: string;
  display_name?: string;
}

interface ConfigForm {
  id: string;
  formApi: any;
  isNew: boolean;
  config: WorkflowConfigItem;
  nodes: Array<{
    id: string;
    selectedNode: string;
    selectedProject: string;
    selectedTemplate: string;
    selectedCascaderValue: string[]; // 添加级联选择器的值 [templateId, nodeId]
    nodeOptions: WorkItemNode[];
    templateOptions: WorkItemTemplate[];
    workflows: Workflow[];
    cascaderData: Array<{ // 添加级联数据
      label: string;
      value: string;
      children?: Array<{
        label: string;
        value: string;
      }>;
      isLeaf?: boolean;
    }>;
  }>;
  workItemNodes: WorkItemNode[];
  workItemTemplates: WorkItemTemplate[];
}

const WorkflowConfig: React.FC = () => {
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true); // 初始设为 true，避免闪烁
  const [workItemTypes, setWorkItemTypes] = useState<WorkItemType[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [configForms, setConfigForms] = useState<ConfigForm[]>([]);

  // 初始化组件
  useEffect(() => {
    initializeComponent();
  }, []);

  const initializeComponent = async () => {
    try {
      // 先检查是否有授权配置
      const authConfig = await getAuthConfig();
      if (!authConfig) {
        Toast.warning('请先完成授权配置');
        setLoading(false);
        return;
      }

      // 检查登录状态
      try {
        await isLogin();
        // 登录成功后并发加载基础数据，配置数据单独加载（因为它依赖基础数据的处理）
        await Promise.all([
          fetchWorkItemTypes(),
          fetchProjects()
        ]);
        // 基础数据加载完成后再加载配置
        await loadConfigs();
      } catch (error) {
        console.error('Login failed:', error);
        Toast.error('登录失败，请重试');
      }
    } catch (error) {
      console.error('Component initialization failed:', error);
      Toast.error('初始化失败');
    } finally {
      // 确保在所有操作完成后取消 loading
      setLoading(false);
    }
  };

  // 获取 Zadig 授权配置
  const getAuthConfig = async () => {
    try {
      const authConfig = await window.JSSDK.storage.getItem('zadig-admin-auth-config');
      return authConfig ? JSON.parse(authConfig) : null;
    } catch (error) {
      console.error('Failed to get auth config:', error);
      return null;
    }
  };

  // 加载配置列表
  const loadConfigs = async () => {
    try {
      const context = await window.JSSDK.Context.load();
      if (context && (context as any).mainSpace?.id) {
        const workspaceId = (context as any).mainSpace.id;
        const response = await getWorkflowConfigListAPI(workspaceId || '');
        const configs = response?.configs || [];
        
        if (configs.length === 0) {
          setConfigForms([]);
          return;
        }
        
        // 第一步：并发获取所有需要的工作项模板
        const workItemTypeKeys = [...new Set(configs.map(config => config.work_item_type_key))];
        const templatesPromises = workItemTypeKeys.map(typeKey => 
          fetchWorkItemTemplates(String(typeKey)).then(templates => ({ typeKey, templates }))
        );
        const templatesResults = await Promise.all(templatesPromises);
        const templatesMap = new Map(templatesResults.map(result => [result.typeKey, result.templates]));

        // 第二步：只获取当前配置中实际使用的工作项节点（用于显示已选择的值）
        const nodeRequests = configs.flatMap(config => 
          config.nodes.map(node => ({
            typeKey: config.work_item_type_key,
            templateId: node.template_id,
            key: `${config.work_item_type_key}_${node.template_id}`
          }))
        );
        const uniqueNodeRequests = nodeRequests.filter((request, index, arr) => 
          arr.findIndex(r => r.key === request.key) === index
        );
        
        const nodesPromises = uniqueNodeRequests.map(request => 
          fetchWorkItemNodes(request.typeKey, request.templateId).then(nodes => ({ 
            key: request.key, 
            typeKey: request.typeKey,
            templateId: request.templateId,
            nodes 
          }))
        );
        const nodesResults = await Promise.all(nodesPromises);
        const nodesMap = new Map(nodesResults.map(result => [result.key, result.nodes]));
        
        // 第三步：收集所有需要获取工作流的项目
        const projectKeys = [...new Set(
          configs.flatMap(config => 
            config.nodes.map(node => node.project_key)
          ).filter(Boolean)
        )];
        
        // 第四步：并发获取所有项目的工作流
        const workflowPromises = projectKeys.map(projectKey => 
          fetchWorkflows(String(projectKey)).then(workflows => ({ projectKey, workflows }))
        );
        const workflowResults = await Promise.all(workflowPromises);
        const workflowsMap = new Map(workflowResults.map(result => [result.projectKey, result.workflows]));
        
        // 第五步：构建表单数据
        const forms = configs.map((config, index) => {
          const templates = templatesMap.get(config.work_item_type_key) || [];
          
          return {
            id: Date.now().toString() + Math.random() + '_' + index,
            formApi: null,
            isNew: false,
            config: config,
            nodes: config.nodes.map(node => {
              const nodeKey = `${config.work_item_type_key}_${node.template_id}`;
              const nodeOptions = nodesMap.get(nodeKey) || [];
              const templateOptions = templates;
              
              // 构建当前节点的级联数据（只为当前使用的模板预加载子节点）
              const cascaderData = templates.map(template => {
                const templateNodeKey = `${config.work_item_type_key}_${template.id}`;
                const templateNodes = nodesMap.get(templateNodeKey) || [];
                
                // 判断这个模板是否被当前节点使用
                const isCurrentTemplate = String(template.id) === String(node.template_id);
                
                if (isCurrentTemplate && templateNodes.length > 0) {
                  // 只为当前使用的模板且已加载到子节点数据时，预先显示子节点
                  return {
                    label: template.name,
                    value: String(template.id),
                    children: templateNodes.map(tNode => ({
                      label: tNode.name,
                      value: tNode.id,
                      isLeaf: true
                    }))
                  };
                } else {
                  // 所有其他情况都支持异步加载（包括当前模板但没有预加载数据的情况）
                  return {
                    label: template.name,
                    value: String(template.id),
                    // 不设置children和isLeaf，让Cascader异步加载来确定是否有子节点
                  };
                }
              });
              
              // 判断当前节点是否是叶子节点（模板ID等于节点ID）
              const isLeafNode = String(node.template_id) === node.node_id;
              const selectedCascaderValue = isLeafNode 
                ? [String(node.template_id)] 
                : [String(node.template_id), node.node_id];
              
              return {
                id: `loaded_${index}_${Date.now()}_${Math.random()}`,
                selectedNode: node.node_id,
                selectedProject: node.project_key,
                selectedTemplate: String(node.template_id),
                selectedCascaderValue: selectedCascaderValue,
                nodeOptions: nodeOptions,
                templateOptions: templateOptions,
                workflows: workflowsMap.get(node.project_key) || [],
                cascaderData: cascaderData
              };
            }),
            workItemNodes: [], // 这个将根据模板选择动态更新
            workItemTemplates: templates
          };
        });
        
        setConfigForms(forms);
      }
    } catch (error) {
      console.error('Failed to load configs:', error);
      Toast.error('获取配置列表失败');
    }
  };

  // 获取工作项类型列表
  const fetchWorkItemTypes = async () => {
    try {
      const response = await getWorkflowItemTypesAPI();
      setWorkItemTypes(response?.work_item_types || []);
    } catch (error) {
      console.error('获取工作项类型失败:', error);
      Toast.error('获取工作项类型失败');
    }
  };

  // 获取项目列表
  const fetchProjects = async () => {
    const authConfig = await getAuthConfig();
    if (!authConfig) {
      Toast.warning('请先配置 Zadig 授权信息');
      return;
    }

    try {
      const response = await getProjectsAPI();
      const projects = response?.projects || [];
      setProjects(projects);
    } catch (error) {
      console.error('获取项目列表失败:', error);
      Toast.error('获取项目列表失败');
      setProjects([]);
    }
  };

  // 获取工作项模板列表
  const fetchWorkItemTemplates = async (workItemTypeKey: string) => {
    if (!workItemTypeKey) {
      return [];
    }

    try {
      const response = await getWorkflowItemTemplatesAPI(workItemTypeKey);
      return response?.templates?.map(template => ({
        id: Number(template.template_id),
        name: template.template_name
      })) || [];
    } catch (error) {
      console.error('获取工作项模板失败:', error);
      Toast.error('获取工作项模板失败');
      return [];
    }
  };

  // 获取工作项节点列表
  const fetchWorkItemNodes = async (workItemTypeKey: string, templateId: string) => {
    if (!workItemTypeKey || !templateId) {
      return [];
    }

    try {
      const response = await getWorkflowItemNodesAPI(workItemTypeKey, templateId);
      return response?.nodes?.map(node => ({
        id: node.state_key,
        name: node.name
      })) || [];
    } catch (error) {
      console.error('获取工作项节点失败:', error);
      Toast.error('获取工作项节点失败');
      return [];
    }
  };

  // 获取工作流列表
  const fetchWorkflows = async (projectKey: string) => {
    const authConfig = await getAuthConfig();
    if (!authConfig || !projectKey) {
      return [];
    }

    try {
      const response = await getCustomWorkflowListAPI(projectKey);
      const workflows = response?.workflow_list || [];
      return workflows;
    } catch (error) {
      console.error('获取工作流列表失败:', error);
      return [];
    }
  };

  // 构建级联数据（初始只加载模板）
  const buildInitialCascaderData = (templates: WorkItemTemplate[]): Array<{
    label: string;
    value: string;
    children?: Array<{
      label: string;
      value: string;
    }>;
    isLeaf?: boolean;
  }> => {
    if (!templates.length) {
      return [];
    }

    // 初始只加载模板数据，不预先加载节点数据
    return templates.map(template => ({
      label: template.name,
      value: String(template.id),
      // 不设置children，让Cascader知道这个节点可能有子节点需要异步加载
    }));
  };

  // 更新级联树数据
  const updateTreeData = (list: any[], value: string, children: any[]): any[] => {
    return list.map(node => {
      if (node.value === value) {
        return { ...node, children };
      }
      if (node.children) {
        return { ...node, children: updateTreeData(node.children, value, children) };
      }
      return node;
    });
  };

  // 异步加载节点数据
  const handleLoadData = async (selectedOpt: any[], formId: string, nodeIndex: number) => {
    const targetOpt = selectedOpt[selectedOpt.length - 1];
    const { value: templateId } = targetOpt;
    
    // 如果已经有子节点，不重复加载
    if (targetOpt.children) {
      return Promise.resolve();
    }

    const formIndex = configForms.findIndex(form => form.id === formId);
    if (formIndex === -1) {
      return Promise.resolve();
    }

    const currentForm = configForms[formIndex];
    if (!currentForm.config.work_item_type_key) {
      return Promise.resolve();
    }

    try {
      // 异步加载该模板的节点数据
      const nodes = await fetchWorkItemNodes(currentForm.config.work_item_type_key, templateId);
      
      const updatedForms = [...configForms];
      
      if (nodes.length === 0) {
        // 没有子节点，标记为叶子节点
        const updatedCascaderData = updatedForms[formIndex].nodes[nodeIndex].cascaderData.map(item => 
          item.value === templateId ? { ...item, isLeaf: true } : item
        );
        
        updatedForms[formIndex].nodes[nodeIndex].cascaderData = updatedCascaderData;
      } else {
        // 有子节点，添加子节点数据
        const children = nodes.map(node => ({
          label: node.name,
          value: node.id,
          isLeaf: true // 节点层级是最后一级，设为叶子节点
        }));
        
        const updatedCascaderData = updateTreeData(
          updatedForms[formIndex].nodes[nodeIndex].cascaderData,
          templateId,
          children
        );
        
        updatedForms[formIndex].nodes[nodeIndex].cascaderData = updatedCascaderData;
      }
      
      setConfigForms(updatedForms);
      return Promise.resolve();
    } catch (error) {
      console.error('加载节点数据失败:', error);
      return Promise.resolve();
    }
  };

  // 添加新的配置表单
  const handleAddNewForm = () => {
    const newFormId = Date.now().toString();
    const workspaceId = '';
    
    setConfigForms([...configForms, {
      id: newFormId,
      formApi: null,
      isNew: true,
      config: {
        work_item_type_key: '',
        nodes: [],
        workspace_id: workspaceId
      },
      nodes: [{
        id: `new_form_${Date.now()}_${Math.random()}`,
        selectedNode: '',
        selectedProject: '',
        selectedTemplate: '',
        selectedCascaderValue: [],
        nodeOptions: [],
        templateOptions: [],
        workflows: [],
        cascaderData: []
      }],
      workItemNodes: [],
      workItemTemplates: []
    }]);
  };

  // 删除表单
  const handleRemoveForm = (formId: string) => {
    setConfigForms(configForms.filter(form => form.id !== formId));
  };

  // 工作项类型选择变化
  const handleWorkItemTypeChange = async (workItemTypeKey: string, formId: string) => {
    const formIndex = configForms.findIndex(form => form.id === formId);
    if (formIndex === -1) return;

    const updatedForms = [...configForms];
    const currentForm = updatedForms[formIndex];
    
    // 如果是编辑模式且工作项类型发生变化，清除所有节点配置
    const isChangingExistingType = !currentForm.isNew && currentForm.config.work_item_type_key !== workItemTypeKey;
    
    updatedForms[formIndex].config.work_item_type_key = workItemTypeKey;

    if (isChangingExistingType) {
      // 编辑模式下修改工作项类型：清除所有节点，只保留一个空节点
      updatedForms[formIndex].nodes = [{
        id: `cleared_${formId}_${Date.now()}_${Math.random()}`,
        selectedNode: '',
        selectedProject: '',
        selectedTemplate: '',
        selectedCascaderValue: [],
        nodeOptions: [],
        templateOptions: [],
        workflows: [],
        cascaderData: []
      }];
      
      // 清除表单中的节点相关字段
      if (currentForm.formApi) {
        const currentValues = currentForm.formApi.getValues();
        const clearedValues = { workItemType: workItemTypeKey };
        
        // 清除所有节点相关的字段
        Object.keys(currentValues).forEach(key => {
          if (key.startsWith('nodeId_') || key.startsWith('projectKey_') || key.startsWith('workflowName_') || key.startsWith('templateId_') || key.startsWith('templateNode_')) {
            // 这些字段会被清除
          } else {
            clearedValues[key] = currentValues[key];
          }
        });
        
        currentForm.formApi.setValues(clearedValues);
      }
    } else {
      // 新增模式或相同类型：重置所有节点但保持数量
      updatedForms[formIndex].nodes = updatedForms[formIndex].nodes.map(node => ({
        ...node,
        selectedNode: '',
        selectedProject: '',
        selectedTemplate: '',
        selectedCascaderValue: [],
        nodeOptions: [],
        templateOptions: [],
        workflows: [],
        cascaderData: []
      }));
      
      // 清除表单中的节点相关字段
      if (currentForm.formApi) {
        const currentValues = currentForm.formApi.getValues();
        const clearedValues = { workItemType: workItemTypeKey };
        
        // 清除所有节点相关的字段
        Object.keys(currentValues).forEach(key => {
          if (key.startsWith('nodeId_') || key.startsWith('projectKey_') || key.startsWith('workflowName_') || key.startsWith('templateId_') || key.startsWith('templateNode_')) {
            // 这些字段会被清除
          } else {
            clearedValues[key] = currentValues[key];
          }
        });
        
        currentForm.formApi.setValues(clearedValues);
      }
    }

    if (workItemTypeKey) {
      // 加载模板列表
      const templates = await fetchWorkItemTemplates(workItemTypeKey);
      updatedForms[formIndex].workItemTemplates = templates;
      
      // 构建初始级联数据（只加载模板）
      const cascaderData = buildInitialCascaderData(templates);
      
      // 更新所有节点的模板选项和级联数据
      updatedForms[formIndex].nodes = updatedForms[formIndex].nodes.map(node => ({
        ...node,
        templateOptions: templates,
        nodeOptions: [], // 清空节点选项，等待异步加载
        cascaderData: cascaderData // 设置级联数据
      }));
    } else {
      updatedForms[formIndex].workItemTemplates = [];
      updatedForms[formIndex].workItemNodes = [];
    }

    setConfigForms(updatedForms);
  };

  // 级联选择器变化处理
  const handleCascaderChange = (value: string[], formId: string, nodeIndex: number) => {
    const formIndex = configForms.findIndex(form => form.id === formId);
    if (formIndex === -1) return;

    const updatedForms = [...configForms];
    if (updatedForms[formIndex].nodes[nodeIndex]) {
      let templateId = '';
      let nodeId = '';
      
      if (value.length === 1) {
        // 选择了叶子节点（没有子节点的模板）
        templateId = value[0];
        nodeId = value[0]; // 对于没有子节点的模板，将模板ID作为节点ID使用
      } else if (value.length === 2) {
        // 选择了模板和具体节点
        templateId = value[0];
        nodeId = value[1];
      }
      
      updatedForms[formIndex].nodes[nodeIndex].selectedCascaderValue = value;
      updatedForms[formIndex].nodes[nodeIndex].selectedTemplate = templateId;
      updatedForms[formIndex].nodes[nodeIndex].selectedNode = nodeId;
      updatedForms[formIndex].nodes[nodeIndex].selectedProject = '';
      updatedForms[formIndex].nodes[nodeIndex].workflows = [];
      
      // 清空表单中的项目和工作流字段
      const currentForm = updatedForms[formIndex];
      if (currentForm.formApi) {
        const currentValues = currentForm.formApi.getValues();
        currentForm.formApi.setValues({
          ...currentValues,
          [`projectKey_${nodeIndex}`]: '',
          [`workflowName_${nodeIndex}`]: ''
        });
      }
    }

    setConfigForms(updatedForms);
  };

  // 项目选择变化
  const handleProjectChange = async (projectKey: string, formId: string, nodeIndex: number) => {
    const formIndex = configForms.findIndex(form => form.id === formId);
    if (formIndex === -1) return;

    const updatedForms = [...configForms];
    if (updatedForms[formIndex].nodes[nodeIndex]) {
      updatedForms[formIndex].nodes[nodeIndex].selectedProject = projectKey;

      if (projectKey) {
        const workflows = await fetchWorkflows(projectKey);
        updatedForms[formIndex].nodes[nodeIndex].workflows = workflows;
      } else {
        updatedForms[formIndex].nodes[nodeIndex].workflows = [];
      }
    }

    setConfigForms(updatedForms);
  };

  // 删除节点
  const handleRemoveNode = (formId: string, nodeIndex: number) => {
    const formIndex = configForms.findIndex(form => form.id === formId);
    if (formIndex === -1) return;

    const updatedForms = [...configForms];
    if (updatedForms[formIndex].nodes.length > 1) {
      updatedForms[formIndex].nodes.splice(nodeIndex, 1);
      setConfigForms(updatedForms);
    }
  };

  // 添加节点
  const handleAddNode = async (formId: string) => {
    const formIndex = configForms.findIndex(form => form.id === formId);
    if (formIndex === -1) return;

    const formData = configForms[formIndex];
    
    // 验证当前所有节点是否已完整配置
    if (formData.formApi) {
      try {
        const values = await formData.formApi.validate();
        
        // 检查每个现有节点的配置
            for (let i = 0; i < formData.nodes.length; i++) {
              const templateNodeValue = values[`templateNode_${i}`];
              const projectKey = values[`projectKey_${i}`];
              const workflowName = values[`workflowName_${i}`];
              
              if (!templateNodeValue || templateNodeValue.length === 0) {
                Toast.error(`请先选择第 ${i + 1} 个节点的流程/节点`);
                return;
              }
              if (!projectKey) {
                Toast.error(`请先选择第 ${i + 1} 个节点的项目`);
                return;
              }
              if (!workflowName) {
                Toast.error(`请先选择第 ${i + 1} 个节点的工作流`);
                return;
              }
            }
      } catch (error) {
        Toast.error('请先完成当前节点的配置');
        return;
      }
    }

    const updatedForms = [...configForms];
    const newNode = {
      id: `add_${formId}_${Date.now()}_${Math.random()}`,
      selectedNode: '',
      selectedProject: '',
      selectedTemplate: '',
      selectedCascaderValue: [],
      nodeOptions: [],
      templateOptions: updatedForms[formIndex].workItemTemplates,
      workflows: [],
      // 复用第一个节点的级联数据，但重新创建一份副本以避免引用问题
      cascaderData: updatedForms[formIndex].nodes[0]?.cascaderData ? 
        buildInitialCascaderData(updatedForms[formIndex].workItemTemplates) : []
    };

    updatedForms[formIndex].nodes.push(newNode);
    setConfigForms(updatedForms);
  };

  // 保存所有配置
  const handleSaveAllConfigs = async () => {
    try {
      setSaving(true);
      
      const context = await window.JSSDK.Context.load();
      const workspaceId = (context as any)?.mainSpace?.id || '';
      
      // 验证并收集所有配置
      const allConfigs: WorkflowConfigItem[] = [];
      
      for (const formData of configForms) {
        if (formData.formApi) {
          try {
            const values = await formData.formApi.validate();
            
            // 验证所有节点都已配置
            const configuredNodes: {
              node_id: string;
              node_name: string;
              project_key: string;
              template_id: number;
              template_name: string;
              workflow_name: string;
            }[] = [];

            for (let i = 0; i < formData.nodes.length; i++) {
              const templateNodeValue = values[`templateNode_${i}`];
              const projectKey = values[`projectKey_${i}`];
              const workflowName = values[`workflowName_${i}`];

              if (!templateNodeValue || templateNodeValue.length === 0 || !projectKey || !workflowName) {
                Toast.error(`请完整配置第${i + 1}个节点`);
                return;
              }

              let templateId = '';
              let nodeId = '';
              
              if (templateNodeValue.length === 1) {
                // 叶子节点（没有子节点的模板）
                templateId = templateNodeValue[0];
                nodeId = templateNodeValue[0]; // 使用模板ID作为节点ID
              } else if (templateNodeValue.length === 2) {
                // 模板+节点
                templateId = templateNodeValue[0];
                nodeId = templateNodeValue[1];
              }
              
              const selectedTemplate = formData.workItemTemplates.find(template => template.id.toString() === templateId);
              
              // 查找节点信息
              let selectedNode: { label: string; value: string } | undefined = undefined;
              let nodeName = '';
              
              if (selectedTemplate) {
                if (templateNodeValue.length === 1) {
                  // 对于叶子节点，使用模板名作为节点名
                  selectedNode = { label: selectedTemplate.name, value: templateId };
                  nodeName = selectedTemplate.name;
                } else {
                  // 从级联数据中查找节点信息
                  const templateCascaderData = formData.nodes[i].cascaderData.find(item => item.value === templateId);
                  if (templateCascaderData && templateCascaderData.children) {
                    selectedNode = templateCascaderData.children.find(child => child.value === nodeId);
                    nodeName = selectedNode?.label || '';
                  }
                }
              }
              
              if (!selectedNode) {
                Toast.error(`第${i + 1}个节点选择无效`);
                return;
              }
              
              if (!selectedTemplate) {
                Toast.error(`第${i + 1}个节点的模板选择无效`);
                return;
              }

              configuredNodes.push({
                node_id: nodeId,
                node_name: nodeName,
                project_key: projectKey,
                template_id: Number(templateId),
                template_name: selectedTemplate.name,
                workflow_name: workflowName
              });
            }

            const config: WorkflowConfigItem = {
              work_item_type_key: values.workItemType,
              nodes: configuredNodes,
              workspace_id: workspaceId
            };
            
            allConfigs.push(config);
          } catch (error) {
            console.error('表单验证失败:', error);
            Toast.error('请完成所有配置');
            return;
          }
        }
      }

      const payload: WorkflowConfigRequest = {
        configs: allConfigs,
        workspace_id: workspaceId
      };

      await updateWorkflowConfigListAPI(payload);
      Toast.success('保存成功');
      
      // 重新加载配置（这将自动将所有表单标记为非新增状态）
      // 保存时不需要显示 loading，因为已经有 saving 状态了
      await loadConfigs();
    } catch (error) {
      console.error('保存失败:', error);
      Toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

    // 渲染配置表单
    const renderConfigForm = (formData: ConfigForm) => {
      return (
      <Card
        key={formData.id}
        style={{ marginBottom: 16 }}
        bodyStyle={{ padding: 16 }}
        headerExtraContent={
          <Button
            type="danger"
            theme="borderless"
            size="default"
            icon={<IconDelete />}
            onClick={() => handleRemoveForm(formData.id)}
          >
            删除
          </Button>
        }
      >
        <Form
          labelPosition="top"
          labelWidth={90}
          getFormApi={(api) => {
            const updatedForms = [...configForms];
            const formIndex = updatedForms.findIndex(form => form.id === formData.id);
            if (formIndex !== -1) {
              updatedForms[formIndex].formApi = api;
              setConfigForms(updatedForms);
            }
          }}
          initValues={{
            workItemType: formData.config.work_item_type_key,
            ...formData.nodes.reduce((acc, node, index) => {
              const configNode = formData.config.nodes[index];
              return {
                ...acc,
                [`templateNode_${index}`]: node.selectedCascaderValue.length > 0 ? node.selectedCascaderValue : 
                  (configNode?.template_id && configNode?.node_id ? [configNode.template_id.toString(), configNode.node_id] : []),
                [`projectKey_${index}`]: node.selectedProject || configNode?.project_key,
                [`workflowName_${index}`]: configNode?.workflow_name
              };
            }, {})
          }}
        >
          {/* 工作项类型选择 */}
          <Row gutter={16} style={{ marginBottom: 16, alignItems: 'center' }}>
            <Col span={6}>
              <Form.Select
                field="workItemType"
                label="工作项"
                placeholder="选择类型"
                rules={[{ required: true, message: '请选择工作项类型' }]}
                onChange={(value) => handleWorkItemTypeChange(String(value), formData.id)}
                style={{ width: '100%' }}
                filter
              >
                {workItemTypes.map(type => (
                  <Select.Option key={type.type_key} value={type.type_key}>
                    {type.name}
                  </Select.Option>
                ))}
              </Form.Select>
            </Col>
          </Row>

          {/* 节点配置区域 */}
          <div style={{ marginBottom: 16 }}>
            {formData.nodes.map((nodeData, nodeIndex) => (
              <div 
                key={nodeData.id} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '16px', 
                  marginBottom: '8px' 
                }}
              >
                <div style={{ flex: '1', minWidth: '0' }}>
                  <Form.Cascader
                    label="流程/节点"
                    field={`templateNode_${nodeIndex}`}
                    placeholder="选择流程/节点"
                    rules={[{ required: true, message: '请选择流程/节点' }]}
                    disabled={!formData.config.work_item_type_key}
                    onChange={(value) => handleCascaderChange(value as string[], formData.id, nodeIndex)}
                    loadData={(selectedOpt) => handleLoadData(selectedOpt, formData.id, nodeIndex)}
                    style={{ width: '100%' }}
                    treeData={nodeData.cascaderData}
                    filterTreeNode
                  />
                </div>
                <div style={{ flex: '1', minWidth: '0' }}>
                  <Form.Select
                    label="项目"
                    field={`projectKey_${nodeIndex}`}
                    placeholder="选择项目"
                    rules={[{ required: true, message: '请选择项目' }]}
                    onChange={(value) => handleProjectChange(String(value), formData.id, nodeIndex)}
                    style={{ width: '100%' }}
                    filter
                  >
                    {projects.map(project => (
                      <Select.Option key={project.name} value={project.name}>
                        {project?.alias || project.name}
                      </Select.Option>
                    ))}
                  </Form.Select>
                </div>
                <div style={{ flex: '1', minWidth: '0' }}>
                  <Form.Select
                    label="工作流"
                    field={`workflowName_${nodeIndex}`}
                    placeholder="选择工作流"
                    rules={[{ required: true, message: '请选择工作流' }]}
                    style={{ width: '100%' }}
                    filter
                  >
                    {nodeData.workflows.map(workflow => (
                      <Select.Option key={workflow.name} value={workflow.name}>
                        {workflow.display_name || workflow.name}
                      </Select.Option>
                    ))}
                  </Form.Select>
                </div>
                <div style={{ 
                  flexShrink: '0',
                  marginTop: '20px'
                }}>
                  {formData.nodes.length > 1 && (
                    <Button
                      type="danger"
                      theme="borderless"
                      size="default"
                      icon={<IconDelete />}
                      onClick={() => handleRemoveNode(formData.id, nodeIndex)}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 添加节点按钮 - 一直显示 */}
          <div style={{ marginTop: 16 }}>
            <Button
              type="primary"
              onClick={() => handleAddNode(formData.id)}
              disabled={!formData.config.work_item_type_key}
            >
              添加
            </Button>
          </div>
        </Form>
      </Card>
    );
  };

  return (
    <div>
      <Card
        title="工作流配置"
        headerStyle={{ borderBottom: '1px solid var(--semi-color-border)' }}
        headerExtraContent={
          <Button
            type="primary"
            icon={<IconPlus />}
            onClick={handleAddNewForm}
            disabled={loading}
          >
            添加
          </Button>
        }
      >
        <Spin spinning={loading} tip="加载配置中...">
          <div>
            {/* 渲染所有配置表单 */}
            {configForms.length === 0 && !loading ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--semi-color-text-2)' }}>
                暂无配置，请点击“添加”按钮创建新配置
              </div>
            ) : (
              configForms.map(formData => renderConfigForm(formData))
            )}
          </div>
        </Spin>
      </Card>

      {/* 底部保存按钮 */}
      <div style={{ marginTop: 24, textAlign: 'left' }}>
        <Button
          type="primary"
          theme="solid"
          size="default"
          onClick={handleSaveAllConfigs}
          loading={saving}
          disabled={loading || configForms.length === 0}
        >
          保存
        </Button>
      </div>
    </div>
  );
};

export default WorkflowConfig;