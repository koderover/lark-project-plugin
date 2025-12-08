import { useState, useEffect, forwardRef, useImperativeHandle, useCallback, useMemo, useRef } from 'react';
import { Select, Button, Modal, Tooltip, Switch, Toast, Form, Typography } from '@douyinfe/semi-ui';
import { IconHelpCircle } from '@douyinfe/semi-icons';
import { getVersionListAPI, getVersionDetailAPI, getVersionListLabelsAPI, imagesAPI } from '../../../../api/service';
import { cloneDeep, keyBy, mergeWith, isArray, uniqBy } from 'lodash';
// @ts-ignore - Will be found at runtime
import CustomWorkflowDeployConfig from './CustomWorkflowDeployConfig';

interface EnvOption {
  env: string;
  env_alias?: string;
  services?: ServiceInfo[];
  registry_id?: string;
}

interface ServiceModule {
  service_name: string;
  service_module: string;
  key?: string;
  source?: string;
  image?: string;
  image_name?: string;
  version_id?: string;
  [key: string]: any;
}

interface ServiceInfo {
  service_name: string;
  modules: ModuleInfo[];
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
  [key: string]: any;
}

interface VariableConfig {
  variable_kvs?: VariableKV[];
  variable_yaml?: string;
  override_kvs?: string;
}

interface VariableKV {
  key: string;
  value: string;
  type?: string;
  source?: string;
  description?: string;
  is_credential?: boolean;
  choice_option?: string[];
  choice_value?: string[];
}

interface VersionInfo {
  id: string;
  version: string;
  product_name?: string;
  created_at: number;
  created_by: string;
  desc?: string;
  labels?: string[];
  status?: string;
  services?: Array<{
    service_name: string;
    service_module?: string;
    image?: string;
    images?: Array<{
      container_name: string;
      image_name: string;
      target_image: string;
    }>;
    [key: string]: any;
  }>;
}

interface JobSpec {
  env?: string;
  env_source?: string;
  env_options?: EnvOption[];
  source?: string;
  services?: ServiceInfo[];
  service_and_images?: ServiceModule[];
  service_variable_config?: Array<{
    service_name: string;
    variable_configs?: Array<{
      variable_key: string;
      source: string;
    }>;
  }>;
  deploy_contents?: string[];
  value_merge_strategy?: string;
  version_name?: string;
  origin_job_name?: string;
  job_name?: string;
  [key: string]: any;
}

interface Job {
  name: string;
  type: string;
  spec: JobSpec;
  pickedModules?: ServiceModule[];
  pickedTargets?: ServiceInfo[];
  [key: string]: any;
}

interface ZadigDeployProps {
  job: Job;
  projectName: string;
  allJobList?: Job[];
  viewMode?: boolean;
  editRunner?: boolean;
  stageExecMode?: boolean;
  hideVarPreview?: boolean;
  triggerMode?: boolean;
  releasePlanMode?: boolean;
  approvalTicket?: any;
}

interface ZadigDeployRef {
  validate: () => Promise<boolean>;
  checkRequestStatus: () => boolean;
}

const ZadigDeploy = forwardRef<ZadigDeployRef, ZadigDeployProps>(
  (
    {
      job,
      projectName,
      allJobList = [],
      viewMode = false,
      editRunner = false,
      stageExecMode = false,
      hideVarPreview = false,
      triggerMode = false,
      releasePlanMode = false,
      approvalTicket,
    },
    ref
  ) => {
    // State matching Vue version exactly
    const [versionInfo, setVersionInfo] = useState({
      services: [],
      enableFilter: true,
      id: '',
      label: '',
      versionName: '',
      data: {},
    });
    const [versionList, setVersionList] = useState<VersionInfo[]>([]);
    const [versionLabels, setVersionLabels] = useState<string[]>([]);
    const [dialogVersionSelectionVisible, setDialogVersionSelectionVisible] = useState(false);
    const [versionPickedTargets, setVersionPickedTargets] = useState<ServiceInfo[]>([]);
    const [forceUpdate, setForceUpdate] = useState(0);
    const [isInitializing, setIsInitializing] = useState(false);
    const initRef = useRef<boolean>(false);

    // 计算源任务关键数据签名 - 用于精确检测源任务数据变化
    const sourceJobDataSignature = useMemo(() => {
      if (job.spec.source !== 'fromjob') return '';

      const originJobName = job.spec.origin_job_name || job.spec.job_name || '';
      const foundJob = allJobList.find((j) => j.name === originJobName);

      if (!foundJob) return '';

      let signature = `${foundJob.name}-${foundJob.type}`;

      // 为不同类型的任务生成数据签名
      switch (foundJob.type) {
        case 'zadig-build':
          signature += `-builds:${foundJob.spec?.service_and_builds?.length || 0}`;
          break;
        case 'zadig-scanning':
          signature += `-targets:${foundJob.spec?.target_services?.length || 0}`;
          signature += `-picked:${foundJob.pickedTargets?.length || 0}`;

          // 对于 zadig-scanning，关键是监听 spec.target_services 的变化 (对应Vue版本的 watch)
          if (foundJob.spec?.target_services) {
            const targetServicesSig = foundJob.spec.target_services
              .map((t) => `${t.service_name}/${t.service_module}`)
              .sort()
              .join(',');
            signature += `-tsig:${targetServicesSig.slice(0, 50)}`;
          }

          // 同时也监听 pickedTargets 的变化 (运行时数据)
          if (foundJob.pickedTargets) {
            const pickedSig = foundJob.pickedTargets
              .map((t) => `${t.service_name}/${t.service_module}`)
              .sort()
              .join(',');
            signature += `-psig:${pickedSig.slice(0, 50)}`;
          }
          break;
        case 'zadig-test':
          signature += `-targets:${foundJob.spec?.target_services?.length || 0}`;
          signature += `-picked:${foundJob.pickedTargets?.length || 0}`;
          break;
        case 'zadig-deploy':
          signature += `-modules:${foundJob.pickedModules?.length || 0}`;
          signature += `-services:${foundJob.spec?.services?.length || 0}`;
          break;
        default:
          signature += `-generic:${JSON.stringify(foundJob.spec).slice(0, 100)}`;
          break;
      }

      return signature;
    }, [job.spec.source, job.spec.origin_job_name, job.spec.job_name, allJobList]);

    // 计算源任务 - 基于数据签名重新计算
    const sourceJob = useMemo(() => {
      const findOriginalJob = (jobName: string): Job | null => {
        const foundJob = allJobList.find((job) => job.name === jobName);
        if (foundJob && foundJob.spec.source === 'fromjob') {
          const originJobName = foundJob.spec.origin_job_name || foundJob.spec.job_name || '';
          return findOriginalJob(originJobName);
        } else {
          return foundJob ? cloneDeep(foundJob) : null;
        }
      };

      if (job.spec.source === 'fromjob') {
        const originJobName = job.spec.origin_job_name || job.spec.job_name || '';
        const foundSourceJob = cloneDeep(findOriginalJob(originJobName));
        return foundSourceJob;
      } else {
        return null;
      }
    }, [job.spec.source, job.spec.origin_job_name, job.spec.job_name, sourceJobDataSignature]); // 依赖数据签名

    const refJob = useMemo(() => {
      const findOriginalJob = (jobName: string): Job | null => {
        const foundJob = allJobList.find((job) => job.name === jobName);
        return foundJob ? cloneDeep(foundJob) : null;
      };
      if (job.spec.source === 'fromjob') {
        const originJobName = job.spec.origin_job_name || job.spec.job_name || '';
        return findOriginalJob(originJobName);
      } else {
        return null;
      }
    }, [job.spec.source, job.spec.origin_job_name, job.spec.job_name, sourceJobDataSignature]); // 也依赖数据签名

    const currentEnvOptions = useMemo((): ServiceInfo[] => {
      const envName = job.spec.env;
      const envOptions = job.spec.env_options;
      if (envOptions) {
        const envOption = envOptions.find((item) => item.env === envName);
        if (envOption) {
          return envOption.services || [];
        } else {
          return [];
        }
      } else {
        return [];
      }
    }, [job.spec.env, job.spec.env_options]);

    const currentEnvServiceModules = useMemo((): ServiceModule[] => {
      return currentEnvOptions.flatMap((item) =>
        (item.modules || []).map((module) => ({
          service_name: item.service_name,
          service_module: module.service_module,
          key: `${item.service_name}/${module.service_module}`,
          source: 'config',
        }))
      );
    }, [currentEnvOptions]);

    const registryId = useMemo((): string => {
      const envName = job.spec.env;
      const envOptions = job.spec.env_options;
      if (!envOptions) {
        return '';
      }
      const envOption = envOptions.find((item) => item.env === envName);
      if (envOption) {
        return envOption.registry_id || '';
      } else {
        return '';
      }
    }, [job.spec.env, job.spec.env_options]);

    // Methods - matching Vue version exactly
    const getVariables = useCallback(
      async (pickedTargets: ServiceInfo[]): Promise<ServiceInfo[]> => {
        if (pickedTargets) {
          for (const service of pickedTargets) {
            const serviceName = service.service_name;
            const serviceInEnv = currentEnvOptions.find((item) => item.service_name === serviceName);
            if (serviceInEnv) {
              const serviceIsDeployed = serviceInEnv.deployed;
              const envModules = serviceInEnv.modules;
              const serviceModules = service.modules;

              if (editRunner || stageExecMode) {
                // 一直从 env_options 的服务里面取：updatable deployed auto_sync
                service.auto_sync = serviceInEnv.auto_sync;
                service.deployed = serviceInEnv.deployed;
                service.updatable = serviceInEnv.updatable;
                // 一直从 services 里面取，这里即是保持原样:  modules override_kvs variable_yaml
                service.override_kvs = service.override_kvs;
                service.modules = service.modules?.map((module) => ({
                  ...module,
                  fetched: module.fetched || false,
                  loading: module.loading || false,
                  images: module.images || [],
                  filterImages: module.filterImages || [],
                }));
                service.variable_yaml = service.variable_yaml;

                service.update_config = service.update_config;

                // 编辑模式时，value_merge_strategy 从服务层取，如果读不到说明是 fromjob 模式，从 job.spec.services 查询到同名服务取值
                if (service.value_merge_strategy) {
                  service.value_merge_strategy = service.value_merge_strategy;
                } else {
                  const sameNameService = job.spec.services?.find((item) => item.service_name === service.service_name);
                  if (sameNameService) {
                    service.value_merge_strategy = sameNameService.value_merge_strategy;
                  }
                }

                // update_config 为 true variable_kvs ，从  env_options  的 service_variable 取值
                // update_config 为 false variable_kvs ，从  env_options  的 env_variable 取值
                const variableKvs = service.update_config
                  ? serviceInEnv.service_variable
                    ? serviceInEnv.service_variable.variable_kvs
                    : []
                  : serviceInEnv.env_variable
                  ? serviceInEnv.env_variable.variable_kvs
                  : [];

                // 变量不带 source，需要到 spec.service_variable_config 中根据 service_name 查询出该服务的变量配置，并在该配置的 variable_configs
                // 中查询到匹配 variable_key 的项目，并设置 source 为该项目的 source
                const variableKvsWithOrigin =
                  variableKvs?.map((variable) => {
                    const serviceConfig = job.spec.service_variable_config?.find((config) => config.service_name === service.service_name);
                    if (serviceConfig) {
                      if (serviceConfig.variable_configs) {
                        const matchedConfig = serviceConfig.variable_configs.find((config) => config.variable_key === variable.key);
                        if (matchedConfig) {
                          return { ...variable, source: matchedConfig.source };
                        }
                      } else {
                        return { ...variable, source: 'runtime' };
                      }
                    }
                    return variable;
                  }) || [];
                service.variable_kvs = variableKvsWithOrigin;
              } else {
                // 如果服务已经部署，则使用环境变量，否则使用服务变量，代表上线服务
                const variableKvs = serviceIsDeployed
                  ? serviceInEnv.env_variable
                    ? serviceInEnv.env_variable.variable_kvs
                    : []
                  : serviceInEnv.service_variable
                  ? serviceInEnv.service_variable.variable_kvs
                  : [];

                const overrideKvs = serviceIsDeployed
                  ? serviceInEnv.env_variable
                    ? serviceInEnv.env_variable.override_kvs
                    : ''
                  : serviceInEnv.service_variable
                  ? serviceInEnv.service_variable.override_kvs
                  : '';

                const variableYaml = serviceIsDeployed
                  ? serviceInEnv.env_variable
                    ? serviceInEnv.env_variable.variable_yaml
                    : ''
                  : serviceInEnv.service_variable
                  ? serviceInEnv.service_variable.variable_yaml
                  : '';

                const latestVariableKvs = serviceInEnv.service_variable ? serviceInEnv.service_variable.variable_kvs : [];
                const latestVariableYaml = serviceInEnv.service_variable ? serviceInEnv.service_variable.variable_yaml : '';
                const latestOverrideKvs = serviceInEnv.env_variable ? serviceInEnv.env_variable.override_kvs : '';
                // 服务有更新，则设置 update_config 为 true
                if (serviceInEnv.updatable) {
                  service.update_config = true;
                }
                const updateConfig = service.update_config;
                const sourceVars = updateConfig ? latestVariableKvs : variableKvs;

                // 变量不带 source，需要到 spec.service_variable_config 中根据 service_name 查询出该服务的变量配置，并在该配置的 variable_configs
                // 中查询到匹配 variable_key 的项目，并设置 source 为该项目的 source, 如果 service_variable_config 中没有 variable_configs，则设置 source 为 runtime
                const sourceVarsWithOrigin =
                  sourceVars?.map((variable) => {
                    const serviceConfig = job.spec.service_variable_config?.find((config) => config.service_name === service.service_name);
                    if (serviceConfig) {
                      if (serviceConfig.variable_configs) {
                        const matchedConfig = serviceConfig.variable_configs.find((config) => config.variable_key === variable.key);
                        if (matchedConfig) {
                          return { ...variable, source: matchedConfig.source };
                        }
                      } else {
                        return { ...variable, source: 'runtime' };
                      }
                    }
                    return variable;
                  }) || [];

                const sourceYaml = updateConfig ? latestVariableYaml : variableYaml;
                const sourceOverrideKvs = updateConfig ? latestOverrideKvs : overrideKvs;

                // 这里匹配 serviceModules 中在 envModules 中存在的模块
                const filteredModules = envModules
                  ?.filter((envModule) => {
                    return serviceModules?.some((serviceModule) => serviceModule.service_module === envModule.service_module);
                  })
                  .map((module) => ({
                    ...module,
                    fetched: false,
                    loading: false,
                    images: [],
                    filterImages: [],
                  }));
                // 一直从 env_options 里面取：updatable deployed auto_sync
                service.auto_sync = serviceInEnv.auto_sync;
                service.deployed = serviceInEnv.deployed;
                service.updatable = serviceInEnv.updatable;

                service.modules = filteredModules || [];
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
                service.isExpand = (sourceVarsWithOrigin?.length || 0) > 0;
              }
            }
          }
          return pickedTargets;
        }
        return [];
      },
      [currentEnvOptions, editRunner, stageExecMode, job.spec]
    );

    const getPickedTargetsByModules = useCallback(
      async (modules: ServiceModule[], services: ServiceInfo[], versionServices: ServiceInfo[] = []): Promise<ServiceInfo[]> => {
        if (modules && services) {
          const mappedServices = modules
            .map((module) => {
              // 引用的服务数据来源于其它部署，原任务还是来源于版本的，目前源任务的 versionServices 没有传下来，先用 services 代替
              const dataSource = job.spec.source === 'fromjob' ? services : module.source === 'version' ? versionServices : services;
              const matchedService = dataSource.find((item) => item.service_name === module.service_name);

              if (matchedService) {
                const matchedModules = matchedService.modules?.filter((mod) => mod.service_module === module.service_module);

                if (matchedModules && matchedModules.length > 0) {
                  return {
                    ...matchedService,
                    modules: matchedModules,
                  };
                }
              }

              return null;
            })
            .filter(Boolean) as ServiceInfo[];

          const mergedServices = mappedServices.reduce((acc, service) => {
            if (acc[service.service_name]) {
              acc[service.service_name].modules = acc[service.service_name].modules.concat(service.modules);
            } else {
              acc[service.service_name] = { ...service };
            }
            return acc;
          }, {} as Record<string, ServiceInfo>);

          const pickedTargets = Object.values(mergedServices);
          const res = await getVariables(pickedTargets);
          return res;
        }
        return [];
      },
      [job.spec.source, getVariables]
    );

    const selectAll = useCallback(
      async (options: ServiceModule[], pickedModules: ServiceModule[]) => {
        if (pickedModules.length === options.length) {
          pickedModules.splice(0, pickedModules.length);
        } else {
          pickedModules.splice(0, pickedModules.length);
          options.forEach((item) => {
            pickedModules.push(item);
          });
        }
        job.pickedTargets = await getPickedTargetsByModules(pickedModules, currentEnvOptions);
        // 强制重新渲染以显示变化
        setForceUpdate((prev) => prev + 1);
      },
      [getPickedTargetsByModules, currentEnvOptions, job]
    );

    const changeLabel = useCallback(
      async (label?: string) => {
        try {
          const versionListResponse = await getVersionListAPI(projectName, 1, 9999, 'brief', label);
          setVersionInfo((prev) => ({ ...prev, id: '' }));
          if (versionListResponse) {
            setVersionList(
              versionListResponse
                .filter((item: VersionInfo) => item.status === 'success')
                .map((item: VersionInfo) => {
                  return {
                    version: item.version,
                    created_by: item.created_by,
                    created_at: item.created_at,
                    id: item.id,
                  };
                })
            );
          }
        } catch (error) {
          console.error('获取版本列表失败:', error);
        }
      },
      [projectName]
    );

    const getVersionList = useCallback(async () => {
      try {
        const [versionLabelsResponse, versionListResponse] = await Promise.all([getVersionListLabelsAPI(projectName), getVersionListAPI(projectName, 1, 9999, 'brief')]);
        setVersionLabels(versionLabelsResponse || []);
        if (versionListResponse) {
          setVersionList(
            versionListResponse
              .filter((item: VersionInfo) => item.status === 'success')
              .map((item: VersionInfo) => {
                return {
                  version: item.version,
                  created_by: item.created_by,
                  created_at: item.created_at,
                  id: item.id,
                };
              })
          );
        }
      } catch (error) {
        console.error('获取版本列表失败:', error);
      }
    }, [projectName]);

    const getVersionDetail = useCallback(
      async (targetId?: string) => {
        const id = targetId || versionInfo.id;

        if (!id) {
          console.warn('getVersionDetail called with empty id');
          return;
        }

        const versionItem = versionList.find((item) => item.id === id);
        const versionName = versionItem?.version || '';
        setVersionInfo((prev) => ({ ...prev, versionName }));

        try {
          const res = await getVersionDetailAPI(projectName, id);
          if (res) {
            const services = res.services.map((service: any) => {
              return {
                service_name: service.service_name,
                modules: service.images.map((image: any) => {
                  return {
                    service_module: image.container_name,
                    service_name: service.service_name,
                    image: image.target_image,
                    image_name: image.image_name,
                  };
                }),
              };
            });
            setVersionInfo((prev) => ({ ...prev, services }));
          }
        } catch (error) {
          console.error('获取版本详情失败:', error);
        }
      },
      [projectName, versionList, versionInfo.id]
    );

    const applyVersionImage = useCallback(async () => {
      const versionName = versionInfo.versionName;
      const versionServices = versionInfo.services;
      const envServices = cloneDeep(currentEnvOptions);
      let calculatedFilterResult = false;
      const enableFilter = versionInfo.enableFilter;
      const updateConfig = job.spec.deploy_contents?.includes('config');

      if (updateConfig) {
        if (enableFilter) {
          calculatedFilterResult = true;
        } else if (!enableFilter) {
          calculatedFilterResult = false;
        }
      } else if (!updateConfig) {
        if (enableFilter) {
          calculatedFilterResult = true;
        } else if (!enableFilter) {
          calculatedFilterResult = true;
        }
      }

      const mergeServiceData = (versionServices: any[], envServices: ServiceInfo[]) => {
        const result: ServiceInfo[] = [];
        // 创建一个映射对象，用于根据 service_name 快速查找环境中的服务数据
        const envServiceMap: Record<string, ServiceInfo> = {};
        envServices.forEach((item) => {
          envServiceMap[item.service_name] = item;
        });
        // 遍历版本中的服务数据
        versionServices.forEach((item) => {
          const newItem = { ...item }; // 复制一份版本中的服务数据
          // 如果环境中的服务存在相同 service_name 的数据，则将除了 modules 以外的数据合并到 newItem 中
          if (envServiceMap[item.service_name]) {
            const envserviceItem = envServiceMap[item.service_name];
            for (const key in envserviceItem) {
              if (key !== 'modules') {
                (newItem as any)[key] = (envserviceItem as any)[key];
              }
            }
          }
          result.push(newItem);
        });
        // 勾选更新服务配置，部署版本里面的服务，不勾选则只部署版本里在环境中存在的服务
        if (calculatedFilterResult) {
          const filteredResult = result.filter((itemA) => {
            return envServices.filter((itemB) => itemB.deployed).some((itemB) => itemB.service_name === itemA.service_name);
          });
          return filteredResult;
        } else {
          return result;
        }
      };

      const pickedTargets = mergeServiceData(versionServices, envServices);
      // 严格按照 Vue 版本的逻辑：为每个模块加载镜像列表
      pickedTargets.forEach((service) => {
        service.modules?.forEach((module) => {
          // 只有在有 image_name 的情况下才加载镜像
          if (module.image_name) {
            imagesAPI(projectName, [module.image_name], registryId)
              .then((res) => {
                module.images = res;
              })
              .catch((error) => {
                console.error('加载镜像失败:', error);
              });
          }
        });
      });

      for (const service of pickedTargets) {
        const serviceName = service.service_name;
        const serviceInEnv = currentEnvOptions.find((item) => item.service_name === serviceName);
        if (serviceInEnv) {
          const serviceIsDeployed = serviceInEnv.deployed;
          // 如果服务已经部署，则使用环境变量，否则使用服务变量，代表上线服务
          const variableKvs = serviceIsDeployed
            ? serviceInEnv.env_variable
              ? serviceInEnv.env_variable.variable_kvs
              : []
            : serviceInEnv.service_variable
            ? serviceInEnv.service_variable.variable_kvs
            : [];

          const overrideKvs = serviceIsDeployed
            ? serviceInEnv.env_variable
              ? serviceInEnv.env_variable.override_kvs
              : ''
            : serviceInEnv.service_variable
            ? serviceInEnv.service_variable.override_kvs
            : '';

          const variableYaml = serviceIsDeployed
            ? serviceInEnv.env_variable
              ? serviceInEnv.env_variable.variable_yaml
              : ''
            : serviceInEnv.service_variable
            ? serviceInEnv.service_variable.variable_yaml
            : '';

          const latestVariableKvs = serviceInEnv.service_variable ? serviceInEnv.service_variable.variable_kvs : [];
          const latestVariableYaml = serviceInEnv.service_variable ? serviceInEnv.service_variable.variable_yaml : '';
          const latestOverrideKvs = serviceInEnv.env_variable ? serviceInEnv.env_variable.override_kvs : '';
          // 服务有更新，则设置 update_config 为 true
          if (serviceInEnv.updatable) {
            service.update_config = true;
          }
          const updateConfig = service.update_config;
          const sourceVars = updateConfig ? latestVariableKvs : variableKvs;

          // 变量不带 source，需要到 spec.service_variable_config 中根据 service_name 查询出该服务的变量配置，并在该配置的 variable_configs
          // 中查询到匹配 variable_key 的项目，并设置 source 为该项目的 source
          const sourceVarsWithOrigin =
            sourceVars?.map((variable) => {
              const serviceConfig = job.spec.service_variable_config?.find((config) => config.service_name === service.service_name);
              if (serviceConfig) {
                if (serviceConfig.variable_configs) {
                  const matchedConfig = serviceConfig.variable_configs.find((config) => config.variable_key === variable.key);
                  if (matchedConfig) {
                    return { ...variable, source: matchedConfig.source };
                  }
                } else {
                  return { ...variable, source: 'runtime' };
                }
              }
              return variable;
            }) || [];

          const sourceYaml = updateConfig ? latestVariableYaml : variableYaml;
          const sourceOverrideKvs = updateConfig ? latestOverrideKvs : overrideKvs;
          service.value_merge_strategy = job.spec.value_merge_strategy;

          if (job.spec.deploy_contents?.includes('image') || job.spec.deploy_contents?.includes('vars')) {
            if (service.value_merge_strategy === 'reuse-values') {
              service.variable_yaml = '';
            } else if (service.value_merge_strategy === 'override') {
              service.variable_yaml = sourceYaml;
            }
          }
          // 一直从 env_options 里面取：updatable deployed auto_sync
          service.auto_sync = serviceInEnv.auto_sync;
          service.deployed = serviceInEnv.deployed;
          service.updatable = serviceInEnv.updatable;

          service.variable_kvs = sourceVarsWithOrigin;
          service.override_kvs = sourceOverrideKvs;
          // 严格按照 Vue 版本逻辑：只有变量数量大于0时才展开
          service.isExpand = (sourceVarsWithOrigin?.length || 0) > 0;
        }
      }

      const pickedTargetsWithVariables = pickedTargets;
      // 严格按照 Vue 版本的顺序：先设置 pickedTargets，再设置 versionPickedTargets，最后设置 pickedModules
      job.pickedTargets = pickedTargetsWithVariables;
      setVersionPickedTargets(pickedTargetsWithVariables);

      // 设置 pickedModules，标记来源为 'version'
      job.pickedModules = pickedTargetsWithVariables.flatMap((item) =>
        (item.modules || []).map((module) => ({
          service_name: item.service_name,
          service_module: module.service_module,
          source: 'version',
          key: `${item.service_name}/${module.service_module}`,
        }))
      );

      // 设置版本名称
      job.spec.version_name = versionName;

      // 强制重新渲染
      setForceUpdate((prev) => prev + 1);

      // 关闭对话框
      setDialogVersionSelectionVisible(false);
    }, [versionInfo, currentEnvOptions, job, projectName, registryId]);

    const useVersionToDeploy = useCallback(() => {
      getVersionList();
      setVersionInfo({
        services: [],
        data: {},
        id: '',
        enableFilter: true,
        label: '',
        versionName: '',
      });
      setDialogVersionSelectionVisible(true);
      // Note: Form validation clearing is handled automatically in React with state reset
    }, [getVersionList]);

    const changeServiceModule = useCallback(
      async (selectedModules: ServiceModule[]) => {
        const envOptionsMap = keyBy(currentEnvOptions, 'service_name');
        const servicesMap = keyBy(job.spec.services || [], 'service_name');
        // 自定义合并函数，优先使用 `job.spec.services` 的数据
        const customizer = (objValue: any, srcValue: any) => {
          if (isArray(objValue)) {
            return srcValue;
          }
        };
        const mergedServices = mergeWith({}, envOptionsMap, servicesMap, customizer);
        // 根据 stageExecMode 选择 dataSource
        const dataSource = stageExecMode ? Object.values(mergedServices) : currentEnvOptions;

        // Next tick equivalent - 确保状态更新能被 React 检测到
        setTimeout(async () => {
          const newPickedTargets = await getPickedTargetsByModules(selectedModules, dataSource as ServiceInfo[], versionPickedTargets);
          job.pickedTargets = newPickedTargets;
          // 强制重新渲染
          setForceUpdate((prev) => prev + 1);
        }, 0);
      },
      [currentEnvOptions, job.spec.services, stageExecMode, getPickedTargetsByModules, versionPickedTargets]
    );

    const init = useCallback(async () => {
      if (isInitializing) return; // 防止重复初始化
      setIsInitializing(true);

      if (job.spec.source === 'runtime') {
        // 编辑模式处理
        if (editRunner || stageExecMode) {
          if (job.spec.services) {
            setTimeout(async () => {
              const modules = job.spec.services?.flatMap((item) =>
                (item.modules || []).map((module) => ({
                  service_name: item.service_name,
                  service_module: module.service_module,
                  key: `${item.service_name}/${module.service_module}`,
                  source: 'config',
                }))
              );
              job.pickedModules = modules;
              job.pickedTargets = await getVariables(job.spec.services || []);
              setForceUpdate((prev) => prev + 1);
            }, 0);
          }
        } else {
          // 非编辑模式处理默认值
          if (job.spec.service_and_images) {
            setTimeout(async () => {
              const modules = job.spec.service_and_images?.map((item) => {
                return {
                  service_name: item.service_name,
                  service_module: item.service_module,
                  key: `${item.service_name}/${item.service_module}`,
                  source: 'config',
                };
              });
              job.pickedModules = modules;
              const defaultServices = uniqBy(job.spec.service_and_images, 'service_name').map((item) => {
                const serviceConfig = job.spec.service_variable_config?.find((config) => config.service_name === item.service_name);
                return {
                  ...item,
                  variable_configs: serviceConfig ? serviceConfig.variable_configs : [],
                  modules: modules || [],
                };
              });
              const res = await getPickedTargetsByModules(modules || [], defaultServices as ServiceInfo[]);
              job.pickedTargets = res;
              setForceUpdate((prev) => prev + 1);
            }, 0);
          }
        }
      } else if (job.spec.source === 'fromjob') {
        let services: ServiceInfo[] = [];
        if (sourceJob?.type === 'zadig-build') {
          // 编辑模式展示前置任务数据
          if (editRunner || stageExecMode) {
            services = await getPickedTargetsByModules(sourceJob.spec.service_and_builds || [], currentEnvOptions);
          } else {
            services = await getPickedTargetsByModules(sourceJob.spec.service_and_builds || [], currentEnvOptions);
          }
        } else if (sourceJob?.type === 'zadig-distribute-image') {
          // 构建对服务有范围限制，如果引用类型为构建，则只展示构建的服务，否则展示原始引用的服务
          if (refJob?.type === 'zadig-build') {
            services = await getPickedTargetsByModules(refJob.spec.service_and_builds || [], currentEnvOptions);
          } else {
            services = await getPickedTargetsByModules(sourceJob.spec.targets || [], currentEnvOptions);
          }
        } else if (sourceJob?.type === 'zadig-scanning') {
          // 构建对服务有范围限制，如果引用类型为构建，则只展示构建的服务，否则展示原始引用的服务
          if (refJob?.type === 'zadig-build') {
            services = await getPickedTargetsByModules(refJob.spec.service_and_builds || [], currentEnvOptions);
          } else {
            // 优先使用pickedTargets，如果没有则使用target_services - 这是关键修复
            const targetSource =
              sourceJob.pickedTargets && sourceJob.pickedTargets.length > 0
                ? sourceJob.pickedTargets.map((target) => ({
                    service_name: target.service_name,
                    service_module: target.service_module,
                    key: `${target.service_name}/${target.service_module}`,
                  }))
                : sourceJob.spec.target_services || [];
            services = await getPickedTargetsByModules(targetSource, currentEnvOptions);
          }
        } else if (sourceJob?.type === 'zadig-test') {
          // 构建对服务有范围限制，如果引用类型为构建，则只展示构建的服务，否则展示原始引用的服务
          if (refJob?.type === 'zadig-build') {
            services = await getPickedTargetsByModules(refJob.spec.service_and_builds || [], currentEnvOptions);
          } else {
            // 优先使用pickedTargets，如果没有则使用target_services
            const targetSource =
              sourceJob.pickedTargets && sourceJob.pickedTargets.length > 0
                ? sourceJob.pickedTargets.map((target) => ({
                    service_name: target.service_name,
                    service_module: target.service_module,
                    key: `${target.service_name}/${target.service_module}`,
                  }))
                : sourceJob.spec.target_services || [];
            services = await getPickedTargetsByModules(targetSource, currentEnvOptions);
          }
        } else if (sourceJob?.type === 'freestyle') {
          if (refJob?.type === 'zadig-build') {
            services = await getPickedTargetsByModules(refJob.spec.service_and_builds || [], currentEnvOptions);
          } else {
            services = await getPickedTargetsByModules(sourceJob.spec.services || [], currentEnvOptions);
          }
        } else if (sourceJob?.type === 'zadig-deploy') {
          // 人工确认展示前置任务数据
          if (stageExecMode) {
            setTimeout(async () => {
              const modules = sourceJob.spec.services?.flatMap((item) =>
                (item.modules || []).map((module) => ({
                  service_name: item.service_name,
                  service_module: module.service_module,
                  key: `${item.service_name}/${module.service_module}`,
                  source: 'config',
                }))
              );
              services = await getPickedTargetsByModules(modules || [], job.spec.services || []);
              setForceUpdate((prev) => prev + 1);
            }, 0);
          } else {
            services = await getPickedTargetsByModules(sourceJob.pickedModules || [], currentEnvOptions);
          }
        } else {
          services = [];
        }

        if (editRunner) {
          const result = services.map((itemB) => {
            const { service_name } = itemB;
            const sameNameService = job.spec.services?.find((itemA) => itemA.service_name === service_name);
            if (sameNameService) {
              itemB.variable_kvs = sameNameService.variable_kvs;
              itemB.variable_yaml = sameNameService.variable_yaml;
              itemB.update_config = sameNameService.update_config;
            }
            return itemB;
          });
          setTimeout(() => {
            const originServiceOrder = job.spec.services?.map((service) => service.service_name) || [];
            // 对 services 进行排序，顺序同步 job.spec.services 确保克隆后顺序保持
            result.sort((a, b) => {
              return originServiceOrder.indexOf(a.service_name) - originServiceOrder.indexOf(b.service_name);
            });
            job.pickedTargets = result;
            setForceUpdate((prev) => prev + 1);
          }, 0);
        } else {
          setTimeout(() => {
            job.pickedTargets = services;
            setForceUpdate((prev) => prev + 1);
          }, 0);
        }
      }

      setIsInitializing(false);
    }, [editRunner, stageExecMode, sourceJob, refJob, currentEnvOptions, getPickedTargetsByModules, getVariables]); // 移除job依赖，避免循环

    // 优化的生命周期管理 - 避免无限循环
    useEffect(() => {
      if (!initRef.current) {
        init();
        initRef.current = true;
      }
    }, []); // 组件挂载时初始化一次

    // 监听sourceJob关键数据变化 - 使用数据签名进行精确监听
    useEffect(() => {
      if (initRef.current && sourceJobDataSignature && job.spec.source === 'fromjob') {
        init();
      }
    }, [sourceJobDataSignature, job.spec.source, init]);

    // 监听环境选项变化
    useEffect(() => {
      if (initRef.current && job.spec.source === 'runtime' && currentEnvOptions.length > 0) {
        init();
      }
    }, [currentEnvOptions.length, job.spec.source]);

    // Environment change handler
    const handleEnvChange = useCallback(
      (selectedEnv: string) => {
        // 重要：更新 job.spec.env，这是 Vue 版本的关键逻辑
        job.spec.env = selectedEnv;

        if (job.spec.source === 'runtime') {
          job.pickedTargets = [];
          job.pickedModules = [];
        }

        // 延迟初始化以确保状态同步
        setTimeout(() => init(), 0);
      },
      [job.spec, init]
    );

    const validate = useCallback(async (): Promise<boolean> => {
      return new Promise((resolve) => {
        const jobName = job.name;
        if (job.spec.source === 'runtime') {
          if ((job.pickedModules || []).length > 0) {
            return resolve(true);
          }
        } else if (job.spec.source === 'fromjob') {
          if ((job.pickedTargets || []).length > 0) {
            return resolve(true);
          }
        }
        Toast.error(`${jobName}: 至少选择一个服务组件`);
        return resolve(false);
      });
    }, [job.name, job.spec.source, job.pickedModules, job.pickedTargets]);

    const checkRequestStatus = useCallback((): boolean => {
      return true;
    }, []);

    // Force re-render for runtime mode
    useEffect(() => {
      if (job.spec.source === 'runtime') {
        // 强制重新渲染以确保UI更新
        setForceUpdate((prev) => prev + 1);
      }
    }, [job.spec.env, job.spec.source]);

    // Expose methods to parent
    useImperativeHandle(
      ref,
      () => ({
        validate,
        checkRequestStatus,
        getLatestJobData: () => {
          return job;
        },
      }),
      [validate, checkRequestStatus, job]
    );

    const deployConfigRef = useRef<any>(null);

    return (
      <div className="job-zadig-deploy">
        {/* Environment Selection */}
        <div style={{ marginBottom: 16 }}>
          <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
            部署环境
          </Typography.Text>
          <Select
            value={job.spec.env}
            onChange={handleEnvChange}
            disabled={job.spec.env_source === 'fixed' || viewMode}
            placeholder="请选择环境"
            style={{ width: '220px' }}
            size="default"
            filter
            optionList={(job.spec.env_options || []).map((envItem) => ({
              label: envItem.env_alias ? (
                <span>
                  <span>{envItem.env_alias}</span>
                  <span style={{ color: '#a0a0a0' }}>({envItem.env})</span>
                </span>
              ) : (
                envItem.env
              ),
              value: envItem.env,
            }))}
          />
        </div>

        {/* Service Module Selection */}
        {job.spec.source === 'runtime' && (
          <div style={{ marginBottom: 16 }}>
            <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
              服务组件
            </Typography.Text>
            <Select
              value={(job.pickedModules || []).map((module) => module.key || `${module.service_name}/${module.service_module}`)}
              onChange={(selectedKeys) => {
                const keys = Array.isArray(selectedKeys) ? selectedKeys : selectedKeys ? [selectedKeys] : [];
                if (keys.includes('ALL')) {
                  return; // Ignore ALL selection
                }
                const selectedModules = currentEnvServiceModules.filter((module) => keys.includes(module.key || `${module.service_name}/${module.service_module}`));
                job.pickedModules = selectedModules;
                changeServiceModule(selectedModules);
              }}
              multiple
              filter
              showClear
              placeholder="请选择服务组件"
              style={{ width: '100%' }}
              size="default"
              disabled={viewMode}
              optionList={[
                {
                  label: (
                    <span
                      style={{
                        display: 'inline-block',
                        width: '100%',
                        fontWeight: 'normal',
                        cursor: 'pointer',
                        color: '#606266',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        selectAll(currentEnvServiceModules, job.pickedModules || []);
                      }}
                    >
                      全选
                    </span>
                  ),
                  value: 'ALL',
                  disabled: true,
                },
                ...currentEnvServiceModules.map((service, index) => ({
                  label: (
                    <span>
                      <span>{service.service_module}</span>
                      <span style={{ color: '#ccc' }}>({service.service_name})</span>
                    </span>
                  ),
                  value: service.key || `${service.service_name}/${service.service_module}`,
                  key: index,
                })),
              ]}
              renderSelectedItem={(optionNode: any, { index, onClose }: any) => {
                const key = optionNode?.value;
                if (key === 'ALL') {
                  return { isRenderInTag: false, content: '' };
                }
                const service = currentEnvServiceModules.find((s) => (s.key || `${s.service_name}/${s.service_module}`) === key);
                const content = service ? `${service.service_module}(${service.service_name})` : key || '';
                return {
                  isRenderInTag: true,
                  content: content,
                };
              }}
            />
            {!approvalTicket && (
              <div style={{ marginTop: 8 }}>
                <Button disabled={viewMode} onClick={useVersionToDeploy} size="default" theme="borderless" type="primary">
                  选择版本
                </Button>
                <Tooltip content="选择版本进行部署" position="top">
                  <IconHelpCircle style={{ color: '#999', fontSize: 14, marginLeft: 4 }} />
                </Tooltip>
              </div>
            )}
          </div>
        )}

        {/* Deploy Config Component */}
        <div style={{ marginTop: 16 }} key={forceUpdate}>
          <CustomWorkflowDeployConfig
            job={job}
            ref={deployConfigRef}
            projectName={projectName}
            registryId={registryId}
            viewMode={viewMode}
            editRunner={editRunner}
            stageExecMode={stageExecMode}
            hideVarPreview={hideVarPreview}
            triggerMode={triggerMode}
            releasePlanMode={releasePlanMode}
          />
        </div>

        {/* Version Selection Dialog */}
        <Modal
          title="选择版本"
          visible={dialogVersionSelectionVisible}
          onCancel={() => setDialogVersionSelectionVisible(false)}
          onOk={applyVersionImage}
          width="500px"
          okText="确定"
          cancelText="取消"
          labelPosition="left"
          labelWidth={130}
          mask={true}
          closeOnEsc={true}
          maskClosable={false}
        >
          <Form layout="vertical" labelPosition="left">
            <Form.Slot label="标签">
              <Select
                value={versionInfo.label}
                placeholder="请选择版本标签"
                onChange={(value) => {
                  const labelValue = value as string;
                  setVersionInfo((prev) => ({ ...prev, label: labelValue }));
                  changeLabel(labelValue);
                }}
                filter
                showClear
                size="default"
                style={{ width: '100%' }}
                optionList={versionLabels.map((item) => ({
                  label: item,
                  value: item,
                }))}
              />
            </Form.Slot>

            <Form.Slot label="版本">
              <Select
                value={versionInfo.id}
                placeholder="请选择版本"
                onChange={(value) => {
                  const versionId = value as string;
                  setVersionInfo((prev) => ({ ...prev, id: versionId }));
                  getVersionDetail(versionId);
                }}
                style={{ width: '100%' }}
                showClear
                size="default"
                optionList={versionList.map((item) => ({
                  label: `${item.version} - ${new Date(item.created_at * 1000).toLocaleString()} - ${item.created_by}`,
                  value: item.id,
                }))}
              />
            </Form.Slot>

            {versionInfo.label && (
              <div
                style={{
                  margin: '12px 0',
                  padding: '8px 12px',
                  background: '#f7f8fa',
                  border: '1px solid #e8e8e8',
                  borderRadius: '4px',
                  fontSize: '13px',
                  color: '#606266',
                }}
              >
                <span>
                  已选择标签：{versionInfo.label}，共 {versionList.length} 个版本
                </span>
              </div>
            )}

            <Form.Slot label="过滤服务">
              <Switch
                checked={versionInfo.enableFilter}
                onChange={(checked) => {
                  setVersionInfo((prev) => ({ ...prev, enableFilter: checked }));
                }}
                disabled={!job.spec.deploy_contents?.includes('config')}
                size="default"
              />
            </Form.Slot>
          </Form>
        </Modal>
      </div>
    );
  }
);

ZadigDeploy.displayName = 'ZadigDeploy';

export default ZadigDeploy;
