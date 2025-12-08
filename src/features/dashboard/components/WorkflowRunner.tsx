import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Button, Form, Tag, Typography, Toast, Collapse, TextArea } from '@douyinfe/semi-ui';
import { IconClose } from '@douyinfe/semi-icons';
import { getWorkflowItemPresetAPI, runWorkItemWorkflowAPI } from '../../../api/service';
import { cloneDeep } from 'lodash';
// TODO: Add these API imports when available
// import { runCustomWorkflowTaskAPI, manualExecCustomWorkflowAPI, getCustomWorkfloweTaskPresetAPI, runSprintCardTaskAPI } from '../../../api/service';
import './WorkflowRunner.css';

// Import job components - only the required ones
import ZadigBuild from './jobs/ZadigBuild';
import ZadigDeploy from './jobs/ZadigDeploy';
import ZadigScanning from './jobs/ZadigScanning';
import Approval from './jobs/Approval';
import Nacos from './jobs/Nacos';
import Sql from './jobs/Sql';
import WorkflowVariables from './WorkflowVariables';
import CheckUserPhone from './CheckUserPhone';
import ErrorBoundary from './ErrorBoundary';

// Repository type definition
interface RepoInfo {
  repo_owner: string;
  repo_namespace: string;
  repo_name: string;
  codehost_id: string;
  source?: string;
  branch?: string;
  tag?: string;
  commit_id?: string;
  prs?: number[] | string;
  branchOrTag?: {
    type: 'branch' | 'tag';
    name: string;
    id: string;
  };
  branchNames?: string[];
  branchPRsMap?: Record<string, any[]>;
  branchAndTagList?: any[];
  prNumberPropName?: string;
  _id_?: string;
  tags?: any[];
  changelist_id?: number | string;
  shelve_id?: number | string;
}

const { Text } = Typography;

interface JobSpec {
  // ZadigBuild fields
  source?: string;
  service_and_builds?: any[];
  service_and_builds_options?: any[];
  default_service_and_builds?: any[];
  origin_job_name?: string;
  job_name?: string;

  // ZadigDeploy fields
  env?: string;

  // Additional fields
  services?: any[];
  repos?: RepoInfo[];
  targets?: any[];
  gray_services?: any[];
  service_and_vm_deploys?: any[];
  patch_item_options?: any[];
  target_options?: any[];
  scannings?: any[];
  service_and_scannings?: any[];
  test_modules?: any[];
  service_and_tests?: any[];
  deploy_helm_charts?: any[];
  service_config?: any;
  env_source?: string;

  // ZadigScanning fields
  scanning_type?: string;
  target_services?: any[];
  service_scanning_options?: any[];
  pickedTargets?: any[];

  // Nacos fields
  nacos_id?: string;
  namespace_id?: string;
  nacos_datas?: any[];

  // SQL fields
  id?: string;
  sql?: string;

  // Approval type field
  type?: 'native' | 'lark' | 'lark_intl' | 'dingtalk' | 'workwx' | string;

  // Approve fields
  description?: string;
  approvers?: any[];
  timeout?: number;

  [key: string]: any;
}

interface Job {
  name: string;
  type: string;
  skipped: boolean;
  run_policy: string;
  spec: JobSpec;
  refInfo?: {
    skipped: boolean;
    jobName: string;
  } | null;
  pickedTargets?: any[];
  pickedModules?: any[];
  parameters?: any;
  service_modules?: any[];
  [key: string]: any;
}

interface Stage {
  name: string;
  jobs: Job[];
  execStage?: boolean;
}

interface WorkflowVariable {
  key: string;
  name?: string;
  value: string;
  description?: string;
  type: 'string' | 'choice' | 'multi-select' | 'text' | 'boolean' | 'repo';
  source: 'custom' | 'fixed' | 'reference';
  choice_option?: string[];
  choice_value?: string[];
  is_credential?: boolean;
  required?: boolean;
  repo?: any;
}

interface WorkflowPayload {
  stages: Stage[];
  variables?: WorkflowVariable[];
  remark?: string;
  name?: string;
  [key: string]: any;
}

// WorkflowRunner 不再接收 props，所有参数通过 JSSDK context 获取
const WorkflowRunner: React.FC = () => {
  // 从 JSSDK context 获取参数
  const [contextParams, setContextParams] = useState<Record<string, any> | null>(null);
  const [contextLoading, setContextLoading] = useState(true);

  // State variables matching Vue version
  const [startTaskLoading, setStartTaskLoading] = useState(false);
  const [activeName, setActiveName] = useState<string[]>(['workflow-variables']);
  const [payload, setPayload] = useState<WorkflowPayload>({
    workflow_name: '',
    note: '',
    stages: [
      {
        name: '',
        jobs: [],
      },
    ],
  });
  const [missingSourceJobs, setMissingSourceJobs] = useState<string[]>([]);

  // 加载 context 参数
  useEffect(() => {
    window.JSSDK.Context.load()
      .then((ctx: any) => {
        ctx
          .getCustomContext()
          .then((params: Record<string, any>) => {
            setContextParams(params);
            setContextLoading(false);
          })
          .catch((error: any) => {
            console.error('❌ [WorkflowRunner] Failed to load context:', error);
            setContextLoading(false);
          });
      })
      .catch((error: any) => {
        console.error('❌ [WorkflowRunner] Failed to load JSSDK Context:', error);
        setContextLoading(false);
      });
  }, []);

  // 从 context 中提取参数（带默认值）
  const workitemTypeKey = contextParams?.workitemTypeKey || '';
  const workItemId = contextParams?.workItemId || '';
  const workflowName = contextParams?.workflowName || '';
  const displayName = contextParams?.displayName || '';
  const projectName = contextParams?.projectName || '';
  const cloneWorkflow = contextParams?.cloneWorkflow || {};
  const initialPayload = contextParams?.payload;
  const viewMode = contextParams?.viewMode || false;
  const triggerMode = contextParams?.triggerMode || false;
  const releasePlanMode = contextParams?.releasePlanMode || false;
  const stageExecMode = contextParams?.stageExecMode || false;
  const sprintCardMode = contextParams?.sprintCardMode || false;
  const checkedSprintCardIds = contextParams?.checkedSprintCardIds || [];
  const sprintCardId = contextParams?.sprintCardId || '';
  const stageExecTaskId = contextParams?.stageExecTaskId || '';
  const editRunner = contextParams?.editRunner || false;
  const webhookSelectedRepo = contextParams?.webhookSelectedRepo || {};
  const approvalTicket = contextParams?.approvalTicket || null;

  // Refs for component validation
  const componentRefs = useRef<Record<string, any>>({});

  // Computed properties using useMemo
  const allJobList = useMemo(() => {
    const jobs: Job[] = [];
    const stages = payload.stages;
    stages.forEach((stage) => {
      jobs.push(...stage.jobs);
    });
    return jobs;
  }, [payload.stages]);

  const allExecStageJobList = useMemo(() => {
    const jobs: Job[] = [];
    const stages = payload.stages.filter((stage) => stage.execStage);
    stages.forEach((stage) => {
      jobs.push(...stage.jobs);
    });
    return jobs;
  }, [payload.stages]);

  const showWorkflowParamsWithoutFixed = useMemo(() => {
    if (payload.params && payload.params.length > 0) {
      const params = payload.params.filter((item) => !(item.source === 'fixed' || item.source === 'reference'));
      return params.length > 0;
    }
    return false;
  }, [payload.params]);

  // const deployType = useMemo(() => {
  //   // TODO: This should be retrieved from store/context in real implementation
  //   return '';
  // }, [projectName]);

  const checkingSleepingEnv = useMemo(() => {
    return [];
  }, []);

  const showPhoneCheck = useMemo(() => {
    const approvalJobs = allJobList.filter((job) => job.type === 'approval' && !job.skipped);
    return workflowName && approvalJobs.length > 0;
  }, [workflowName, allJobList]);

  // 获取当前应该显示的 job 引用键集合
  const getActiveJobKeys = (): Set<string> => {
    const activeJobs = new Set<string>();
    const stagesToCheck = stageExecMode ? payload.stages.filter((stage) => stage.execStage) : payload.stages;

    stagesToCheck.forEach((stage) => {
      stage.jobs.forEach((job) => {
        const shouldShow = (job.run_policy === 'force_run' || job.run_policy === '' || job.run_policy === 'default_not_run') && job.skipped === false;
        if (shouldShow) {
          const refKey = `${job.type}-${job.name}`;
          activeJobs.add(refKey);
        }
      });
    });

    return activeJobs;
  };

  // Methods implementation - matching Vue version logic
  const validateAll = async (): Promise<boolean> => {
    const checkResults: boolean[] = [];
    const refs = componentRefs.current;
    const activeJobs = getActiveJobKeys();

    // 只校验当前显示的组件
    for (const refName in refs) {
      if (activeJobs.has(refName)) {
        const component = refs[refName];
        if (component && component.validate) {
          const isValid = await component.validate();
          checkResults.push(isValid);
        }
      }
    }

    return !checkResults.includes(false);
  };

  const handleRunTask = async (type: 'run' | 'debug' = 'run') => {
    // 检查所有子组件的请求状态
    const pendingComponents: string[] = [];
    const refs = componentRefs.current;
    const activeJobs = getActiveJobKeys();

    // 只检查当前显示的 zadig-deploy 组件，以及其子组件 customWorkflowDeployConfig，子组件的 ref 为 deployConfig
    for (const refName in refs) {
      if (refName.startsWith('zadig-deploy-') && activeJobs.has(refName)) {
        const component = refs[refName];
        if (component && component.checkRequestStatus) {
          if (!component.checkRequestStatus()) {
            pendingComponents.push(refName);
          }
          // 检查子组件
          if (component.deployConfig && component.deployConfig.checkRequestStatus) {
            if (!component.deployConfig.checkRequestStatus()) {
              pendingComponents.push(`${refName}-deployConfig`);
            }
          }
        }
      }
    }

    if (pendingComponents.length > 0) {
      Toast.warning('部署配置正在加载中，请稍候');
      return;
    }

    const isValid = await validateAll();
    if (isValid) {
      runTask(type);
    }
  };

  const selectJobName = (name: string, curJob: Job) => {
    setMissingSourceJobs([]);
    if (curJob.run_policy === 'force_run') {
      return;
    }

    setPayload((prevPayload) => {
      // 深拷贝 payload 以确保不可变性
      const newPayload = cloneDeep(prevPayload);

      // 构建当前的 job 列表
      const currentJobList: Job[] = [];
      newPayload.stages.forEach((stage) => {
        currentJobList.push(...stage.jobs);
      });

      let updatedActiveName: string[] = [...activeName];

      newPayload.stages.forEach((stage) => {
        stage.jobs.forEach((job) => {
          if (job.name === name) {
            if (job.skipped) {
              job.skipped = false;
              // 添加到 activeName 中（如果不存在）
              if (!updatedActiveName.includes(job.name)) {
                updatedActiveName.push(job.name);
              }
            } else {
              // 从 activeName 中移除
              updatedActiveName = updatedActiveName.filter((item) => item !== job.name);
              job.skipped = true;
              job.run_policy = '';
            }
          }
          job.refInfo = job.skipped ? null : checkSourceJob(job, currentJobList);
        });
      });

      // 在 payload 更新后，同步更新 activeName
      setActiveName(updatedActiveName);

      return newPayload;
    });
  };

  const selectExecStageJobName = (name: string, curJob: Job) => {
    if (curJob.run_policy === 'force_run') {
      return;
    }

    setPayload((prevPayload) => {
      // 深拷贝 payload 以确保不可变性
      const newPayload = cloneDeep(prevPayload);

      let updatedActiveName: string[] = [...activeName];

      newPayload.stages.forEach((stage) => {
        stage.jobs.forEach((job) => {
          if (job.name === name) {
            if (job.run_policy) {
              job.run_policy = '';
              // 添加到 activeName 中（如果不存在）
              if (!updatedActiveName.includes(job.name)) {
                updatedActiveName.push(job.name);
              }
            } else {
              // 从 activeName 中移除
              updatedActiveName = updatedActiveName.filter((item) => item !== job.name);
              job.run_policy = 'skip';
            }
          }
        });
      });

      // 在 payload 更新后，同步更新 activeName
      setActiveName(updatedActiveName);

      return newPayload;
    });
  };

  const preprocessData = (payloadData: WorkflowPayload) => {
    // 收集所有需要激活的job名称
    const jobsToActivate: string[] = ['workflow-variables']; // 默认激活工作流变量

    // 保存当前 payload 中的 pickedTargets 数据
    const existingPickedTargets: Record<string, any[]> = {};
    if (payload && payload.stages) {
      payload.stages.forEach((stage) => {
        stage.jobs.forEach((job) => {
          if (job.pickedTargets && job.pickedTargets.length > 0) {
            existingPickedTargets[job.name] = job.pickedTargets;
          }
        });
      });
    }

    payloadData.stages.forEach((stage) => {
      stage.jobs.forEach((job) => {
        // 对应Vue版本的逻辑：job.run_policy !== 'default_not_run'
        if (job.run_policy !== 'default_not_run') {
          jobsToActivate.push(job.name);
        }

        // 智能处理 pickedTargets：保留已存在的数据，或初始化为空数组
        if (existingPickedTargets[job.name]) {
          // 保留已存在的 pickedTargets
          job.pickedTargets = existingPickedTargets[job.name];
        } else if (!job.pickedTargets) {
          // 只有当不存在时才初始化为空数组
          job.pickedTargets = [];
        }

        if (job.type === 'zadig-build') {
          // 确保service_and_builds存在且不为空
          if (job.spec.service_and_builds) {
            job.spec.service_and_builds.forEach((service) => {
              service.key = `${service.service_name}/${service.service_module}`;
            });
          }
          if (job.spec.service_and_builds_options && job.spec.service_and_builds_options.length > 0) {
            const options = job.spec.service_and_builds_options.map((service) => {
              service.key = `${service.service_name}/${service.service_module}`;
              return service;
            });
            job.spec.service_and_builds_options = options;
          } else {
            job.spec.service_and_builds_options = [];
          }
        }

        // 对应Vue版本中的blueking类型处理
        if (job.type === 'blueking') {
          if (!job.parameters) {
            job.parameters = [];
          }
        }

        if (job.type === 'zadig-test') {
          job.spec.target_services?.forEach((service) => {
            service.key = `${service.service_name}/${service.service_module}`;
          });
        }

        if (job.type === 'zadig-scanning') {
          job.spec.target_services?.forEach((service) => {
            service.key = `${service.service_name}/${service.service_module}`;
          });
          if (job.spec.scanning_type === '') {
            if (job.spec.scannings && job.spec.scannings.length > 0) {
              job.spec.scannings.forEach((service, index) => {
                service.service_name = `扫描${index + 1}`;
                service.service_module = `扫描${index + 1}`;
                service.key = `${service.service_name}/${service.service_module}`;
              });
            }
            if (job.spec.scanning_options && job.spec.scanning_options.length > 0) {
              job.spec.scanning_options.forEach((service, index) => {
                service.service_name = `扫描${index + 1}`;
                service.service_module = `扫描${index + 1}`;
                service.key = `${service.service_name}/${service.service_module}`;
              });
            }
          }
        }

        if (job.type === 'freestyle') {
          job.spec.service_and_builds_options = [];
        }
      });
    });

    if (payloadData.remark) {
      jobsToActivate.push('workflow-run-note');
    }

    // 一次性设置所有激活的面板名称
    setActiveName(jobsToActivate);
  };

  const getWorkflowPresetInfo = (workflowName: string) => {
    const projectNameParam = projectName;
    const approvalTicketParam = approvalTicket;
    const approvalTicketId = approvalTicketParam ? approvalTicketParam.id : '';

    getWorkflowItemPresetAPI(workflowName, projectNameParam, approvalTicketId)
      .then((res) => {
        setPayload(res);
        preprocessData(res);
      })
      .catch((error) => {
        console.error('getWorkflowItemPresetAPI 调用失败:', error);
      });
  };

  const init = () => {
    // Clear repo cache equivalent would be handled elsewhere
    const hasValidCloneWorkflow = Object.keys(cloneWorkflow).length > 0 && cloneWorkflow.stages && cloneWorkflow.stages.length > 0;

    if (hasValidCloneWorkflow) {
      // 深拷贝克隆数据以避免原始数据被修改
      const clonedPayload = cloneDeep(cloneWorkflow) as WorkflowPayload;
      setPayload(clonedPayload);
      preprocessData(clonedPayload);
    } else {
      if (workflowName) {
        getWorkflowPresetInfo(workflowName);
      }
    }
  };

  const optimizeData = (payload: WorkflowPayload, mode = ''): WorkflowPayload => {
    const optimizeRepo = (repos: RepoInfo[]): void => {
      if (repos) {
        repos.forEach((repo: RepoInfo) => {
          if (typeof repo.prs === 'string') {
            repo.prs = repo.prs.split(',').map(Number);
          }
          if (repo.branchOrTag) {
            if (repo.branchOrTag.type === 'branch') {
              repo.branch = repo.branchOrTag.name;
            }
            if (repo.branchOrTag.type === 'tag') {
              repo.tag = repo.branchOrTag.name;
            }
          }
          if (repo.source === 'perforce') {
            if (repo.changelist_id === '') {
              repo.changelist_id = 0;
            }
            if (repo.shelve_id === '') {
              repo.shelve_id = 0;
            }
          }
          delete repo.branchNames;
          delete repo.branchPRsMap;
          delete repo.branchAndTagList;
          delete repo.branchOrTag;
          delete repo.prNumberPropName;
          delete repo._id_;
          delete repo.tags;
        });
      }
    };

    if (!payload || !payload.stages) {
      return payload;
    }
    payload.stages.forEach((stage) => {
      stage.jobs.forEach((job) => {
        if (job.type === 'zadig-build') {
          if (job.spec.service_and_builds && job.spec.service_and_builds.length > 0) {
            job.spec.service_and_builds.forEach((item) => {
              if (item.repos) {
                optimizeRepo(item.repos);
              }
            });
            job.spec.default_service_and_builds = job.spec.service_and_builds;
          }
          delete job.spec.service_and_builds_options;
        }
        if (job.type === 'zadig-deploy') {
          if (job.pickedTargets) {
            job.pickedTargets.forEach((service) => {
              delete service.isExpand;
              delete service.registry_id;
              if (service.updatable && service.update_config) {
                service.key_vals = service.latest_key_vals;
              }
              service.modules.forEach((module) => {
                delete module.fetched;
                delete module.loading;
                delete module.images;
                delete module.filterImages;
              });
            });
            job.spec.services = job.pickedTargets;
            delete job.pickedTargets;
          }
          delete job.pickedModules;
          delete job.spec.env_options;
        }
        if (job.type === 'jenkins') {
          delete job.spec.job_options;
        }
        if (job.type === 'blueking') {
          job.spec.parameters = job.parameters;
          delete job.parameters;
        }
        if (job.type === 'zadig-vm-deploy') {
          job.spec.service_and_vm_deploys?.forEach((item) => {
            Object.assign(item, item.file);
            delete item.files;
            delete item.file;
          });
          delete job.spec.service_and_vm_deploys_options;
          delete job.spec.env_options;
        }
        if (job.type === 'k8s-resource-patch') {
          delete job.spec.patch_item_options;
        }
        if (job.type === 'k8s-canary-deploy') {
          job.spec.targets?.forEach((item) => {
            delete item.images;
          });
          delete job.spec.target_options;
        }
        if (job.type === 'k8s-gray-release') {
          job.spec.targets?.forEach((item) => {
            delete item.images;
          });
          delete job.spec.target_options;
        }
        if (job.type === 'k8s-gray-rollback') {
          delete job.spec.target_options;
        }
        if (job.type === 'mse-gray-release') {
          delete job.pickedTargets;
          delete job.spec.last_gray_tag;
          job.service_modules = [];
          job.spec.gray_services?.forEach((service) => {
            service.service_and_image.forEach((svc) => {
              delete svc.images;
            });
          });
        }
        if (job.type === 'k8s-blue-green-deploy') {
          job.spec.services?.forEach((service) => {
            service.service_and_image.forEach((svc) => {
              delete svc.images;
            });
          });
          delete job.spec.env_options;
        }
        if (job.type === 'freestyle') {
          if (job.spec.repos) {
            optimizeRepo(job.spec.repos);
          }
          if (job.spec.services) {
            job.spec.services.forEach((item) => {
              if (item.repos) {
                optimizeRepo(item.repos);
              }
            });
          }
          delete job.spec.service_and_builds_options;
        }
        if (job.type === 'nacos' && mode !== 'releasePlan') {
          let skipped = true;
          job.spec.nacos_datas?.forEach((data) => {
            if (data.diff && data.diff.length !== 1) {
              skipped = false;
            }
            delete data.diff;
          });
          if (job.run_policy === 'force_run') {
            skipped = false;
          }
          job.skipped = skipped;
          delete job.spec.nacos_filtered_data;
        }
        if (job.type === 'nacos' && mode === 'releasePlan') {
          job.spec.nacos_datas?.forEach((data) => {
            delete data.diff;
          });
          delete job.spec.nacos_filtered_data;
        }
        if (job.type === 'zadig-scanning') {
          job.spec.service_and_scannings = job.pickedTargets;
          if (job.spec.scannings && job.spec.scannings.length > 0) {
            job.spec.scannings.forEach((item) => {
              if (item.repos) {
                optimizeRepo(item.repos);
              }
            });
          }
          if (job.spec.service_and_scannings) {
            job.spec.service_and_scannings.forEach((item) => {
              if (item.repos) {
                optimizeRepo(item.repos);
              }
            });
          }
          delete job.pickedTargets;
        }
        if (job.type === 'zadig-test') {
          job.spec.service_and_tests = job.pickedTargets;
          if (job.spec.test_modules && job.spec.test_modules.length > 0) {
            job.spec.test_modules.forEach((item) => {
              if (item.repos) {
                optimizeRepo(item.repos);
              }
            });
          }
          if (job.spec.service_and_tests) {
            job.spec.service_and_tests.forEach((item) => {
              if (item.repos) {
                optimizeRepo(item.repos);
              }
            });
          }
          delete job.pickedTargets;
        }
        if (job.type === 'sae-deploy') {
          if (job.pickedTargets) {
            job.pickedTargets.forEach((service) => {
              delete service.isExpand;
              delete service.activeNames;
              delete service.images;
              delete service.filterImages;
              delete service.fetched;
              delete service.key;
              delete service.loading;
              delete service.miniReadyType;
              delete service.showAdvanced;
            });
            job.spec.service_config.services = job.pickedTargets;
            delete job.pickedTargets;
            delete job.spec.env_options;
          }
          delete job.pickedModules;
        }
        if (job.type === 'zadig-helm-chart-deploy') {
          job.spec.deploy_helm_charts?.forEach((item) => {
            delete item.isExpand;
            delete item.chartVersions;
            delete item.chartNames;
          });
          delete job.spec.env_options;
        }
        if (job.type === 'zadig-distribute-image') {
          job.spec.targets?.forEach((item) => {
            delete item.images;
          });
          delete job.spec.target_options;
        }
        if (job.type === 'istio-release') {
          job.spec.targets?.forEach((item) => {
            delete item.images;
          });
          delete job.spec.target_options;
        }
        if (job.type === 'istio-rollback') {
          delete job.spec.target_options;
        }
        if (job.type === 'update-env-istio-config') {
          if (job.spec.grayscale_strategy === 'weight') {
            job.spec.weight_configs = cloneDeep(job.pickedTargets);
          } else if (job.spec.grayscale_strategy === 'header_match') {
            job.spec.header_match_configs = cloneDeep(job.pickedTargets);
          }
          delete job.pickedTargets;
        }
        if (job.type === 'jira') {
          job.spec.issues = job.pickedTargets;
          delete job.pickedTargets;
        }
        if (job.type === 'pingcode') {
          job.spec.workitems.forEach((item) => {
            delete item.states;
            delete item.fetched;
          });
        }
        if (job.type === 'apollo') {
          job.spec.namespaceList.forEach((item) => {
            delete item.content;
            delete item.diff;
          });
          delete job.spec.namespaceListOption;
        }
        if (job.type === 'k8s-canary-deploy') {
          delete job.spec.target_options;
        }
        if (job.type === 'meego-transition') {
          job.spec.work_items = job.pickedTargets?.map((item) => {
            if (item.workItem) {
              return {
                id: item.workItem.id,
                name: item.workItem.name,
                transition_id: item.transitionItem.transition_id,
                target_state_name: item.transitionItem.target_state_name || '',
                target_state_key: item.transitionItem.target_state_key || '',
              };
            } else {
              return {};
            }
          });
          delete job.pickedTargets;
        }
        if (job.type === 'offline-service') {
          delete job.spec.serviceOptions;
        }
        if (job.type === 'grafana') {
          delete job.spec.alert_options;
        }
        if (job.type === 'custom-deploy') {
          job.spec.targets?.forEach((target) => {
            delete target.images;
          });
        }
        if (job.type === 'k8s-canary-deploy') {
          job.spec.targets?.forEach((item) => {
            delete item.images;
          });
        }
        if (job.type === 'k8s-resource-patch') {
          delete job.spec.patch_item_options;
        }

        if (job.type === 'workflow-trigger') {
          if (job.spec.trigger_type === 'common') {
            job.spec.source_service = job.pickedTargets?.map((item) => {
              return {
                service_name: item.service_name,
                service_module: item.service_module,
              };
            });
          } else if (job.spec.trigger_type === 'fixed') {
            job.spec.fixed_workflow_list = job.pickedTargets;
          }
          delete job.pickedTargets;
        }
      });
    });

    return payload;
  };

  const checkSourceJob = (currentJob: Job, currentJobList: Job[]): { jobName: string; skipped: boolean } | null => {
    const findOriginalJob = (jobName: string): { jobName: string; skipped: boolean } | null => {
      const job = currentJobList.find((job) => job.name === jobName);
      if (job && job.spec.source === 'fromjob') {
        const originJobName = job.spec.origin_job_name || job.spec.job_name || '';
        return findOriginalJob(originJobName);
      } else {
        return job ? { jobName: job.name, skipped: job.skipped } : null;
      }
    };

    if (currentJob.spec.source === 'fromjob') {
      const originJobName = currentJob.spec.origin_job_name || currentJob.spec.job_name || '';
      const originalJob = findOriginalJob(originJobName);
      if (originalJob && originalJob.skipped) {
        setMissingSourceJobs((prev) => [...prev, originalJob.jobName]);
      }
      return originalJob;
    } else {
      return null;
    }
  };

  const runTask = (type: 'run' | 'debug' = 'run') => {
    // 🔧 修复：直接收集所有组件的最新数据，不使用缓存
    const updatedPayload = cloneDeep(payload);
    const refs = componentRefs.current;
    const activeJobs = getActiveJobKeys();

    // 遍历所有活跃的组件，收集最新的 job 数据
    for (const refName in refs) {
      if (activeJobs.has(refName)) {
        const component = refs[refName];
        if (component && component.getLatestJobData) {
          const latestJobData = component.getLatestJobData();
          if (latestJobData) {
            // 找到对应的 job 并更新数据
            updatedPayload.stages.forEach((stage: Stage) => {
              stage.jobs.forEach((job: Job) => {
                if (job.name === latestJobData.name) {
                  Object.assign(job, latestJobData);
                }
              });
            });
          }
        }
      }
    }

    const latestPayload = updatedPayload;

    const payloadClone = cloneDeep(latestPayload);

    // 处理数据
    optimizeData(payloadClone);
    payloadClone.debug = type === 'debug';
    setStartTaskLoading(true);
    runWorkItemWorkflowAPI(workitemTypeKey, workItemId, payloadClone)
      .then((res) => {
        Toast.success('创建成功');

        // 使用 containerModal.submit 触发父组件的 onSubmit 回调
        if (window.JSSDK?.containerModal?.submit) {
          window.JSSDK.containerModal.submit({
            success: true,
            taskId: res?.task_id,
            workflowName: workflowName,
          });
        }
      })
      .catch((error) => {
        Toast.error(error.message || '工作流执行失败');
      })
      .finally(() => {
        setStartTaskLoading(false);
      });
  };

  // const updateWorkflowTrigger = () => {
  //   const allJobs: Job[] = [];
  //   payload.stages.forEach((stage) => {
  //     stage.jobs.forEach((job) => {
  //       allJobs.push(job);
  //     });
  //   });

  //   payload.stages.forEach((stage) => {
  //     stage.jobs.forEach((triggerJob) => {
  //       if (triggerJob.type === 'workflow-trigger') {
  //         if (triggerJob.spec.trigger_type === 'common') {
  //           if (triggerJob.spec.source === 'fromjob') {
  //             const targetJob = allJobs.find((item) => {
  //               return item.name === triggerJob.spec.source_job_name;
  //             });
  //             const targetJobServiceModules = targetJob?.pickedTargets?.map((item: any) => {
  //               return {
  //                 service_name: item.service_name,
  //                 service_module: item.service_module
  //               };
  //             });
  //             triggerJob.pickedTargets = triggerJob.spec.service_trigger_workflow.filter((item: any) => {
  //               return targetJobServiceModules?.some((targetJobServiceModule: any) => {
  //                 return targetJobServiceModule.service_name === item.service_name &&
  //                     targetJobServiceModule.service_module === item.service_module;
  //               });
  //             });
  //           }
  //         }
  //       }
  //     });
  //   });
  // };

  // 清理不再显示的组件引用
  useEffect(() => {
    const activeJobs = getActiveJobKeys();

    // 清理不再活跃的组件引用
    const currentRefs = componentRefs.current;
    Object.keys(currentRefs).forEach((refKey) => {
      if (!activeJobs.has(refKey)) {
        delete currentRefs[refKey];
      }
    });
  }, [payload.stages, stageExecMode]);

  // 当 contextParams 加载完成后，初始化 payload
  useEffect(() => {
    if (contextParams && initialPayload) {
      setPayload((prev) => ({
        ...prev,
        ...initialPayload,
      }));
    }
  }, [contextParams]);

  // Lifecycle hooks - 只在 contextParams 加载完成后执行
  useEffect(() => {
    if (!contextParams) return;
    if (!(releasePlanMode || triggerMode)) {
      init();
    }
  }, [contextParams]);

  useEffect(() => {
    if (!contextParams) return;
    if (workflowName && !(releasePlanMode || triggerMode)) {
      init();
    }
  }, [workflowName, contextParams]);

  useEffect(() => {
    if (!contextParams) return;
    if (Object.keys(cloneWorkflow).length > 0 && cloneWorkflow.stages && cloneWorkflow.stages.length > 0) {
      init();
    }
  }, [cloneWorkflow, contextParams]);

  // 处理作业数据变化
  const handleJobChange = (updatedJob: Job) => {
    // ⚠️ 关键保护：对于代码扫描任务，如果传入的 pickedTargets 为空但当前已有数据，则保护现有数据
    if (updatedJob.name === '代码扫描' && updatedJob.type === 'zadig-scanning') {
      const currentScanningJob = payload.stages.flatMap((s) => s.jobs).find((j) => j.name === '代码扫描');
      if (
        currentScanningJob &&
        currentScanningJob.pickedTargets &&
        currentScanningJob.pickedTargets.length > 0 &&
        (!updatedJob.pickedTargets || updatedJob.pickedTargets.length === 0)
      ) {
        // 保护现有的 pickedTargets
        updatedJob = {
          ...updatedJob,
          pickedTargets: currentScanningJob.pickedTargets,
        };
      }
    }

    setPayload((prevPayload) => {
      let hasChanges = false;

      // 先检查是否真的有变化，避免无意义的更新
      prevPayload.stages.forEach((stage) => {
        stage.jobs.forEach((job) => {
          if (job.name === updatedJob.name) {
            // 深度比较关键字段，检查是否真的有变化
            const oldSpecStr = JSON.stringify(job.spec || {});
            const newSpecStr = JSON.stringify(updatedJob.spec || {});
            const oldPickedTargetsStr = JSON.stringify(job.pickedTargets || []);
            const newPickedTargetsStr = JSON.stringify(updatedJob.pickedTargets || []);

            const specChanged = oldSpecStr !== newSpecStr;
            const pickedTargetsChanged = oldPickedTargetsStr !== newPickedTargetsStr;

            if (specChanged || pickedTargetsChanged) {
              hasChanges = true;
            }
          }
        });
      });

      // 如果没有实际变化，直接返回原对象，避免触发重新渲染
      if (!hasChanges) {
        return prevPayload;
      }

      // 🛡️ 全局保护机制：在任何 payload 更新之前，先保存代码扫描任务的关键数据
      const scanningJobBackup = prevPayload.stages.flatMap((s) => s.jobs).find((j) => j.name === '代码扫描' && j.type === 'zadig-scanning');
      const scanningBackupData =
        scanningJobBackup && scanningJobBackup.pickedTargets && scanningJobBackup.pickedTargets.length > 0
          ? {
              pickedTargets: cloneDeep(scanningJobBackup.pickedTargets),
              targetServices: cloneDeep(scanningJobBackup.spec?.target_services || []),
            }
          : null;

      // 只有真正有变化时才进行深拷贝
      const newPayload = {
        ...prevPayload,
        stages: prevPayload.stages.map((stage) => ({
          ...stage,
          jobs: stage.jobs.map((job) => {
            if (job.name === updatedJob.name) {
              const mergedJob = { ...job, ...updatedJob };
              return mergedJob;
            }
            return job;
          }),
        })),
      };

      // 🛡️ 全局保护恢复：如果代码扫描任务的数据被意外清空，恢复备份数据
      if (scanningBackupData) {
        const finalScanningJob = newPayload.stages.flatMap((s) => s.jobs).find((j) => j.name === '代码扫描' && j.type === 'zadig-scanning');

        if (finalScanningJob && (!finalScanningJob.pickedTargets || finalScanningJob.pickedTargets.length === 0)) {
          // 恢复关键数据
          finalScanningJob.pickedTargets = scanningBackupData.pickedTargets;
          if (scanningBackupData.targetServices.length > 0) {
            finalScanningJob.spec = {
              ...finalScanningJob.spec,
              target_services: scanningBackupData.targetServices,
            };
          }
        }
      }

      // 🔧 修复：立即更新组件内部缓存，确保 runTask 能获取到最新数据
      if (typeof window !== 'undefined') {
        (window as any).__workflowRunnerLatestPayload = newPayload;
      } 
      return newPayload;
    });
  };

  // 渲染作业组件 - only render the specified job types
  const renderJobComponent = (job: Job) => {
    const refKey = `${job.type}-${job.name}`;

    // 为了确保数据变化时组件能正确重新渲染，为特定类型的job添加数据版本号到key中
    let componentKey = refKey;
    if ((job.type === 'zadig-deploy' || job.type === 'zadig-scanning') && job.spec.source === 'fromjob') {
      // 对于来源于其他job的任务，在key中包含源任务的关键信息
      const sourceJobInfo = allJobList.find((j) => j.name === (job.spec.origin_job_name || job.spec.job_name));
      if (sourceJobInfo) {
        let sourceKey = '';
        if (sourceJobInfo.type === 'zadig-build') {
          sourceKey = sourceJobInfo.spec.service_and_builds?.map((s) => `${s.service_name}/${s.service_module}`).join(',') || '';
        } else if (sourceJobInfo.type === 'zadig-deploy') {
          sourceKey = sourceJobInfo.pickedModules?.map((m) => `${m.service_name}/${m.service_module}`).join(',') || '';
        } else if (sourceJobInfo.type === 'zadig-scanning') {
          sourceKey = sourceJobInfo.spec.target_services?.map((s) => `${s.service_name}/${s.service_module}`).join(',') || '';
        }
        if (sourceKey) {
          componentKey = `${refKey}-${sourceKey}`;
        }
      }
    }

    const commonProps = {
      ref: (el: any) => {
        if (el) {
          componentRefs.current[refKey] = el;
          // 如果componentKey和refKey不同，说明是数据变化导致的重新渲染
          if (componentKey !== refKey) {
          }
        }
      },
      job,
      projectName,
      viewMode,
      editRunner,
      stageExecMode,
      webhookSelectedRepo,
      allJobList,
      approvalTicket,
      triggerMode,
      releasePlanMode,
      onJobChange: handleJobChange,
    };

    switch (job.type) {
      case 'zadig-build':
        return <ZadigBuild key={componentKey} {...commonProps} />;
      case 'zadig-deploy':
        return <ZadigDeploy key={componentKey} {...commonProps} />;
      case 'zadig-scanning':
        return <ZadigScanning key={componentKey} {...commonProps} />;
      case 'nacos':
        return <Nacos key={componentKey} {...commonProps} />;
      case 'sql':
        return <Sql key={componentKey} {...commonProps} />;
      case 'approval':
        return <Approval key={componentKey} {...commonProps} job={job as any} allJobList={allJobList as any} />;
      default:
        return (
          <div key={job.name} style={{ padding: 16 }}>
            <Text type="tertiary">暂不支持 {job.type} 类型的作业</Text>
          </div>
        );
    }
  };

  // 移除了 Modal 相关的高度计算，因为使用全局 modal

  // 添加 loading 状态判断
  if (contextLoading) {
    return <div style={{ padding: 64, textAlign: 'center' }}>正在加载...</div>;
  }

  if (!contextParams) {
    return <div style={{ padding: 64, textAlign: 'center' }}>未获取到上下文参数</div>;
  }

  return (
    <div className="workflow-runner">
      {/* Header */}
      <div className="header">
        <div className="running-jobs-selection">
          <div className="content-section">
            {!(triggerMode || releasePlanMode) && <span className="dialog-title">{stageExecMode ? '运行阶段' : '运行工作流'}</span>}
            {!viewMode && (
              <div className="tag-list">
                {stageExecMode
                  ? allExecStageJobList.map((job, index) => (
                      <Tag
                        key={index}
                        className={`run-tag ${job.run_policy === 'force_run' ? 'disabled' : ''} ${job.run_policy !== 'skip' ? 'selected' : ''}`}
                        onClick={() => selectExecStageJobName(job.name, job)}
                      >
                        {job.name}
                      </Tag>
                    ))
                  : allJobList.map((job, index) => (
                      <Tag
                        key={index}
                        className={`run-tag ${job.run_policy === 'force_run' ? 'disabled' : ''} ${!job.skipped ? 'selected' : ''}`}
                        onClick={() => selectJobName(job.name, job)}
                      >
                        {job.name}
                      </Tag>
                    ))}
              </div>
            )}
          </div>
        </div>
        {showPhoneCheck && <CheckUserPhone workflowName={workflowName} />}
      </div>

      {/* Content */}
      <div className="content">
        <Form labelPosition="left" labelWidth={140}>
          <Collapse activeKey={activeName} onChange={(keys) => setActiveName(keys as string[])}>
            {/* Workflow Variables */}
            {showWorkflowParamsWithoutFixed && !stageExecMode && (
              <Collapse.Panel header="工作流变量" itemKey="workflow-variables">
                <WorkflowVariables viewMode={viewMode} payload={payload} />
              </Collapse.Panel>
            )}

            {/* Stages and Jobs */}
            {(stageExecMode ? payload.stages.filter((stage) => stage.execStage) : payload.stages).map((stage) => (
              <div key={stage.name} className="stage-container">
                {stage.jobs.map((job) => {
                  const shouldShow = (job.run_policy === 'force_run' || job.run_policy === '' || job.run_policy === 'default_not_run') && job.skipped === false;

                  if (!shouldShow) return null;

                  return (
                    <div key={job.name} className="job-container">
                      <Collapse.Panel
                        header={
                          <div className="job-header">
                            <span className="name">{job.name}</span>
                            {job.refInfo?.skipped && (
                              <span className="tip">
                                引用的 <span className="ref-job-name">{job.refInfo.jobName}</span> 任务已被取消，请先恢复{' '}
                                <span className="ref-job-name">{job.refInfo.jobName}</span> 任务
                              </span>
                            )}
                          </div>
                        }
                        itemKey={job.name}
                      >
                        <ErrorBoundary>{renderJobComponent(job)}</ErrorBoundary>
                      </Collapse.Panel>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Workflow Note */}
            {!stageExecMode && (
              <Collapse.Panel header="工作流备注" itemKey="workflow-run-note">
                <TextArea
                  disabled={viewMode}
                  rows={2}
                  placeholder="输入工作流备注"
                  value={payload.remark}
                  onChange={(value) => setPayload((prev) => ({ ...prev, remark: value }))}
                />
              </Collapse.Panel>
            )}
          </Collapse>
        </Form>
      </div>

      {/* Footer buttons */}
      {!viewMode && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '16px' }}>
          <Button onClick={() => window.JSSDK.containerModal.close()} disabled={startTaskLoading}>
            取消
          </Button>
          {!(triggerMode || releasePlanMode) && (
            <Button onClick={() => handleRunTask()} loading={startTaskLoading} type="primary" disabled={missingSourceJobs.length > 0 || checkingSleepingEnv.length > 0}>
              {startTaskLoading ? '启动中...' : '运行'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default WorkflowRunner;
