import { useState, useEffect, forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { Select, Typography, Button, Input, Tooltip, Toast, Table, TextArea } from '@douyinfe/semi-ui';
import { IconInfoCircle, IconChevronRight, IconChevronDown } from '@douyinfe/semi-icons';
import { getAllBranchInfoAPI, getBranchCommitInfoAPI } from '../../../../api/service';
import { keyBy, mergeWith, isArray, cloneDeep } from 'lodash';
import './ZadigBuild.css';

const { Text } = Typography;
const { Column } = Table;

// Perforce 相关类型
interface PerforceRepo extends RepoInfo {
  source: 'perforce';
  depot_type?: 'stream' | 'local';
  stream?: string;
  view_mapping?: string;
  changelist_id?: number;
  shelve_id?: number;
}

interface RepoInfo {
  repo_owner: string;
  repo_namespace: string;
  repo_name: string;
  codehost_id: string;
  source?: string;
  source_from?: string;
  branch?: string;
  tag?: string;
  commit_id?: string;
  prs?: number[];
  branchOrTag?: {
    type: 'branch' | 'tag';
    name: string;
    id: string;
  };
  branchAndTagList?: Array<{
    label: string;
    options: Array<{
      type: 'branch' | 'tag';
      name: string;
      id: string;
    }>;
  }>;
  commits?: Array<{
    commit_id: string;
    commit_message: string;
    author: string;
    created_at: number;
  }>;
  branchPRsMap?: Record<string, any[]>;
  showTip?: boolean;
  repoSync?: boolean;
  hidden?: boolean;
  enable_commit?: boolean;
  errorMsg?: string;
  filter_regexp?: string;
  prNumberPropName?: string;
  _id_?: string;
  branchNames?: string[];
  tags?: Array<{ name: string }>;
}

interface ServiceModule {
  service_name: string;
  service_module: string;
  build_name?: string;
  key?: string;
  repos?: RepoInfo[];
  key_vals?: Array<{
    key: string;
    value: string;
    type: string;
    source?: string;
    description?: string;
    is_credential?: boolean;
    choice_option?: string[];
    choice_value?: string[];
  }>;
  repoIsFeteched?: boolean;
  [key: string]: any;
}

interface JobSpec {
  source?: string;
  service_and_builds?: ServiceModule[];
  service_and_builds_options?: ServiceModule[];
  default_service_and_builds?: ServiceModule[];
  origin_job_name?: string;
  job_name?: string;
  ref_repos?: boolean;
  services?: ServiceModule[];
  targets?: ServiceModule[];
  target_services?: ServiceModule[];
  [key: string]: any;
}

interface Job {
  name: string;
  type: string;
  spec: JobSpec;
  pickedModules?: ServiceModule[];
  pickedTargets?: ServiceModule[];
  [key: string]: any;
}

interface ZadigBuildProps {
  job: Job;
  allJobList?: Job[];
  viewMode?: boolean;
  webhookSelectedRepo?: any;
  stageExecMode?: boolean;
  editRunner?: boolean;
  onJobChange?: (job: Job) => void;
}

// 为表单验证暴露的接口
export interface ZadigBuildRef {
  validate: () => Promise<boolean>;
}

const ZadigBuild = forwardRef<ZadigBuildRef, ZadigBuildProps>(
  ({ job, allJobList = [], viewMode = false, webhookSelectedRepo, stageExecMode = false, editRunner = false, onJobChange }, ref) => {
    const [localJob, setLocalJob] = useState<Job>(cloneDeep(job));
    const [repoLoading, setRepoLoading] = useState<Record<string, boolean>>({});
    const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
    const [isInitializing, setIsInitializing] = useState(false);
    const initRef = useRef<boolean>(false);

    // 源任务数据签名 - 精确捕获源任务的关键数据变化
    const sourceJobDataSignature = useMemo(() => {
      if (localJob.spec.source !== 'fromjob') return '';

      const originJobName = localJob.spec.origin_job_name || localJob.spec.job_name;
      if (!originJobName) return '';

      const foundJob = allJobList.find((j) => j.name === originJobName);
      if (!foundJob) return `${originJobName}-notfound`;

      let signature = `${originJobName}-${foundJob.type}`;

      // 为不同类型的任务生成数据签名
      switch (foundJob.type) {
        case 'zadig-build':
          signature += `-builds:${foundJob.spec?.service_and_builds?.length || 0}`;
          break;
        case 'zadig-scanning':
          signature += `-targets:${foundJob.spec?.target_services?.length || 0}`;
          signature += `-picked:${foundJob.pickedTargets?.length || 0}`;

          // 对于扫描任务，需要监听 pickedTargets 的详细变化
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
        case 'freestyle':
          signature += `-services:${foundJob.spec?.services?.length || 0}`;
          break;
        default:
          signature += `-generic:${JSON.stringify(foundJob.spec).slice(0, 100)}`;
          break;
      }

      return signature;
    }, [localJob.spec.source, localJob.spec.origin_job_name, localJob.spec.job_name, allJobList]);

    // 计算源作业 - 基于数据签名重新计算
    const sourceJob = useMemo(() => {
      const findOriginalJob = (jobName: string): Job | null => {
        const foundJob = allJobList.find((j) => j.name === jobName);
        if (foundJob && foundJob.spec.source === 'fromjob') {
          const originJobName = foundJob.spec.origin_job_name || foundJob.spec.job_name;
          return originJobName ? findOriginalJob(originJobName) : null;
        } else {
          return foundJob ? cloneDeep(foundJob) : null;
        }
      };

      if (localJob.spec.source === 'fromjob') {
        const originJobName = localJob.spec.origin_job_name || localJob.spec.job_name;
        const foundJob = originJobName ? findOriginalJob(originJobName) : null;

        return foundJob ? cloneDeep(foundJob) : null;
      } else {
        return null;
      }
    }, [sourceJobDataSignature]); // 依赖数据签名

    // 计算引用作业 - 只依赖关键字段，避免循环依赖
    const refJob = useMemo(() => {
      const findOriginalJob = (jobName: string): Job | null => {
        const foundJob = allJobList.find((j) => j.name === jobName);
        return foundJob ? cloneDeep(foundJob) : null;
      };

      if (localJob.spec.source === 'fromjob') {
        const originJobName = localJob.spec.origin_job_name || localJob.spec.job_name;
        return originJobName ? findOriginalJob(originJobName) : null;
      } else {
        return null;
      }
    }, [localJob.spec.source, localJob.spec.origin_job_name, localJob.spec.job_name, allJobList]);

    // 初始化方法 - 添加状态控制，避免重复调用
    const init = async () => {
      if (isInitializing) return;

      // 暂时禁用数据稳定性检查，避免无限重试循环
      // TODO: 重新设计更可靠的数据同步机制

      setIsInitializing(true);

      const updatedJob = cloneDeep(localJob);

      if (typeof updatedJob.spec.source !== 'undefined' && (updatedJob.spec.source === 'runtime' || updatedJob.spec.source === '')) {
        // 初始化服务和构建列表
        updatedJob.spec.service_and_builds = stageExecMode || editRunner ? updatedJob.spec.service_and_builds || [] : updatedJob.spec.default_service_and_builds || [];

        // 为每个服务添加key
        updatedJob.spec.service_and_builds.forEach((service) => {
          service.key = `${service.service_name}/${service.service_module}`;
        });

        // 初始化选项列表
        if (updatedJob.spec.service_and_builds_options && updatedJob.spec.service_and_builds_options.length > 0) {
          const options = updatedJob.spec.service_and_builds_options.map((service) => {
            service.key = `${service.service_name}/${service.service_module}`;
            return service;
          });
          updatedJob.spec.service_and_builds_options = options;
        } else {
          updatedJob.spec.service_and_builds_options = [];
        }
      }

      // 处理 fromjob 类型 - 完全参照Vue版本
      if (updatedJob.spec.source === 'fromjob' && sourceJob) {
        const buildOptionsMap = keyBy(updatedJob.spec.service_and_builds_options, 'service_module');
        const servicesMap = keyBy(updatedJob.spec.service_and_builds || [], 'service_module');

        // 自定义合并函数，优先使用 service_and_builds 的数据
        const customizer = (objValue: any, srcValue: any) => {
          if (isArray(objValue)) {
            return srcValue;
          }
        };

        const mergedServices = mergeWith({}, buildOptionsMap, servicesMap, customizer);
        // 根据 stageExecMode 选择 dataSource
        const dataSource = stageExecMode || editRunner ? Object.values(mergedServices) : updatedJob.spec.service_and_builds_options;
        const serviceModules = dataSource;

        const services = serviceModules.filter((itemA) => {
          if (sourceJob.type === 'zadig-build') {
            return sourceJob.spec.service_and_builds?.some((itemB) => itemB.service_name === itemA.service_name && itemB.service_module === itemA.service_module);
          } else if (sourceJob.type === 'zadig-deploy') {
            // 人工确认展示前置任务数据，部署先过滤出服务，过滤不出服务组件
            if (stageExecMode || editRunner) {
              return sourceJob.spec.services?.some(
                (itemB) => itemB.service_name === itemA.service_name && itemB.modules?.filter((module) => module.service_module === itemA.service_module).length > 0
              );
            } else {
              return sourceJob.pickedModules?.some((itemB) => itemB.service_name === itemA.service_name && itemB.service_module === itemA.service_module);
            }
          } else if (sourceJob.type === 'zadig-distribute-image') {
            // 构建对服务有范围限制，如果引用类型为构建，则只展示构建的服务，否则展示原始引用的服务
            if (refJob?.type === 'zadig-build') {
              return refJob.spec.service_and_builds?.some((itemB) => itemB.service_name === itemA.service_name && itemB.service_module === itemA.service_module);
            } else {
              return sourceJob.spec.targets?.some((itemB) => itemB.service_name === itemA.service_name && itemB.service_module === itemA.service_module);
            }
          } else if (sourceJob.type === 'freestyle') {
            // 构建对服务有范围限制，如果引用类型为构建，则只展示构建的服务，否则展示原始引用的服务
            if (refJob?.type === 'zadig-build') {
              return refJob.spec.service_and_builds?.some((itemB) => itemB.service_name === itemA.service_name && itemB.service_module === itemA.service_module);
            } else {
              return sourceJob.spec.services?.some((itemB) => itemB.service_name === itemA.service_name && itemB.service_module === itemA.service_module);
            }
          } else if (sourceJob.type === 'zadig-test') {
            // 构建对服务有范围限制，如果引用类型为构建，则只展示构建的服务，否则展示原始引用的服务
            if (refJob?.type === 'zadig-build') {
              return refJob.spec.service_and_builds?.some((itemB) => itemB.service_name === itemA.service_name && itemB.service_module === itemA.service_module);
            } else {
              return sourceJob.spec.target_services?.some((itemB) => itemB.service_name === itemA.service_name && itemB.service_module === itemA.service_module);
            }
          } else if (sourceJob.type === 'zadig-scanning') {
            // 构建对服务有范围限制，如果引用类型为构建，则只展示构建的服务，否则展示原始引用的服务
            if (refJob?.type === 'zadig-build') {
              return refJob.spec.service_and_builds?.some((itemB) => itemB.service_name === itemA.service_name && itemB.service_module === itemA.service_module);
            } else {
              // 关键修复：优先使用 pickedTargets（运行时选择的服务），然后才是 target_services
              const targetServices = sourceJob.pickedTargets && sourceJob.pickedTargets.length > 0 ? sourceJob.pickedTargets : sourceJob.spec.target_services || [];
              return targetServices.some((itemB) => itemB.service_name === itemA.service_name && itemB.service_module === itemA.service_module);
            }
          } else {
            return false;
          }
        });

        // 处理 ref_repos - 完全参照Vue版本
        if (updatedJob.spec.ref_repos) {
          handleRefRepos(services, sourceJob);
        }

        updatedJob.spec.service_and_builds = services;
      }

      setLocalJob(updatedJob);
      setIsInitializing(false);

      // 初始化完成后通知父组件，确保依赖该构建任务的其他任务能获得最新数据
      setTimeout(() => {
        notifyJobChange(updatedJob);
      }, 100); // 延迟通知，避免初始化循环
    };

    // 处理webhook选中仓库提示 - 完全参照Vue版本的watch逻辑
    const handleWebhookSelectedRepo = (val: any) => {
      setLocalJob((prev) => {
        const updatedJob = { ...prev };

        updatedJob.spec.service_and_builds?.forEach((build) => {
          if (build.repos) {
            build.repos.forEach((repo) => {
              if (repo.codehost_id === val.codehost_id && repo.repo_name === val.repo_name && repo.repo_owner === val.repo_owner) {
                repo.showTip = true;
              } else {
                repo.showTip = false;
              }
            });
          }
        });

        updatedJob.spec.service_and_builds_options?.forEach((build) => {
          if (build.repos) {
            build.repos.forEach((repo) => {
              if (repo.codehost_id === val.codehost_id && repo.repo_name === val.repo_name && repo.repo_owner === val.repo_owner) {
                repo.showTip = true;
              } else {
                repo.showTip = false;
              }
            });
          }
        });

        return updatedJob;
      });
    };

    // 同步外部job变化到本地状态 - 只监听关键字段
    useEffect(() => {
      setLocalJob(cloneDeep(job));
    }, [job.name, job.spec.source, job.spec.origin_job_name, job.spec.job_name]);

    // 组件挂载时初始化一次
    useEffect(() => {
      if (!initRef.current) {
        init();
        initRef.current = true;
      }
    }, []);

    // 监听关键依赖变化并重新初始化
    useEffect(() => {
      if (initRef.current) {
        init();
      }
    }, [sourceJobDataSignature, stageExecMode, editRunner]); // 使用数据签名确保精确捕获源任务变化

    // 监听webhookSelectedRepo变化
    useEffect(() => {
      if (webhookSelectedRepo && initRef.current) {
        handleWebhookSelectedRepo(webhookSelectedRepo);
      }
    }, [webhookSelectedRepo]);

    // 手动通知父组件job变化的函数
    const notifyJobChange = (updatedJob: Job) => {
      if (onJobChange) {
        onJobChange(updatedJob);
      }
    };

    // 选择全部服务模块 - 完全参照Vue版本的selectAll方法
    const selectAll = (options: ServiceModule[], picked: ServiceModule[]) => {
      const newServiceBuilds = picked.length === options.length ? [] : options.filter((item) => item.build_name);

      const updatedJob = {
        ...localJob,
        spec: {
          ...localJob.spec,
          service_and_builds: newServiceBuilds,
        },
      };
      setLocalJob(updatedJob);
      notifyJobChange(updatedJob);
    };

    // 处理 ref_repos 同步仓库信息 - 完全参照Vue版本
    const handleRefRepos = (services: ServiceModule[], sourceJob: Job) => {
      if (sourceJob.type === 'zadig-build') {
        services.forEach((buildService) => {
          const originBuildService = sourceJob.spec.service_and_builds?.find(
            (item) => item.service_name === buildService.service_name && item.service_module === buildService.service_module
          );
          if (buildService.repos && buildService.repos.length > 0 && originBuildService && originBuildService.repos) {
            buildService.repos.forEach((testRepo) => {
              const matchingRepo = originBuildService.repos?.find(
                (buildRepo) => buildRepo.repo_owner === testRepo.repo_owner && buildRepo.repo_namespace === testRepo.repo_namespace && buildRepo.repo_name === testRepo.repo_name
              );
              if (matchingRepo) {
                testRepo.commit_id = matchingRepo.commit_id;
                testRepo.branch = matchingRepo.branch;
                testRepo.tag = matchingRepo.tag;
                testRepo.branchOrTag = matchingRepo.branchOrTag;
                testRepo.prs = matchingRepo.prs;
                testRepo.repoSync = true;
              }
            });
          }
        });
      } else if (sourceJob.type === 'zadig-scanning') {
        services.forEach((buildService) => {
          const scanningService = sourceJob.pickedTargets?.find((item) => item.service_name === buildService.service_name && item.service_module === buildService.service_module);
          if (buildService.repos && buildService.repos.length > 0 && scanningService && scanningService.repos) {
            buildService.repos.forEach((testRepo) => {
              const matchingRepo = scanningService.repos?.find(
                (buildRepo) => buildRepo.repo_owner === testRepo.repo_owner && buildRepo.repo_namespace === testRepo.repo_namespace && buildRepo.repo_name === testRepo.repo_name
              );
              if (matchingRepo) {
                testRepo.commit_id = matchingRepo.commit_id;
                testRepo.branch = matchingRepo.branch;
                testRepo.tag = matchingRepo.tag;
                testRepo.branchOrTag = matchingRepo.branchOrTag;
                testRepo.prs = matchingRepo.prs;
                testRepo.repoSync = true;
              }
            });
          }
        });
      } else if (sourceJob.type === 'freestyle') {
        services.forEach((buildService) => {
          const freestyleService = sourceJob.spec.services?.find((item) => item.service_name === buildService.service_name && item.service_module === buildService.service_module);
          if (buildService.repos && buildService.repos.length > 0 && freestyleService && freestyleService.repos) {
            buildService.repos.forEach((testRepo) => {
              const matchingRepo = freestyleService.repos?.find(
                (buildRepo) => buildRepo.repo_owner === testRepo.repo_owner && buildRepo.repo_namespace === testRepo.repo_namespace && buildRepo.repo_name === testRepo.repo_name
              );
              if (matchingRepo) {
                testRepo.commit_id = matchingRepo.commit_id;
                testRepo.branch = matchingRepo.branch;
                testRepo.tag = matchingRepo.tag;
                testRepo.branchOrTag = matchingRepo.branchOrTag;
                testRepo.prs = matchingRepo.prs;
                testRepo.repoSync = true;
              }
            });
          }
        });
      } else if (sourceJob.type === 'zadig-test') {
        services.forEach((buildService) => {
          const originbuildService = sourceJob.pickedTargets?.find(
            (item) => item.service_name === buildService.service_name && item.service_module === buildService.service_module
          );
          if (buildService.repos && buildService.repos.length > 0 && originbuildService && originbuildService.repos) {
            buildService.repos.forEach((testRepo) => {
              const matchingRepo = originbuildService.repos?.find(
                (buildRepo) => buildRepo.repo_owner === testRepo.repo_owner && buildRepo.repo_namespace === testRepo.repo_namespace && buildRepo.repo_name === testRepo.repo_name
              );
              if (matchingRepo) {
                testRepo.commit_id = matchingRepo.commit_id;
                testRepo.branch = matchingRepo.branch;
                testRepo.tag = matchingRepo.tag;
                testRepo.branchOrTag = matchingRepo.branchOrTag;
                testRepo.prs = matchingRepo.prs;
                testRepo.repoSync = true;
              }
            });
          }
        });
      }
    };

    // 表单验证 - 完全参照Vue版本的validate方法
    const validate = async (): Promise<boolean> => {
      return new Promise((resolve) => {
        const jobName = localJob.name;
        if (!localJob.spec.service_and_builds || localJob.spec.service_and_builds.length === 0) {
          Toast.error(`${jobName}: 至少选择一个服务组件`);
          return resolve(false);
        }
        for (const service of localJob.spec.service_and_builds) {
          if (service.repos) {
            for (const repo of service.repos) {
              if (!repo.repoSync && (!repo.branchOrTag || repo.branchOrTag.name === '') && (!repo.prs || repo.prs.length === 0)) {
                Toast.error(`${jobName}: 服务 ${service.service_name} 中的仓库 ${repo.repo_name} 缺少代码信息`);
                return resolve(false);
              }
            }
          }
        }
        return resolve(true);
      });
    };

    // 获取仓库信息（包括分支、标签、PR）- 用于构建行展示
    const getServiceRepoInfo = async (service: ServiceModule) => {
      if (!service.repos || service.repos.length === 0) return;

      // 如果已经获取过，不再重复获取
      if (service.repoIsFeteched) return;

      const repoKey = `${service.service_name}/${service.service_module}`;
      setRepoLoading((prev) => ({ ...prev, [repoKey]: true }));

      try {
        // 构造查询参数
        const reposQuery = service.repos
          .filter((repo) => repo.source_from !== 'param')
          .map((repo) => ({
            source: repo.source,
            repo_owner: repo.repo_owner,
            repo: repo.repo_name,
            default_branch: repo.branch,
            codehost_id: repo.codehost_id,
            repo_namespace: repo.repo_namespace,
            filter_regexp: repo.filter_regexp,
          }));

        if (reposQuery.length === 0) {
          service.repoIsFeteched = true;
          return;
        }

        // 获取所有分支信息
        const res = await getAllBranchInfoAPI({ infos: reposQuery });

        if (res) {
          service.repoIsFeteched = true;

          // 处理PR信息
          res.forEach((repo: any) => {
            if (repo.prs) {
              repo.prs.forEach((element: any) => {
                element.pr = element.id;
              });
              repo.branchPRsMap = arrayToMapOfArrays(repo.prs, 'targetBranch');
            } else {
              repo.branchPRsMap = {};
            }
            repo.branchNames = repo.branches ? repo.branches.map((b: any) => b.name) : [];
          });

          const repoInfoMap = keyBy(res, (repo: any) => `${repo.repo_owner}/${repo.repo}`);

          // 获取commit信息
          const commitRepos = service.repos.filter((re) => re.source_from !== 'param' && re.enable_commit);
          const commitInfoMap = await getCommitInfoMap(commitRepos);

          // 更新原始仓库信息
          service.repos.forEach((repo) => {
            updateRepoInfo(repo, repoInfoMap, commitInfoMap);
          });

          // 触发组件更新 - 这里不需要通知父组件，只是内部状态更新
          setLocalJob((prev) => ({ ...prev }));
        }
      } catch (error) {
        console.error('获取仓库信息失败:', error);
        Toast.error('获取仓库信息失败');
      } finally {
        setRepoLoading((prev) => ({ ...prev, [repoKey]: false }));
      }
    };

    // 获取commit信息映射
    const getCommitInfoMap = async (commitRepos: RepoInfo[]) => {
      const commitInfoMap: Record<string, any[]> = {};
      const commitPromises = commitRepos.map(async (repo) => {
        try {
          const commits = await getBranchCommitInfoAPI(repo.codehost_id, repo.repo_namespace, repo.repo_name, repo.branch || '');
          if (commits) {
            commitInfoMap[`${repo.repo_owner}/${repo.repo_name}`] = commits;
          }
        } catch (error) {
          console.error('获取commit信息失败:', error);
        }
      });
      await Promise.all(commitPromises);
      return commitInfoMap;
    };

    // 更新仓库信息
    const updateRepoInfo = (repo: RepoInfo, repoInfoMap: any, commitInfoMap: any) => {
      repo._id_ = `${repo.repo_owner}/${repo.repo_name}`;
      const repoInfo = repoInfoMap[repo._id_];

      repo.branchNames = repoInfo ? repoInfo.branchNames : [];
      repo.branchPRsMap = repoInfo ? repoInfo.branchPRsMap : {};
      repo.commits = commitInfoMap[repo._id_] || [];
      repo.tags = repoInfo && repoInfo.tags ? repoInfo.tags : [];
      repo.prNumberPropName = 'pr';

      if (repoInfo) {
        repo.errorMsg = repoInfo.error_msg || '';
      }

      repo.branch = repo.branch || '';
      repo.tag = repo.tag || '';

      let branchOrTag: { type: 'branch' | 'tag'; id: string; name: string } | undefined = undefined;
      if (repo.branch) {
        branchOrTag = { type: 'branch' as const, id: `branch-${repo.branch}`, name: repo.branch };
      } else if (repo.tag) {
        branchOrTag = { type: 'tag' as const, id: `tag-${repo.tag}`, name: repo.tag };
      }
      repo.branchOrTag = branchOrTag;

      repo.branchAndTagList = [
        {
          label: 'Branches',
          options: (repo.branchNames || []).map((name) => ({ type: 'branch', id: `branch-${name}`, name })),
        },
        {
          label: 'Tags',
          options: (repo.tags || []).map((tag) => ({ type: 'tag', id: `tag-${tag.name}`, name: tag.name })),
        },
      ];
    };

    // 工具函数：将数组转换为按指定字段分组的映射
    const arrayToMapOfArrays = (array: any[], key: string) => {
      const map: Record<string, any[]> = {};
      array.forEach((item) => {
        const keyValue = item[key];
        if (!map[keyValue]) {
          map[keyValue] = [];
        }
        map[keyValue].push(item);
      });
      return map;
    };

    // 搜索仓库信息
    const searchRepoInfo = async (repo: RepoInfo, query: string) => {
      try {
        const reposQuery = [
          {
            source: repo.source,
            repo_owner: repo.repo_owner,
            repo: repo.repo_name,
            default_branch: repo.branch,
            codehost_id: repo.codehost_id,
            repo_namespace: repo.repo_namespace,
            filter_regexp: repo.filter_regexp,
            key: query,
          },
        ];

        const res = await getAllBranchInfoAPI({ infos: reposQuery });

        const branches = repo.branchAndTagList
          ? repo.branchAndTagList.find((item) => item.label === 'Branches') || { label: 'Branches', options: [] }
          : { label: 'Branches', options: [] };
        const tags = repo.branchAndTagList ? repo.branchAndTagList.find((item) => item.label === 'Tags') || { label: 'Tags', options: [] } : { label: 'Tags', options: [] };

        if (repo.source === 'other' && res.length === 0) {
          res[0] = {
            branches: repo.branchOrTag?.type === 'branch' ? [repo.branchOrTag] : [],
            tags: repo.branchOrTag?.type === 'tag' ? [repo.branchOrTag] : [],
          };
          if (query) {
            res[0] = { branches: [], tags: [] };
          }
        }

        if (res && res.length > 0) {
          branches.options = res[0].branches.map((item: any) => ({
            id: 'branch-' + item.name,
            name: item.name,
            type: 'branch',
          }));
          tags.options = res[0].tags.map((item: any) => ({
            id: 'tag-' + item.name,
            name: item.name,
            type: 'tag',
          }));
        } else {
          branches.options = [];
          tags.options = [];
        }

        if (query) {
          const queryBranchInResponse = branches.options?.findIndex((element: any) => element.name === query && element.type === 'branch') ?? -1;
          const queryTagInResponse = tags.options?.findIndex((element: any) => element.name === query && element.type === 'tag') ?? -1;
          if (queryBranchInResponse === -1 && branches.options) {
            branches.options.unshift({ id: 'addBranch-' + query, name: query, type: 'branch' });
          }
          if (queryTagInResponse === -1 && tags.options) {
            tags.options.unshift({ id: 'addTag-' + query, name: query, type: 'tag' });
          }
        }

        // 重新设置 branchAndTagList 以确保分组正确显示
        repo.branchAndTagList = [branches, tags];

        // 触发更新
        setLocalJob((prev) => ({ ...prev }));
      } catch (error) {
        console.error('搜索仓库信息失败:', error);
      }
    };

    // 处理分支或标签变化
    const changeBranchOrTag = async (repo: RepoInfo, branchOrTag: any) => {
      if (branchOrTag) {
        repo[repo.prNumberPropName || 'pr'] = null;
        repo.prs = [];

        if (branchOrTag.type === 'branch') {
          repo.branch = branchOrTag.name;
          repo.tag = '';

          if (repo.enable_commit) {
            try {
              const res = await getBranchCommitInfoAPI(repo.codehost_id, repo.repo_namespace, repo.repo_name, branchOrTag.name);
              repo.commits = res || [];
            } catch (error) {
              console.error('获取commit信息失败:', error);
            }
          }
        }

        if (branchOrTag.type === 'tag') {
          repo.tag = branchOrTag.name;
          repo.branch = '';
        }

        repo.branchOrTag = branchOrTag;
      }

      // 触发更新
      const updatedJob = { ...localJob };
      setLocalJob(updatedJob);
      notifyJobChange(updatedJob);
    };

    // 处理服务模块选择变化 - 修复多选问题
    const handleServiceChange = (selectedValues: ServiceModule[]) => {
      if (viewMode) return;

      const updatedJob = {
        ...localJob,
        spec: {
          ...localJob.spec,
          service_and_builds: selectedValues,
        },
      };
      setLocalJob(updatedJob);
      notifyJobChange(updatedJob);
    };

    // 处理展开/收起
    const handleExpand = (key: string) => {
      setExpandedKeys((prev) => {
        if (prev.includes(key)) {
          return prev.filter((k) => k !== key);
        }
        return [...prev, key];
      });
    };

    // 暴露方法给父组件
    useImperativeHandle(
      ref,
      () => ({
        validate,
        getLatestJobData: () => {
          return localJob;
        },
      }),
      [localJob]
    );

    // 获取仓库信息 - 只在初始化完成后检查，避免重复调用
    useEffect(() => {
      if (initRef.current && localJob.spec.service_and_builds && !isInitializing) {
        localJob.spec.service_and_builds.forEach((service) => {
          if (!service.repoIsFeteched) {
            getServiceRepoInfo(service);
          }
        });
      }
    }, [localJob.spec.service_and_builds?.length, isInitializing]); // 只监听数组长度变化

    // 渲染服务模块选择 - 完全参照Vue版本
    const renderServiceSelection = () => {
      if (localJob.spec.source !== '' && localJob.spec.source !== 'runtime') {
        return null;
      }

      const options = localJob.spec.service_and_builds_options || [];
      const picked = localJob.spec.service_and_builds || [];
      const allSelected = picked.length === options.length;
      return (
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            服务组件
          </Text>
          <Select
            multiple
            value={picked.map((s) => s.key || `${s.service_name}/${s.service_module}`)}
            onChange={(selectedKeys: string[]) => {
              const selectedServices = selectedKeys
                .map((key) => options.find((service) => (service.key || `${service.service_name}/${service.service_module}`) === key))
                .filter(Boolean) as ServiceModule[];
              handleServiceChange(selectedServices);
            }}
            placeholder="请选择服务组件"
            style={{ width: '100%' }}
            disabled={viewMode}
            filter
            // 使用optionList属性来定义选项
            optionList={[
              {
                label: (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      cursor: 'pointer',
                      color: '#606266',
                      fontWeight: allSelected ? 'bold' : 'normal',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      selectAll(options, picked);
                    }}
                  >
                    <span>全选</span>
                  </div>
                ),
                value: '__SELECT_ALL__',
                disabled: true,
              },
              ...options.map((service) => ({
                label: `${service.service_module}(${service.service_name})`,
                value: service.key || `${service.service_name}/${service.service_module}`,
                disabled: !service.build_name,
              })),
            ]}
            // 自定义渲染选中项 - 多选模式需要返回对象
            renderSelectedItem={(optionNode: any, { index, onClose }: any) => {
              // optionNode 是一个对象，包含 value 属性
              const key = optionNode?.value;

              // 跳过全选项
              if (key === '__SELECT_ALL__') {
                return { isRenderInTag: false, content: '' };
              }

              // 使用 key 查找对应的服务
              const service = options.find((s) => (s.key || `${s.service_name}/${s.service_module}`) === key);

              const content = service ? `${service.service_module}(${service.service_name})` : key || '';

              // 多选模式需要返回对象格式
              return {
                isRenderInTag: true, // 包裹在Tag中，带背景色和关闭按钮
                content: content,
              };
            }}
          />
        </div>
      );
    };

    // 渲染变量表格
    const renderVariableTable = (keyVals: any[]) => {
      const filteredVars = keyVals.filter((item) => !(item.source === 'fixed' || item.source === 'reference'));
      if (filteredVars.length === 0) return null;

      return (
        <Table dataSource={filteredVars} pagination={false} size="small" style={{ margin: '5px', backgroundColor: '#f8fcfd', border: '1px solid #ccc', borderRadius: '4px' }}>
          <Column title="Key" dataIndex="key" key="key" />
          <Column title="描述" dataIndex="description" key="description" />
          <Column
            title="值"
            key="value"
            render={(_, record: any) => {
              if (record.type === 'choice') {
                return (
                  <Select
                    value={record.value}
                    onChange={(value) => {
                      record.value = value;
                      const updatedJob = { ...localJob };
                      setLocalJob(updatedJob);
                      notifyJobChange(updatedJob);
                    }}
                    style={{ width: '100%' }}
                    disabled={viewMode}
                    filter
                  >
                    {(record.choice_option || []).map((item: string) => (
                      <Select.Option key={item} value={item}>
                        {item}
                      </Select.Option>
                    ))}
                  </Select>
                );
              } else if (record.type === 'multi-select') {
                return (
                  <Select
                    value={record.choice_value}
                    onChange={(value) => {
                      record.choice_value = value;
                      const updatedJob = { ...localJob };
                      setLocalJob(updatedJob);
                      notifyJobChange(updatedJob);
                    }}
                    style={{ width: '100%' }}
                    disabled={viewMode}
                    multiple
                    filter
                    renderSelectedItem={(optionNode: any, { index, onClose }: any) => {
                      return {
                        isRenderInTag: true,
                        content: optionNode?.value || optionNode?.label || '',
                      };
                    }}
                  >
                    {(record.choice_option || []).map((item: string) => (
                      <Select.Option key={item} value={item}>
                        {item}
                      </Select.Option>
                    ))}
                  </Select>
                );
              } else if (record.type === 'string') {
                return (
                  <Input
                    value={record.value}
                    onChange={(value) => {
                      record.value = value;
                      const updatedJob = { ...localJob };
                      setLocalJob(updatedJob);
                      notifyJobChange(updatedJob);
                    }}
                    disabled={viewMode}
                    type={record.is_credential ? 'password' : 'text'}
                    showClear={record.is_credential}
                    style={{ width: '100%' }}
                  />
                );
              } else if (record.type === 'text') {
                return (
                  <TextArea
                    value={record.value}
                    onChange={(value) => {
                      record.value = value;
                      const updatedJob = { ...localJob };
                      setLocalJob(updatedJob);
                      notifyJobChange(updatedJob);
                    }}
                    disabled={viewMode}
                    autosize={{ minRows: 3, maxRows: 6 }}
                    style={{ width: '100%' }}
                  />
                );
              }
              return null;
            }}
          />
        </Table>
      );
    };

    // 渲染仓库行
    const renderRepoRow = (repo: RepoInfo, index: number) => {
      const isPerforce = repo.source === 'perforce';
      const perforceRepo = repo as PerforceRepo;
      return (
        <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          {/* 仓库名称 */}
          {!isPerforce && (
            <div style={{ width: '33%' }}>
              <Tooltip content={repo.repo_name}>
                <Text ellipsis style={{ maxWidth: '100%' }}>
                  {repo.repo_name}
                </Text>
              </Tooltip>
            </div>
          )}

          {/* 代码执行提示 */}
          {repo.showTip && (
            <Text type="tertiary" size="small" style={{ lineHeight: '32px' }}>
              使用变更代码执行
            </Text>
          )}

          {/* Perforce 配置 */}
          {isPerforce && !repo.showTip && (
            <>
              {perforceRepo.depot_type === 'stream' && (
                <Input
                  value={perforceRepo.stream}
                  onChange={(value) => {
                    perforceRepo.stream = value;
                    const updatedJob = { ...localJob };
                    setLocalJob(updatedJob);
                    notifyJobChange(updatedJob);
                  }}
                  placeholder="stream"
                  disabled={viewMode}
                  style={{ width: '33%', marginRight: 10 }}
                />
              )}
              {perforceRepo.depot_type === 'local' && (
                <TextArea
                  value={perforceRepo.view_mapping}
                  onChange={(value) => {
                    perforceRepo.view_mapping = value;
                    const updatedJob = { ...localJob };
                    setLocalJob(updatedJob);
                    notifyJobChange(updatedJob);
                  }}
                  placeholder="View Mapping"
                  autosize={{ minRows: 2, maxRows: 4 }}
                  disabled={viewMode}
                  style={{ width: '33%', marginRight: 10 }}
                />
              )}
              <Input
                value={perforceRepo.changelist_id?.toString()}
                onChange={(value) => {
                  perforceRepo.changelist_id = value ? parseInt(value) : undefined;
                  const updatedJob = { ...localJob };
                  setLocalJob(updatedJob);
                  notifyJobChange(updatedJob);
                }}
                placeholder="Change List ID"
                disabled={viewMode}
                style={{ width: '28%' }}
              />
              <Input
                value={perforceRepo.shelve_id?.toString()}
                onChange={(value) => {
                  perforceRepo.shelve_id = value ? parseInt(value) : undefined;
                  const updatedJob = { ...localJob };
                  setLocalJob(updatedJob);
                  notifyJobChange(updatedJob);
                }}
                placeholder="Shelve ID"
                disabled={viewMode}
                style={{ width: '28%', marginLeft: 10 }}
              />
            </>
          )}

          {/* 普通仓库配置 */}
          {!isPerforce && !repo.showTip && (
            <>
              <div style={{ width: '28%' }}>
                {repo.repoSync ? (
                  <Text style={{ lineHeight: '32px' }}>{repo.branchOrTag?.name || ''}</Text>
                ) : (
                  <>
                    {repo.source === 'other' ? (
                      <Input
                        value={repo.branchOrTag?.name}
                        onChange={(value) => {
                          if (repo.branchOrTag) {
                            repo.branchOrTag.name = value;
                            const updatedJob = { ...localJob };
                            setLocalJob(updatedJob);
                            notifyJobChange(updatedJob);
                          }
                        }}
                        placeholder="输入分支或标签"
                        disabled={viewMode}
                      />
                    ) : (
                      <Select
                        value={repo.branchOrTag?.id}
                        onChange={(value) => {
                          const allOptions = repo.branchAndTagList?.reduce<any[]>((acc, group) => [...acc, ...group.options], []) || [];
                          const branchOrTag = allOptions.find((option) => option.id === value);
                          if (branchOrTag) {
                            changeBranchOrTag(repo, branchOrTag);
                          }
                        }}
                        remote
                        onSearch={(query) => searchRepoInfo(repo, query)}
                        onClear={() => searchRepoInfo(repo, '')}
                        filter
                        showClear
                        placeholder="选择分支或标签"
                        disabled={viewMode}
                        style={{ width: '100%' }}
                      >
                        {(repo.branchAndTagList || []).map((group, index) =>
                          group.options && group.options.length > 0 ? (
                            <Select.OptGroup label={group.label} key={`${index}-${group.label}`}>
                              {group.options.map((option, index2) => (
                                <Select.Option value={option.id} key={`${index2}-${option.id}`}>
                                  {option.id.startsWith('addTag') || option.id.startsWith('addBranch') ? `使用PR或标签模板"${option.name}"` : option.name}
                                </Select.Option>
                              ))}
                            </Select.OptGroup>
                          ) : null
                        )}
                      </Select>
                    )}
                  </>
                )}
              </div>

              {repo.source !== 'other' && (
                <div style={{ width: '28%', marginLeft: 10 }}>
                  {repo.repoSync ? (
                    <Text style={{ lineHeight: '32px' }}>{repo.enable_commit ? repo.commit_id : repo.prs ? repo.prs.map((pr) => `#${pr}`).join(', ') : ''}</Text>
                  ) : (
                    <>
                      {repo.enable_commit ? (
                        <Select
                          value={repo.commit_id}
                          onChange={(value) => {
                            repo.commit_id = value as string;
                            const updatedJob = { ...localJob };
                            setLocalJob(updatedJob);
                            notifyJobChange(updatedJob);
                          }}
                          placeholder="选择Commit"
                          filter
                          showClear
                          disabled={viewMode}
                          renderOptionItem={(item) => (
                            <Tooltip
                              content={
                                <div>
                                  <div>创建者: {item.author}</div>
                                  <div>创建时间: {new Date((item as any).created_at * 1000).toLocaleString()}</div>
                                  <div style={{ whiteSpace: 'pre-wrap' }}>提交: {(item as any).commit_message}</div>
                                </div>
                              }
                            >
                              <div>{`${String(item.value || '').substring(0, 10)} ${(item as any).commit_message?.substring(0, 60)}`}</div>
                            </Tooltip>
                          )}
                        >
                          {(repo.commits || []).map((commit) => (
                            <Select.Option
                              key={commit.commit_id}
                              value={commit.commit_id}
                              author={commit.author}
                              created_at={commit.created_at}
                              commit_message={commit.commit_message}
                            >
                              {`${commit.commit_id.substring(0, 10)} ${commit.commit_message.substring(0, 60)}`}
                            </Select.Option>
                          ))}
                        </Select>
                      ) : (
                        <>
                          {repo.branchPRsMap &&
                          Object.keys(repo.branchPRsMap).length > 0 &&
                          repo.branchOrTag?.name &&
                          repo.branchPRsMap[repo.branchOrTag.name] &&
                          repo.branchPRsMap[repo.branchOrTag.name].length > 0 ? (
                            <Select
                              value={repo.prs}
                              onChange={(value) => {
                                repo.prs = value as number[];
                                const updatedJob = { ...localJob };
                                setLocalJob(updatedJob);
                                notifyJobChange(updatedJob);
                              }}
                              multiple
                              placeholder="选择PR"
                              filter
                              showClear
                              disabled={repo.branchOrTag?.type === 'tag' || viewMode}
                            >
                              {(repo.branchPRsMap[repo.branchOrTag?.name || ''] || []).map((pr: any) => (
                                <Select.Option
                                  key={pr[repo.prNumberPropName || 'pr']}
                                  value={pr[repo.prNumberPropName || 'pr']}
                                  title={`创建者: ${pr.authorUsername}\n创建时间: ${new Date(pr.createdAt * 1000).toLocaleString()}\n源分支: ${pr.sourceBranch}\n目标分支: ${
                                    pr.targetBranch
                                  }`}
                                >
                                  {`#${pr[repo.prNumberPropName || 'pr']} ${pr.title}`}
                                </Select.Option>
                              ))}
                            </Select>
                          ) : (
                            <Tooltip content={!repo.branchOrTag?.name ? '请先选择分支' : '该分支没有PR'}>
                              <Input
                                value={repo.prs?.join(', ')}
                                onChange={(value) => {
                                  const prs = value
                                    .split(',')
                                    .map((pr) => {
                                      const num = parseInt(pr.trim());
                                      return isNaN(num) ? null : num;
                                    })
                                    .filter((pr) => pr !== null) as number[];
                                  repo.prs = prs;
                                  const updatedJob = { ...localJob };
                                  setLocalJob(updatedJob);
                                  notifyJobChange(updatedJob);
                                }}
                                placeholder={!repo.branchOrTag?.name ? '请先选择分支' : '输入PR'}
                                disabled={repo.branchOrTag?.type === 'tag' || viewMode}
                              />
                            </Tooltip>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}

              {repo.errorMsg && (
                <Tooltip content={repo.errorMsg}>
                  <IconInfoCircle style={{ color: '#ff7875', marginLeft: 8 }} />
                </Tooltip>
              )}
            </>
          )}
        </div>
      );
    };

    // 渲染构建行组件
    const renderBuildRows = () => {
      if (!localJob.spec.service_and_builds || localJob.spec.service_and_builds.length === 0) {
        return null;
      }

      return (
        <div style={{ marginTop: 16 }} className="workflow-build-rows">
          <Table
            dataSource={localJob.spec.service_and_builds}
            pagination={false}
            empty="无"
            onRow={(record) => {
              if (!record) return {};
              return {
                onClick: () => {
                  if (!record.repoIsFeteched) {
                    getServiceRepoInfo(record);
                  }
                },
              };
            }}
          >
            {/* 展开列 */}
            <Column
              key="expand"
              width={50}
              render={(text, record) => {
                const hasVars = record.key_vals && record.key_vals.filter((item: any) => !(item.source === 'fixed' || item.source === 'reference')).length > 0;

                if (!hasVars) return null;

                const isExpanded = expandedKeys.includes(String(record.key || ''));
                return (
                  <Button
                    theme="borderless"
                    size="small"
                    icon={isExpanded ? <IconChevronDown /> : <IconChevronRight />}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExpand(String(record.key || ''));
                    }}
                  />
                );
              }}
            />

            {/* 服务模块列 */}
            <Column
              title="服务组件"
              dataIndex="service_module"
              key="service_module"
              width={200}
              render={(text, record) => (
                <Tooltip content={record.service_name}>
                  <span style={{ cursor: 'pointer' }}>{text}</span>
                </Tooltip>
              )}
            />

            {/* 代码库列 */}
            <Column
              title="代码库"
              key="repository"
              render={(text, record) => {
                const repoKey = `${record.service_name}/${record.service_module}`;
                const loading = repoLoading[repoKey];

                return (
                  <div>
                    {loading && <Text type="secondary">正在加载仓库信息...</Text>}
                    {!loading && record.repos && <>{record.repos.filter((repo) => !repo.hidden).map((repo, index) => renderRepoRow(repo, index))}</>}
                  </div>
                );
              }}
            />
          </Table>

          {/* 渲染展开的变量表格 */}
          {localJob.spec.service_and_builds.map((service) => {
            if (!expandedKeys.includes(service.key || '')) return null;
            if (!service.key_vals || service.key_vals.length === 0) return null;

            return (
              <div key={service.key} style={{ marginTop: -1 }}>
                {renderVariableTable(service.key_vals)}
              </div>
            );
          })}
        </div>
      );
    };

    return (
      <div className="job-zadig-build">
        {renderServiceSelection()}
        {localJob.spec.service_and_builds && localJob.spec.service_and_builds.length > 0 && renderBuildRows()}
      </div>
    );
  }
);

ZadigBuild.displayName = 'ZadigBuild';

export default ZadigBuild;
