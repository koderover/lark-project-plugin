import { useState, forwardRef, useImperativeHandle, useCallback, useEffect, useMemo } from 'react';
import { Table, Select, Checkbox, Radio, Button, Modal, Input, Switch, Tooltip, TextArea, Typography } from '@douyinfe/semi-ui';
import { IconChevronUp, IconChevronDown, IconArrowUp, IconArrowDown, IconInfoCircle } from '@douyinfe/semi-icons';
import { 
  imagesAPI, 
  previewChangedYamlAPI, 
  getCalculatedValuesYamlAPI, 
  getProductionCalculatedValuesYamlAPI, 
  mergeImageIntoHelmYamlAPI 
} from '../../../../api/service';
import CodeDiff from '../CodeDiff';

interface ServiceInfo {
  service_name: string;
  modules?: ModuleInfo[];
  deployed?: boolean;
  updatable?: boolean;
  auto_sync?: boolean;
  service_variable?: VariableConfig;
  env_variable?: VariableConfig;
  variable_kvs?: VariableKV[];
  variable_yaml?: string;
  override_kvs?: string;
  update_config?: boolean;
  value_merge_strategy?: string;
  isExpand?: boolean;
  [key: string]: any;
}

interface ModuleInfo {
  service_module: string;
  service_name: string;
  image?: string;
  image_name?: string;
  images?: any[];
  loading?: boolean;
  fetched?: boolean;
  filterImages?: any[];
  [key: string]: any;
}

interface VariableConfig {
  variable_kvs?: VariableKV[];
  variable_yaml?: string;
  override_kvs?: string;
}

interface VariableKV {
  key: string;
  value: string | boolean;
  type?: string;
  source?: string;
  description?: string;
  desc?: string;
  is_credential?: boolean;
  choice_option?: string[];
  choice_value?: string[];
  options?: string[];
  use_global_variable?: boolean;
  [key: string]: any;
}

interface Job {
  name: string;
  type: string;
  spec: {
    deploy_contents?: string[];
    source?: string;
    env?: string;
    production?: boolean;
    env_options?: any[];
    services?: ServiceInfo[];
    service_variable_config?: any[];
    merge_strategy_source?: string;
    value_merge_strategy?: string;
    [key: string]: any;
  };
  pickedTargets?: ServiceInfo[];
  pickedModules?: any[];
  [key: string]: any;
}

interface CustomWorkflowDeployConfigProps {
  job: Job;
  projectName: string;
  registryId: string;
  viewMode?: boolean;
  hideChange?: boolean;
  hideVarPreview?: boolean;
  triggerMode?: boolean;
  releasePlanMode?: boolean;
  editRunner?: boolean;
  stageExecMode?: boolean;
}

const CustomWorkflowDeployConfig = forwardRef<any, CustomWorkflowDeployConfigProps>((
  {
    job,
    projectName,
    registryId,
    viewMode = false,
    hideChange = false,
    hideVarPreview = false,
    triggerMode = false,
    releasePlanMode = false,
    editRunner = false,
    stageExecMode = false,
  },
  ref
) => {
  const [fileDiffDialogVisible, setFileDiffDialogVisible] = useState(false);
  const [fileDiffDialogTitle, setFileDiffDialogTitle] = useState('服务渲染后的 YAML 结果和当前环境中的服务 YAML 比对');
  const [yamlDiff, setYamlDiff] = useState({
    oldString: '',
    newString: ''
  });
  const [reviewServiceName, setReviewServiceName] = useState('');
  
  // 本地状态管理 pickedTargets，确保组件能正确重新渲染
  const [localPickedTargets, setLocalPickedTargets] = useState<ServiceInfo[]>(job.pickedTargets || []);
  
  // 强制重新渲染的计数器
  const [forceRenderKey, setForceRenderKey] = useState(0);
  
  // 镜像加载缓存，避免重复请求
  const [imageLoadingCache, setImageLoadingCache] = useState<Set<string>>(new Set());
  const [imageLoadedCache, setImageLoadedCache] = useState<Set<string>>(new Set());
  
  // 同步外部 job.pickedTargets 和本地状态
  useEffect(() => {
    if (job.pickedTargets) {
      setLocalPickedTargets([...job.pickedTargets]);
    }
  }, [job.pickedTargets]);

  // 清理缓存，当项目或环境发生变化时
  useEffect(() => {
    setImageLoadingCache(new Set());
    setImageLoadedCache(new Set());
  }, [projectName, registryId, job.spec.env]);
  
  // 更新本地状态并同步到外部 job 对象
  const updatePickedTargets = useCallback((updatedTargets: ServiceInfo[]) => {
    setLocalPickedTargets([...updatedTargets]);
    job.pickedTargets = updatedTargets;
  }, [job]);
  
  const { Text } = Typography;
  
  // 计算部署类型（从store或项目信息获取）
  const deployType = 'k8s' as 'helm' | 'k8s'; // 写死为k8s类型
  const production = job.spec.production;
  const envName = job.spec.env;

  // 展开/收起函数
  const expand = useCallback((item: ServiceInfo, isExpand: boolean) => {
    if (item) {
      const updatedTargets = localPickedTargets.map(target => 
        target.service_name === item.service_name 
          ? { ...target, isExpand }
          : target
      );
      updatePickedTargets(updatedTargets);
    }
  }, [localPickedTargets, updatePickedTargets]);

  // 获取镜像列表
  const getImages = useCallback((name: string, id: string) => {
    return imagesAPI(projectName, [name], id);
  }, [projectName]);


  // 过滤镜像
  const filterMethod = useCallback((value: string, targetModule: ModuleInfo) => {
    // 深拷贝更新，确保 React 能检测到变化
    const updatedTargets = localPickedTargets.map(target => ({
      ...target,
      modules: target.modules?.map(module => {
        if (module.service_module === targetModule.service_module) {
          const newModule = { ...module };
          if (value !== '') {
            newModule.image = value;
            newModule.filterImages = value 
              ? (module.images || []).filter((image: any) => image.tag.indexOf(value) > -1)
              : module.images || [];
          } else {
            // 重新初始化镜像数据
            if (!newModule.image) {
              newModule.filterImages = newModule.images || [];
            } else {
              const images = newModule.images || [];
              newModule.filterImages = JSON.parse(JSON.stringify(images));
              let matchedImage: any = {};
              const filterImages = newModule.filterImages || [];
              for (let i = 0; i < filterImages.length; i++) {
                const element = filterImages[i];
                const tag = element.owner 
                  ? `${element.host}/${element.owner}/${element.name}:${element.tag}`
                  : `${element.host}/${element.name}:${element.tag}`;
                if (tag === newModule.image) {
                  matchedImage = element;
                  filterImages.splice(i, 1);
                  break;
                }
              }
              if (matchedImage.tag && newModule.filterImages) {
                newModule.filterImages.unshift(matchedImage);
              }
            }
          }
          return newModule;
        }
        return module;
      })
    }));
    updatePickedTargets(updatedTargets);
  }, [localPickedTargets, updatePickedTargets]);

  // 检查请求状态
  const checkRequestStatus = useCallback(() => {
    return true;
  }, []);

  // 获取变量
  const getVariables = useCallback((pickedTargets: ServiceInfo[]) => {
    const envName = job.spec.env;
    const envOptions = job.spec.env_options;
    if (!envOptions || !pickedTargets) return;

    const currentEnvOptions = envOptions.find((item: any) => item.env === envName)?.services;
    if (!currentEnvOptions) return;

    pickedTargets.forEach((service) => {
      const serviceName = service.service_name;
      const serviceInEnv = currentEnvOptions.find((item: any) => item.service_name === serviceName);
      
      if (serviceInEnv) {
        const serviceIsDeployed = serviceInEnv.deployed;
        const envModules = serviceInEnv.modules;
        const serviceModules = service.modules;

        if (editRunner || stageExecMode) {
          // 编辑模式的逻辑
          service.auto_sync = serviceInEnv.auto_sync;
          service.deployed = serviceInEnv.deployed;
          service.updatable = serviceInEnv.updatable;
          service.override_kvs = service.override_kvs;
          service.modules = service.modules;
          service.variable_yaml = service.variable_yaml;

          // 编辑模式时，value_merge_strategy 从服务层取，如果读不到说明是 fromjob 模式
          if (service.value_merge_strategy) {
            service.value_merge_strategy = service.value_merge_strategy;
          } else {
            const sameNameService = job.spec.services?.find((item: any) => item.service_name === service.service_name);
            if (sameNameService) {
              service.value_merge_strategy = sameNameService.value_merge_strategy;
            }
          }

          // 变量处理
          const variableKvs = service.update_config
            ? (serviceInEnv.service_variable ? serviceInEnv.service_variable.variable_kvs : [])
            : (serviceInEnv.env_variable ? serviceInEnv.env_variable.variable_kvs : []);

          // 添加变量来源信息
          const variableKvsWithOrigin = variableKvs.map((variable: any) => {
            const serviceConfig = job.spec.service_variable_config?.find((config: any) => config.service_name === service.service_name);
            if (serviceConfig) {
              if (serviceConfig.variable_configs) {
                const matchedConfig = serviceConfig.variable_configs.find((config: any) => config.variable_key === variable.key);
                if (matchedConfig) {
                  return { ...variable, source: matchedConfig.source };
                }
              } else {
                return { ...variable, source: 'runtime' };
              }
            }
            return variable;
          });

          service.variable_kvs = variableKvsWithOrigin;
          mergeImageIntoHelmYamlInit(service);
        } else {
          // 运行模式的逻辑
          const variableKvs = serviceIsDeployed
            ? (serviceInEnv.env_variable ? serviceInEnv.env_variable.variable_kvs : [])
            : (serviceInEnv.service_variable ? serviceInEnv.service_variable.variable_kvs : []);

          const overrideKvs = serviceIsDeployed
            ? (serviceInEnv.env_variable ? serviceInEnv.env_variable.override_kvs : '')
            : (serviceInEnv.service_variable ? serviceInEnv.service_variable.override_kvs : '');

          const variableYaml = serviceIsDeployed
            ? (serviceInEnv.env_variable ? serviceInEnv.env_variable.variable_yaml : '')
            : (serviceInEnv.service_variable ? serviceInEnv.service_variable.variable_yaml : '');

          const latestVariableKvs = serviceInEnv.service_variable ? serviceInEnv.service_variable.variable_kvs : [];
          const latestVariableYaml = serviceInEnv.service_variable ? serviceInEnv.service_variable.variable_yaml : '';
          const latestOverrideKvs = serviceInEnv.env_variable ? serviceInEnv.env_variable.override_kvs : '';

          const updateConfig = service.update_config;
          const sourceVars = updateConfig ? latestVariableKvs : variableKvs;
          
          // 添加变量来源信息
          const sourceVarsWithOrigin = sourceVars.map((variable: any) => {
            const serviceConfig = job.spec.service_variable_config?.find((config: any) => config.service_name === service.service_name);
            if (serviceConfig) {
              if (serviceConfig.variable_configs) {
                const matchedConfig = serviceConfig.variable_configs.find((config: any) => config.variable_key === variable.key);
                if (matchedConfig) {
                  return { ...variable, source: matchedConfig.source };
                }
              } else {
                return { ...variable, source: 'runtime' };
              }
            }
            return variable;
          });

          const sourceYaml = updateConfig ? latestVariableYaml : variableYaml;
          const sourceOverrideKvs = updateConfig ? latestOverrideKvs : overrideKvs;

          // 匹配模块
          const filteredModules = envModules?.filter((envModule: any) => {
            return serviceModules?.some((serviceModule: any) => serviceModule.service_module === envModule.service_module);
          });

          service.auto_sync = serviceInEnv.auto_sync;
          service.deployed = serviceInEnv.deployed;
          service.updatable = serviceInEnv.updatable;
          service.modules = filteredModules;
          service.variable_kvs = sourceVarsWithOrigin;

          // 运行模式时，value_merge_strategy 从 job.spec.value_merge_strategy 取值
          service.value_merge_strategy = job.spec.value_merge_strategy;

          if (job.spec.deploy_contents?.includes('image') || job.spec.deploy_contents?.includes('vars')) {
            if (service.value_merge_strategy === 'reuse-values') {
              service.variable_yaml = '';
            } else if (service.value_merge_strategy === 'override') {
              service.variable_yaml = sourceYaml;
            }
          }

          service.override_kvs = sourceOverrideKvs;
          mergeImageIntoHelmYamlInit(service);
          
          if (variableKvs.length > 0) {
            service.isExpand = true;
          } else {
            service.isExpand = service.isExpand;
          }
        }
      }
    });
  }, [job, editRunner, stageExecMode]);

  // 合并策略变更
  const mergeStrategyChange = useCallback((item: ServiceInfo) => {
    const envName = job.spec.env;
    const envOptions = job.spec.env_options;
    if (!envOptions) return;

    const currentEnvOptions = envOptions.find((envItem: any) => envItem.env === envName)?.services;
    if (!currentEnvOptions) return;

    const serviceInEnv = currentEnvOptions.find((envItem: any) => envItem.service_name === item.service_name);
    if (!serviceInEnv) return;

    const serviceIsDeployed = serviceInEnv.deployed;
    const updateConfig = item.update_config;
    const variableYaml = serviceIsDeployed
      ? (serviceInEnv.env_variable ? serviceInEnv.env_variable.variable_yaml : '')
      : (serviceInEnv.service_variable ? serviceInEnv.service_variable.variable_yaml : '');
    const latestVariableYaml = serviceInEnv.service_variable ? serviceInEnv.service_variable.variable_yaml : '';
    const sourceYaml = updateConfig ? latestVariableYaml : variableYaml;
    
    if (job.spec.deploy_contents?.includes('image') || job.spec.deploy_contents?.includes('vars')) {
      const updatedTargets = localPickedTargets.map(target => {
        if (target.service_name === item.service_name) {
          const updatedTarget = { ...target };
          if (item.value_merge_strategy === 'reuse-values') {
            updatedTarget.variable_yaml = '';
          } else if (item.value_merge_strategy === 'override') {
            updatedTarget.variable_yaml = sourceYaml;
          }
          return updatedTarget;
        }
        return target;
      });
      updatePickedTargets(updatedTargets);
      
      if (job.spec.source === 'runtime') {
        mergeImageIntoHelmYamlInit(item);
      }
    }
  }, [job, localPickedTargets, updatePickedTargets]);

  // 初始化合并镜像到Helm YAML
  const mergeImageIntoHelmYamlInit = useCallback(async (service: ServiceInfo) => {
    if (deployType === 'helm' && job.spec.deploy_contents?.includes('image')) {
      const payload = {
        env_name: job.spec.env,
        production: job.spec.production,
        service_modules: service.modules?.map((item) => ({
          name: item.image_name,
          image: item.image
        })) || [],
        service_name: service.service_name,
        update_service_revision: service.update_config,
        values_yaml: service.variable_yaml
      };
      
      try {
        const res = await mergeImageIntoHelmYamlAPI(projectName, payload);
        if (res) {
          const updatedTargets = localPickedTargets.map(target => 
            target.service_name === service.service_name 
              ? { ...target, variable_yaml: res.values }
              : target
          );
          updatePickedTargets(updatedTargets);
        }
      } catch (error) {
        console.error('合并镜像到Helm YAML失败:', error);
      }
    }
  }, [deployType, job, projectName, localPickedTargets, updatePickedTargets]);

  // 合并镜像到Helm YAML
  const mergeImageIntoHelmYaml = useCallback(async (service: ServiceInfo, image: string) => {
    if (deployType === 'helm' && job.spec.deploy_contents?.includes('vars')) {
      const payload = {
        env_name: job.spec.env,
        production: job.spec.production,
        service_modules: service.modules?.map((item) => ({
          name: item.image_name,
          image: image
        })) || [],
        service_name: service.service_name,
        update_service_revision: service.update_config,
        values_yaml: service.variable_yaml
      };
      
      try {
        const res = await mergeImageIntoHelmYamlAPI(projectName, payload);
        if (res) {
          const updatedTargets = localPickedTargets.map(target => 
            target.service_name === service.service_name 
              ? { ...target, variable_yaml: res.values }
              : target
          );
          updatePickedTargets(updatedTargets);
        }
      } catch (error) {
        console.error('合并镜像到Helm YAML失败:', error);
      }
    }
  }, [deployType, job, projectName, localPickedTargets, updatePickedTargets]);

  // 处理输入事件（用于手动输入的情况）
  const handleImageInput = useCallback((item: ServiceInfo, value: string) => {
    if (value && value !== item.image) {
      setTimeout(() => {
        mergeImageIntoHelmYaml(item, value);
      }, 0);
    }
  }, [mergeImageIntoHelmYaml]);

  // 批量处理镜像加载的优化函数
  const batchLoadImages = useCallback(async (val: ServiceInfo[]) => {
    if (job.spec.source !== 'runtime') return;
    
    const imageRequests = new Map<string, Promise<any>>();
    const modulesToUpdate = new Map<string, Array<{service: ServiceInfo, module: ModuleInfo, moduleKey: string}>>();
    
    // 收集所有需要加载镜像的模块
    val.forEach((service) => {
      
      service.modules?.forEach((module) => {
        const moduleKey = `${service.service_name}-${module.service_module}-${module.image_name}`;
        
        if (module.image_name && module.fetched !== true && !imageLoadingCache.has(moduleKey) && !imageLoadedCache.has(moduleKey)) {
          
          // 标记为正在加载
          setImageLoadingCache(prev => new Set([...prev, moduleKey]));
          
          // 如果还没有这个镜像的请求，创建一个
          if (!imageRequests.has(module.image_name)) {
            imageRequests.set(module.image_name, getImages(module.image_name, registryId));
          }
          
          // 记录需要更新的模块
          if (!modulesToUpdate.has(module.image_name)) {
            modulesToUpdate.set(module.image_name, []);
          }
          modulesToUpdate.get(module.image_name)!.push({
            service,
            module,
            moduleKey
          });
        }
      });
    });
    
    if (imageRequests.size === 0) {
      return;
    }
    
    
    // 批量处理所有镜像请求  
    const imagePromises = Array.from(imageRequests.entries()).map(async ([imageName, promise]) => {
      try {
        const images = await promise;
        return { status: 'fulfilled' as const, value: { imageName, images, success: true } };
      } catch (error) {
        return { status: 'fulfilled' as const, value: { imageName, images: [], success: false } };
      }
    });
    
    const imageResults = await Promise.all(imagePromises);
    
    // 首先清理加载状态
    imageResults.forEach((result) => {
      const { imageName } = result.value;
      const modulesToUpdateForImage = modulesToUpdate.get(imageName) || [];
      
      modulesToUpdateForImage.forEach(({ moduleKey }) => {
        setImageLoadingCache(prev => {
          const newCache = new Set(prev);
          newCache.delete(moduleKey);
          return newCache;
        });
        
        if (result.value.success) {
          setImageLoadedCache(prev => new Set([...prev, moduleKey]));
        }
      });
    });
    
    // 批量更新所有模块的镜像数据
    setLocalPickedTargets(currentTargets => {
      const updatedTargets = currentTargets.map(target => {
        const targetResult = imageResults.find(result => 
          modulesToUpdate.get(result.value.imageName)?.some(item => 
            item.service.service_name === target.service_name
          )
        );
        
        if (!targetResult) return target;
        
        return {
          ...target,
          modules: target.modules?.map(mod => {
            const moduleUpdate = imageResults.find(result => {
              const modulesToUpdateForImage = modulesToUpdate.get(result.value.imageName) || [];
              return modulesToUpdateForImage.some(item => 
                item.service.service_name === target.service_name && 
                item.module.service_module === mod.service_module
              );
            });
            
            if (!moduleUpdate) return mod;
            
            const { images, success } = moduleUpdate.value;
            
            return { 
              ...mod, 
              images: success ? images : [],
              filterImages: success ? images : [],
              loading: false,
              fetched: success
            };
          })
        };
      });
      
      
      // 同步回父组件
      job.pickedTargets = updatedTargets;
      return updatedTargets;
    });
    
    // 强制触发重新渲染
    setTimeout(() => {
      setForceRenderKey(prev => prev + 1);
    }, 0);
  }, [job.spec.source, registryId, getImages]);

  // 处理服务 - 重构为调用批量加载函数
  const handleServices = useCallback((val: ServiceInfo[]) => {
    
    // 确保所有模块都有正确的初始状态
    const initializedServices = val.map(service => ({
      ...service,
      modules: service.modules?.map(module => ({
        ...module,
        fetched: module.fetched === true, // 明确设置布尔值
        loading: module.loading === true,
        images: module.images || [],
        filterImages: module.filterImages || module.images || []
      }))
    }));
    
    // 关键：首先更新本地状态，这是UI渲染的基础
    setLocalPickedTargets(initializedServices);
    updatePickedTargets(initializedServices);
    
    // 然后触发镜像加载
    batchLoadImages(initializedServices);
    
    // 执行初始化逻辑
    initializedServices.forEach((service) => {
      mergeImageIntoHelmYamlInit(service);
    });
  }, [mergeImageIntoHelmYamlInit, updatePickedTargets]);

  // 预览
  const preview = useCallback(async (item: ServiceInfo, type: string, jobInfo: Job) => {
    let service_modules: any[] = [];
    if (jobInfo.spec.deploy_contents?.includes('image')) {
      service_modules = item.modules
        ? item.modules.map((module) => ({
            name: module.service_module,
            image: type === 'other' ? '{{.build.image}}' : module.image
          }))
        : [];
    } else {
      service_modules = [];
    }
    
    if (deployType === 'helm') {
      const serviceName = item.service_name;
      const updateServiceRevision = jobInfo.spec.deploy_contents?.includes('config') 
        ? (item.update_config ? item.update_config : false) 
        : false;
      
      // 先渲染 image 到 yaml
      const renderYamlPayload = {
        env_name: envName,
        production: production,
        service_modules: service_modules,
        service_name: serviceName,
        update_service_revision: updateServiceRevision,
        values_yaml: item.variable_yaml
      };
      
      try {
        const renderYamlResult = await mergeImageIntoHelmYamlAPI(projectName, renderYamlPayload);
        if (renderYamlResult) {
          const yamlWithImage = renderYamlResult.values;
          const params = {
            projectName: projectName,
            envName: envName,
            serviceName: serviceName,
            isHelmChartDeploy: false,
            scene: item.deployed ? 'update_service' : 'create_service',
            format: 'flat_map',
            updateServiceRevision: updateServiceRevision,
            valueMergeStrategy: item.value_merge_strategy
          };
          
          const payload = {
            overrideValues: item.override_kvs ? JSON.parse(item.override_kvs) : [],
            overrideYaml: yamlWithImage
          };
          
          const req = production ? getProductionCalculatedValuesYamlAPI : getCalculatedValuesYamlAPI;
          
          try {
            const res = await req(params, payload);
            setFileDiffDialogTitle(`${serviceName} 更新后的 values 文件和当前环境中的 values 文件比对`);
            setReviewServiceName(serviceName);
            const { current, latest } = res;
            openUpdateServiceDialog({ yaml: current }, { yaml: latest });
          } catch (error) {
            console.error(error);
          }
        }
      } catch (error) {
        console.error(error);
      }
    } else {
      let kvs: any[] = [];
      if (job.spec.deploy_contents?.includes('vars')) {
        kvs = item.variable_kvs || [];
      }
      
      const payload = {
        update_service_revision: item.update_config,
        service_modules,
        variable_kvs: kvs
      };
      
      try {
        const res = await previewChangedYamlAPI(
          job.spec.env || '',
          item.service_name,
          projectName,
          payload
        );
        setFileDiffDialogTitle('服务渲染后的 YAML 结果和当前环境中的服务 YAML 比对');
        const { current, latest } = res;
        openUpdateServiceDialog(current, latest);
      } catch (error) {
        console.error(error);
      }
    }
  }, [deployType, envName, production, projectName, job]);

  // 打开更新服务对话框
  const openUpdateServiceDialog = useCallback((current: any, latest: any) => {
    current.yaml = current.yaml || '';
    setYamlDiff({
      oldString: current.yaml,
      newString: latest.yaml
    });
    setFileDiffDialogVisible(true);
  }, []);

  // 改变服务排序
  const changeServiceSort = useCallback((position: string, index: number) => {
    const newTargets = [...localPickedTargets];
    if (position === 'up') {
      if (index === 0) return;
      newTargets.splice(index - 1, 0, newTargets.splice(index, 1)[0]);
    } else {
      if (index === newTargets.length - 1) return;
      newTargets.splice(index + 1, 0, newTargets.splice(index, 1)[0]);
    }
    updatePickedTargets(newTargets);
  }, [localPickedTargets, updatePickedTargets]);


  // 避免循环调用的智能检查
  const hasUnfetchedModules = useMemo(() => {
    return localPickedTargets.some(target => 
      target.modules?.some(module => !module.fetched && !module.loading)
    );
  }, [localPickedTargets]);

  // 添加防抖机制，避免重复触发
  const [lastHandleServicesCall, setLastHandleServicesCall] = useState<string>('');
  
  // 简化的镜像加载触发器 - 只在真正需要时触发
  useEffect(() => {
    if (job.spec.source === 'runtime' && localPickedTargets.length > 0 && hasUnfetchedModules) {
      // 生成当前状态的唯一标识
      const currentSignature = JSON.stringify({
        targetsLength: localPickedTargets.length,
        unfetchedModules: localPickedTargets.flatMap(s => 
          s.modules?.filter(m => m.fetched !== true).map(m => `${s.service_name}-${m.service_module}`) || []
        ).sort()
      });
      
      // 只有当状态真正改变时才执行
      if (currentSignature !== lastHandleServicesCall) {
        setLastHandleServicesCall(currentSignature);
        // 只调用镜像加载，不重复调用整个 handleServices
        batchLoadImages(localPickedTargets);
      }
    }
  }, [job.spec.source, localPickedTargets, hasUnfetchedModules, lastHandleServicesCall]);

  useImperativeHandle(ref, () => ({
    validate: () => true,
    checkRequestStatus,
    getVariables,
    handleServices
  }), [checkRequestStatus, getVariables, handleServices]);
  
  
  return (
    <div className="workflow-deploy-rows">
      {localPickedTargets && localPickedTargets.length > 0 ? (
        <>
          {/* 标题行 */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center',
            padding: '8px 10px',
            backgroundColor: '#f5f5f5',
            fontSize: '14px',
            fontWeight: 300,
            lineHeight: '26px',
            marginBottom: '8px'
          }}>
            {job.spec.deploy_contents?.includes('vars') && (
              <div style={{ width: '50px' }}>&nbsp;</div>
            )}
            <div style={{ flex: '0 0 180px' }}>服务名称</div>
            {job.spec.deploy_contents?.includes('image') && (
              <div style={{ flex: '0 0 180px' }}>服务组件</div>
            )}
            {job.spec.deploy_contents?.includes('image') && (
              <div style={{ flex: '1' }}>镜像版本</div>
            )}
            {job.spec.deploy_contents?.includes('config') && (
              <div style={{ flex: '0 0 200px' }}>服务配置</div>
            )}
            {deployType === 'helm' && job.spec.deploy_contents?.includes('vars') && (
              <div style={{ flex: '0 0 200px' }}>
                <span>部署策略</span>
                <Tooltip content={
                  <div>
                    <span>合并策略</span>
                    <br/>
                    <span>覆盖策略</span>
                  </div>
                }>
                  <IconInfoCircle style={{ color: 'rgb(96, 98, 102)', cursor: 'pointer', marginLeft: 4 }} />
                </Tooltip>
              </div>
            )}
            <div style={{ flex: '0 0 60px' }}></div>
          </div>

          {/* 服务列表 */}
          {localPickedTargets.map((item, index) => (
            <div key={item.service_name}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0 10px',
                lineHeight: '28px',
                marginBottom: '0'
              }}>
                {/* 展开/收起 */}
                {job.spec.deploy_contents?.includes('vars') && (
                  <div style={{ width: '50px', display: 'flex', alignItems: 'center' }}>
                    {item.variable_kvs && item.variable_kvs.filter(v => v.source !== 'other' && !v.use_global_variable).length > 0 && (
                      <Button
                        theme="borderless"
                        size="default"
                        icon={item.isExpand ? <IconChevronUp /> : <IconChevronDown />}
                        onClick={() => expand(item, !item.isExpand)}
                      />
                    )}
                  </div>
                )}

                {/* 服务名称 */}
                <div style={{ flex: '0 0 180px' }}>
                  <Text>{item.service_name}</Text>
                </div>

                {/* 服务组件和镜像版本 */}
                {job.spec.deploy_contents?.includes('image') && (
                  <>
                    <div style={{ flex: '0 0 180px' }}>
                      {item.modules?.map((module, idx) => (
                        <div key={idx} style={{ marginBottom: idx === item.modules!.length - 1 ? 0 : 8 }}>
                          <Text>{module.service_module}</Text>
                        </div>
                      ))}
                    </div>
                    <div style={{ flex: '1' }}>
                      {item.modules?.map((module, idx) => (
                        <div key={idx} style={{ marginBottom: idx === item.modules!.length - 1 ? 0 : 8 }}>
                          {job.spec.source === 'runtime' ? (
                            viewMode ? (
                              <Text ellipsis={{ showTooltip: true }} style={{ maxWidth: 300 }}>
                                {module.image}
                              </Text>
                            ) : (
                              <>
                                {module.loading ? (
                                  <Text type="tertiary">加载中...</Text>
                                ) : (
                                  <Select
                                    key={`${item.service_name}-${module.service_module}-${module.fetched}-${module.filterImages?.length || 0}-${forceRenderKey}`}
                                    value={module.image}
                                    onChange={(value) => {
                                      // 深拷贝更新，确保 React 能检测到变化
                                      const updatedTargets = localPickedTargets.map(target => {
                                        if (target.service_name === item.service_name) {
                                          return {
                                            ...target,
                                            modules: target.modules?.map(mod => 
                                              mod.service_module === module.service_module 
                                                ? { ...mod, image: value as string }
                                                : mod
                                            )
                                          };
                                        }
                                        return target;
                                      });
                                      updatePickedTargets(updatedTargets);
                                      handleImageInput(item, value as string);
                                    }}
                                    onSearch={(value) => filterMethod(value, module)}
                                    filter
                                    allowCreate
                                    placeholder="选择镜像标签或输入完整镜像地址"
                                    style={{ width: '300px', minWidth: 200 }}
                                    size="default"
                                    showClear
                                    optionList={(() => {
                                      const options = (module.filterImages || []).slice(0, 50).map((img: any) => ({
                                        label: img.tag,
                                        value: img.owner 
                                          ? `${img.host}/${img.owner}/${img.name}:${img.tag}`
                                          : `${img.host}/${img.name}:${img.tag}`
                                      }));
                                      return options;
                                    })()}
                                    onFocus={() => {
                                      const moduleKey = `${item.service_name}-${module.service_module}-${module.image_name}`;
                                      
                                      if (!module.fetched && !module.loading && !imageLoadingCache.has(moduleKey) && !imageLoadedCache.has(moduleKey)) {
                                        // 标记为正在加载
                                        setImageLoadingCache(prev => new Set([...prev, moduleKey]));
                                        
                                        // 先设置 loading 状态
                                        const loadingTargets = localPickedTargets.map(target => ({
                                          ...target,
                                          modules: target.modules?.map(mod => 
                                            mod.service_module === module.service_module 
                                              ? { ...mod, loading: true }
                                              : mod
                                          )
                                        }));
                                        updatePickedTargets(loadingTargets);
                                        
                                        getImages(module.image_name || '', registryId).then((res) => {
                                          // 标记为已加载
                                          setImageLoadingCache(prev => {
                                            const newCache = new Set(prev);
                                            newCache.delete(moduleKey);
                                            return newCache;
                                          });
                                          setImageLoadedCache(prev => new Set([...prev, moduleKey]));
                                          
                                          // 深拷贝更新镜像数据
                                          setLocalPickedTargets(currentTargets => {
                                            const updatedTargets = currentTargets.map(target => ({
                                              ...target,
                                              modules: target.modules?.map(mod => {
                                                if (mod.service_module === module.service_module) {
                                                  const newModule = { 
                                                    ...mod, 
                                                    images: res,
                                                    loading: false,
                                                    fetched: true
                                                  };
                                                  // 初始化过滤数据
                                                  if (!newModule.image) {
                                                    newModule.filterImages = res || [];
                                                  } else {
                                                    newModule.filterImages = JSON.parse(JSON.stringify(res || []));
                                                    let matchedImage: any = {};
                                                    const filterImages = newModule.filterImages || [];
                                                    for (let i = 0; i < filterImages.length; i++) {
                                                      const element = filterImages[i];
                                                      const tag = element.owner 
                                                        ? `${element.host}/${element.owner}/${element.name}:${element.tag}`
                                                        : `${element.host}/${element.name}:${element.tag}`;
                                                      if (tag === newModule.image) {
                                                        matchedImage = element;
                                                        filterImages.splice(i, 1);
                                                        break;
                                                      }
                                                    }
                                                    if (matchedImage.tag && newModule.filterImages) {
                                                      newModule.filterImages.unshift(matchedImage);
                                                    }
                                                  }
                                                  return newModule;
                                                }
                                                return mod;
                                              })
                                            }));
                                            job.pickedTargets = updatedTargets;
                                            return updatedTargets;
                                          });
                                        }).catch((error) => {
                                          console.error('获取镜像失败:', error);
                                          // 清除加载状态
                                          setImageLoadingCache(prev => {
                                            const newCache = new Set(prev);
                                            newCache.delete(moduleKey);
                                            return newCache;
                                          });
                                          
                                          // 重置 loading 状态
                                          setLocalPickedTargets(currentTargets => {
                                            const errorTargets = currentTargets.map(target => ({
                                              ...target,
                                              modules: target.modules?.map(mod => 
                                                mod.service_module === module.service_module 
                                                  ? { ...mod, loading: false }
                                                  : mod
                                              )
                                            }));
                                            job.pickedTargets = errorTargets;
                                            return errorTargets;
                                          });
                                        });
                                      }
                                    }}
                                  />
                                )}
                              </>
                            )
                          ) : (
                            <Text type="tertiary" size="normal">来自预构建任务</Text>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* 服务配置 */}
                {job.spec.deploy_contents?.includes('config') && (
                  <div style={{ flex: '0 0 200px' }}>
                    {hideChange ? (
                      <div>
                        {item.updatable && (
                          <Checkbox
                            checked={item.update_config}
                            onChange={(e) => {
                              // 深拷贝更新，确保 React 能检测到变化
                              const updatedTargets = localPickedTargets.map(target => 
                                target.service_name === item.service_name 
                                  ? { ...target, update_config: e.target.checked }
                                  : target
                              );
                              updatePickedTargets(updatedTargets);
                            }}
                            disabled={viewMode}
                          >
                            <Text size="normal">使用最新变更</Text>
                          </Checkbox>
                        )}
                      </div>
                    ) : (
                      <div>
                        {triggerMode || releasePlanMode ? (
                          <Checkbox
                            checked={item.update_config}
                            onChange={(e) => {
                              // 深拷贝更新，确保 React 能检测到变化
                              const updatedTargets = localPickedTargets.map(target => 
                                target.service_name === item.service_name 
                                  ? { ...target, update_config: e.target.checked }
                                  : target
                              );
                              updatePickedTargets(updatedTargets);
                              getVariables([item]);
                            }}
                            disabled={viewMode}
                          >
                            <Text size="normal">使用最新变更</Text>
                          </Checkbox>
                        ) : (
                          <>
                            {item.updatable ? (
                              <div>
                                <Checkbox
                                  checked={item.update_config}
                                  onChange={(e) => {
                                    // 深拷贝更新，确保 React 能检测到变化
                                    const updatedTargets = localPickedTargets.map(target => 
                                      target.service_name === item.service_name 
                                        ? { ...target, update_config: e.target.checked }
                                        : target
                                    );
                                    updatePickedTargets(updatedTargets);
                                    getVariables([item]);
                                  }}
                                  disabled={viewMode}
                                >
                                  <Text size="normal">使用最新变更</Text>
                                </Checkbox>
                                {!item.update_config && (
                                  <div style={{ color: 'red', lineHeight: '16px' }}>
                                    <IconInfoCircle style={{ marginRight: 4 }} />
                                    有变更
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div style={{ color: '#ddd' }}>无变更</div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 部署策略 */}
                {deployType === 'helm' && job.spec.deploy_contents?.includes('vars') && (
                  <div style={{ flex: '0 0 200px' }}>
                    {job.spec.merge_strategy_source === 'runtime' ? (
                      <Radio.Group
                        value={item.value_merge_strategy}
                        onChange={(e) => {
                          // 深拷贝更新，确保 React 能检测到变化
                          const updatedTargets = localPickedTargets.map(target => 
                            target.service_name === item.service_name 
                              ? { ...target, value_merge_strategy: e.target.value }
                              : target
                          );
                          updatePickedTargets(updatedTargets);
                          mergeStrategyChange(item);
                        }}
                        direction="vertical"
                        disabled={viewMode}
                      >
                        <Radio value="reuse-values">
                          <Text>合并</Text>
                          {item.auto_sync && (
                            <Tooltip content="合并策略警告">
                              <IconInfoCircle style={{ color: 'rgb(96, 98, 102)', cursor: 'pointer', marginLeft: 4 }} />
                            </Tooltip>
                          )}
                        </Radio>
                        <Radio value="override">
                          <Text>覆盖</Text>
                        </Radio>
                      </Radio.Group>
                    ) : (
                      <span>
                        {item.value_merge_strategy === 'reuse-values' ? '合并' : ''}
                        {item.value_merge_strategy === 'override' ? '覆盖' : ''}
                      </span>
                    )}
                  </div>
                )}

                {/* 预览和排序 */}
                <div style={{ flex: '0 0 60px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {!hideVarPreview && (
                    <Button
                      theme="borderless"
                      size="default"
                      type="primary"
                      onClick={() => preview(item, 'runtime', job)}
                    >
                      预览
                    </Button>
                  )}
                  {!viewMode && (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {index !== 0 && (
                        <IconArrowUp 
                          style={{ color: '#1C7CDB', fontSize: 16, cursor: 'pointer' }}
                          onClick={() => changeServiceSort('up', index)}
                        />
                      )}
                      {index !== localPickedTargets.length - 1 && (
                        <IconArrowDown 
                          style={{ color: '#1C7CDB', fontSize: 16, cursor: 'pointer' }}
                          onClick={() => changeServiceSort('down', index)}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* 展开的变量表格 */}
              {item.isExpand && job.spec.deploy_contents?.includes('vars') && (
                <div style={{ marginLeft: job.spec.deploy_contents?.includes('vars') ? 50 : 0, marginBottom: 16 }}>
                  {deployType === 'helm' ? (
                    <div style={{
                      width: '100%',
                      height: '300px',
                      marginBottom: '10px',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                      padding: 8,
                      backgroundColor: '#f8fcfd'
                    }}>
                      <Text strong>{item.service_name} 的 Helm Values</Text>
                      <TextArea
                        value={item.variable_yaml}
                        onChange={(val) => {
                          // 深拷贝更新，确保 React 能检测到变化
                          const updatedTargets = localPickedTargets.map(target => 
                            target.service_name === item.service_name 
                              ? { ...target, variable_yaml: val }
                              : target
                          );
                          updatePickedTargets(updatedTargets);
                        }}
                        disabled={viewMode || item.auto_sync}
                        rows={12}
                        style={{ width: '100%', fontFamily: 'monospace', marginTop: 8 }}
                      />
                    </div>
                  ) : (
                    <Table
                      dataSource={item.variable_kvs?.filter(variable => variable.source !== 'other' && !variable.use_global_variable) || []}
                      pagination={false}
                      size="default"
                      style={{
                        position: 'relative',
                        zIndex: 0,
                        width: 'auto',
                        margin: '5px',
                        backgroundColor: '#f8fcfd',
                        border: '1px solid #ccc',
                        borderRadius: '4px'
                      }}
                    >
                      <Table.Column title="Key" dataIndex="key" key="key" />
                      <Table.Column 
                        title="描述" 
                        dataIndex="desc" 
                        key="desc"
                        render={(desc: string, record: VariableKV) => desc || record.description || ''}
                      />
                      <Table.Column 
                        title="值" 
                        key="value"
                        render={(_, record: VariableKV, index: number) => {
                          if (record.type === 'string') {
                            return (
                              <Input
                                size="default"
                                value={record.value as string}
                                onChange={(val) => {
                                  // 深拷贝更新，确保 React 能检测到变化
                                  const updatedTargets = localPickedTargets.map(target => {
                                    if (target.service_name === item.service_name) {
                                      return {
                                        ...target,
                                        variable_kvs: target.variable_kvs?.map(variable => 
                                          variable.key === record.key 
                                            ? { ...variable, value: val }
                                            : variable
                                        )
                                      };
                                    }
                                    return target;
                                  });
                                  updatePickedTargets(updatedTargets);
                                }}
                                disabled={viewMode}
                              />
                            );
                          } else if (record.type === 'enum') {
                            return (
                              <Select
                                value={record.value as string}
                                onChange={(val) => {
                                  // 深拷贝更新，确保 React 能检测到变化
                                  const updatedTargets = localPickedTargets.map(target => {
                                    if (target.service_name === item.service_name) {
                                      return {
                                        ...target,
                                        variable_kvs: target.variable_kvs?.map(variable => 
                                          variable.key === record.key 
                                            ? { ...variable, value: val as string }
                                            : variable
                                        )
                                      };
                                    }
                                    return target;
                                  });
                                  updatePickedTargets(updatedTargets);
                                }}
                                size="default"
                                disabled={viewMode}
                                style={{ width: '100%' }}
                                optionList={(record.options || []).map(option => ({
                                  label: option,
                                  value: option
                                }))}
                              />
                            );
                          } else if (record.type === 'bool') {
                            return (
                              <Switch
                                checked={record.value as boolean}
                                onChange={(checked) => {
                                  // 深拷贝更新，确保 React 能检测到变化
                                  const updatedTargets = localPickedTargets.map(target => {
                                    if (target.service_name === item.service_name) {
                                      return {
                                        ...target,
                                        variable_kvs: target.variable_kvs?.map(variable => 
                                          variable.key === record.key 
                                            ? { ...variable, value: checked }
                                            : variable
                                        )
                                      };
                                    }
                                    return target;
                                  });
                                  updatePickedTargets(updatedTargets);
                                }}
                                disabled={viewMode}
                              />
                            );
                          } else if (record.type === 'yaml') {
                            return (
                              <TextArea
                                value={record.value as string}
                                onChange={(val) => {
                                  // 深拷贝更新，确保 React 能检测到变化
                                  const updatedTargets = localPickedTargets.map(target => {
                                    if (target.service_name === item.service_name) {
                                      return {
                                        ...target,
                                        variable_kvs: target.variable_kvs?.map(variable => 
                                          variable.key === record.key 
                                            ? { ...variable, value: val }
                                            : variable
                                        )
                                      };
                                    }
                                    return target;
                                  });
                                  updatePickedTargets(updatedTargets);
                                }}
                                disabled={viewMode}
                                rows={4}
                                style={{ width: '100%', fontFamily: 'monospace' }}
                              />
                            );
                          }
                          return record.value;
                        }}
                      />
                    </Table>
                  )}
                </div>
              )}
            </div>
          ))}
        </>
      ) : null}

      {/* File Diff Dialog */}
      <Modal
        visible={fileDiffDialogVisible}
        onCancel={() => setFileDiffDialogVisible(false)}
        title={fileDiffDialogTitle}
        width="95%"
        height="80vh"
        footer={
          <Button type="primary" onClick={() => setFileDiffDialogVisible(false)}>
            确定
          </Button>
        }
        style={{ top: 20 }}
        bodyStyle={{ padding: '16px', height: 'calc(80vh - 120px)', overflow: 'hidden' }}
      >
        <div className="diff-container" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          {deployType === 'helm' && job.spec.source !== 'runtime' && (
            <div style={{ color: '#999', marginBottom: 10, flexShrink: 0 }}>
              来自任务 {reviewServiceName} 的差异对比
            </div>
          )}
          <div className="diff-content" style={{ flex: 1, minHeight: 0 }}>
            <CodeDiff
              oldString={yamlDiff.oldString}
              newString={yamlDiff.newString}
              language="yaml"
              outputFormat="side-by-side"
              context={10}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
});

CustomWorkflowDeployConfig.displayName = 'CustomWorkflowDeployConfig';

export default CustomWorkflowDeployConfig;
