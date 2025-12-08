import { useEffect, useCallback, useMemo, forwardRef, useImperativeHandle, useState, useRef } from 'react';
import { Select, Table, Input, Tooltip, TextArea, Toast, Typography, Button } from '@douyinfe/semi-ui';
import { IconInfoCircle, IconChevronRight, IconChevronDown } from '@douyinfe/semi-icons';
import { isEmpty, cloneDeep, keyBy } from 'lodash';

const { Text } = Typography;
const { Column } = Table;
import { getAllBranchInfoAPI, getBranchCommitInfoAPI } from '../../../../api/service';
import './ZadigScanning.css';

interface KeyVal {
  key: string;
  value: string;
  description: string;
  type: 'string' | 'choice' | 'multi-select' | 'text';
  source?: string;
  choice_option?: string[];
  choice_value?: string[];
  is_credential?: boolean;
}

interface BranchOrTag {
  type: 'branch' | 'tag';
  id: string;
  name: string;
}

interface CommitInfo {
  commit_id: string;
  author: string;
  created_at: string;
  commit_message: string;
}

interface PRInfo {
  id: number;
  title: string;
  authorUsername: string;
  createdAt: string;
  sourceBranch: string;
  targetBranch: string;
  pr?: number;
}

interface RepoInfo {
  codehost_id?: string; // 兼容 Vue 版本中的 codehost_id
  code_host_id: string;
  repo_name: string;
  repo_owner: string;
  repo_namespace: string;
  source?: string;
  branch?: string;
  pr?: string;
  prs?: number[] | string;
  tag?: string;
  commit_id?: string;
  hidden?: boolean;
  showTip?: boolean;
  depot_type?: string;
  stream?: string;
  view_mapping?: string;
  changelist_id?: number | string;
  shelve_id?: number | string;
  repoSync?: boolean;
  branchOrTag?: BranchOrTag;
  branchAndTagList?: Array<{ label: string; options: BranchOrTag[] }>;
  branchNames?: string[];
  commits?: CommitInfo[];
  tags?: Array<{ name: string }>;
  branchPRsMap?: Record<string, PRInfo[]>;
  prNumberPropName?: string;
  enable_commit?: boolean;
  errorMsg?: string;
  error_msg?: string; // 兼容后端返回
  source_from?: string;
  filter_regexp?: string;
  _id_?: string;
  repoIsFeteched?: boolean;
  loading?: boolean;
}

interface TargetService {
  service_name: string;
  service_module: string;
  name: string;
  key?: string;
  key_vals: KeyVal[];
  repos?: RepoInfo[];
  repoIsFeteched?: boolean;
  modules?: any[]; // 添加 modules 属性以支持 zadig-deploy 类型的任务
}

interface JobSpec {
  scanning_type?: string;
  source?: string;
  target_services?: TargetService[];
  service_scanning_options?: TargetService[];
  scannings?: TargetService[];
  scanning_options?: TargetService[];
  service_and_scannings?: TargetService[];
  ref_repos?: boolean;
  origin_job_name?: string;
  job_name?: string;
  service_and_builds?: any[];
  services?: any[];
  targets?: any[];
  [key: string]: any;
}

interface Job {
  name: string;
  type: string;
  spec: JobSpec;
  pickedTargets?: TargetService[];
  [key: string]: any;
}

// 工具函数：模拟 Vue 中的 $utils
const utils = {
  tailCut: (str: string, length: number) => {
    if (!str) return '';
    return str.length > length ? `${str.substring(0, length)}...` : str;
  },
  isEmpty: (value: any) => isEmpty(value),
  convertTimestamp: (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  },
  arrayToMapOfArrays: (array: any[], key: string) => {
    return array.reduce((map, item) => {
      const keyValue = item[key];
      if (!map[keyValue]) {
        map[keyValue] = [];
      }
      map[keyValue].push(item);
      return map;
    }, {} as Record<string, any[]>);
  },
};

interface ZadigScanningProps {
  job: Job;
  allJobList?: Job[];
  webhookSelectedRepo?: any;
  stageExecMode?: boolean;
  editRunner?: boolean;
  viewMode?: boolean;
  elSelectWidth?: string;
  onJobChange?: (job: Job) => void;
}

const ZadigScanning = forwardRef<any, ZadigScanningProps>(
  ({ job, allJobList = [], webhookSelectedRepo = {}, stageExecMode = false, editRunner = false, viewMode = false, elSelectWidth = '220px', onJobChange }, ref) => {
    // 使用本地状态管理，避免直接修改传入的 job 对象
    const [localJob, setLocalJob] = useState(() => cloneDeep(job));
    const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

    // 同步外部 job 变化到本地状态
    useEffect(() => {
      setLocalJob(cloneDeep(job));
    }, [job.name, job.spec.source, job.spec.scanning_type]); // 只监听关键字段变化

    // 计算源任务 - 完全按照 Vue 版本的 computed
    const sourceJob = useMemo(() => {
      const findOriginalJob = (jobName: string): Job | null => {
        const foundJob = allJobList.find((j) => j.name === jobName);
        if (foundJob && foundJob.spec.source === 'fromjob') {
          const originJobName = foundJob.spec.origin_job_name ? foundJob.spec.origin_job_name : foundJob.spec.job_name;
          return findOriginalJob(originJobName || '');
        } else {
          return foundJob || null;
        }
      };

      if (localJob.spec.source === 'fromjob') {
        const originJobName = localJob.spec.origin_job_name ? localJob.spec.origin_job_name : localJob.spec.job_name;
        return findOriginalJob(originJobName || '');
      } else {
        return null;
      }
    }, [localJob.spec.source, localJob.spec.origin_job_name, localJob.spec.job_name]);

    // 计算引用任务 - 完全按照 Vue 版本的 computed
    const refJob = useMemo(() => {
      const findOriginalJob = (jobName: string): Job | null => {
        const foundJob = allJobList.find((j) => j.name === jobName);
        return cloneDeep(foundJob);
      };

      if (localJob.spec.source === 'fromjob') {
        const originJobName = localJob.spec.origin_job_name ? localJob.spec.origin_job_name : localJob.spec.job_name;
        return findOriginalJob(originJobName || '');
      } else {
        return null;
      }
    }, [localJob.spec.source, localJob.spec.origin_job_name, localJob.spec.job_name]);

    // 添加初始化状态，防止重复调用
    const [isInitializing, setIsInitializing] = useState(false);
    const initRef = useRef<boolean>(false);

    // 初始化方法 - 完全按照 Vue 版本实现
    const init = useCallback(() => {
      if (isInitializing || !localJob) return;
      setIsInitializing(true);

      if (localJob.spec.scanning_type === '') {
        if (localJob.spec.scannings && localJob.spec.scannings.length > 0) {
          localJob.spec.scannings.forEach((service) => {
            service.key = `${service.service_name}/${service.service_module}`;
            if (service.repos && service.repos.length > 0 && !service.repoIsFeteched) {
              getServiceRepoInfo(service);
            }
          });
          if (!utils.isEmpty(webhookSelectedRepo)) {
            checkRepoTooltip(webhookSelectedRepo);
          }
        }
        // 处理默认值
        if (localJob.spec.scannings?.length === 0 && localJob.spec.scanning_options && localJob.spec.scanning_options.length > 0) {
          localJob.spec.scanning_options.forEach((service) => {
            service.key = `${service.service_name}/${service.service_module}`;
            if (service.repos && service.repos.length > 0 && !service.repoIsFeteched) {
              getServiceRepoInfo(service);
            }
          });
          localJob.spec.scannings = localJob.spec.scanning_options;
        }
      } else if (localJob.spec.scanning_type === 'service_scanning') {
        if (localJob.spec.source === 'runtime') {
          if (localJob.spec.service_scanning_options && localJob.spec.service_scanning_options.length > 0) {
            localJob.spec.service_scanning_options.forEach((service) => {
              service.key = `${service.service_name}/${service.service_module}`;
              if (service.repos && service.repos.length > 0 && !service.repoIsFeteched) {
                getServiceRepoInfo(service);
              }
            });

            if (localJob.spec.service_and_scannings) {
              localJob.spec.service_and_scannings.forEach((service) => {
                service.key = `${service.service_name}/${service.service_module}`;
                if (service.repos && service.repos.length > 0 && !service.repoIsFeteched) {
                  getServiceRepoInfo(service);
                }
              });
            }

            const dataSource = editRunner || stageExecMode ? localJob.spec.service_and_scannings : localJob.spec.service_scanning_options;

            let pickedTargets: TargetService[] = [];
            if (editRunner || stageExecMode) {
              const avaliableTargets =
                dataSource?.filter((itemA) => {
                  const match = localJob.spec.target_services?.some((itemB) => itemB.service_name === itemA.service_name && itemB.service_module === itemA.service_module);
                  return match;
                }) || [];
              // 如果 localJob.spec.target_services 存在 dataSource 中不存在的 项目，则该项目从 localJob.spec.service_test_options 补齐
              const missingTargets =
                localJob.spec.target_services?.filter(
                  (itemA) => !avaliableTargets.some((itemB) => itemB.service_name === itemA.service_name && itemB.service_module === itemA.service_module)
                ) || [];
              pickedTargets = [...avaliableTargets, ...missingTargets];
            } else {
              pickedTargets =
                dataSource?.filter((itemA) => {
                  const match = localJob.spec.target_services?.some((itemB) => itemB.service_name === itemA.service_name && itemB.service_module === itemA.service_module);
                  return match;
                }) || [];
            }
            // 直接设置到 job 对象上，模拟 Vue 的 $nextTick
            const updatedJob = {
              ...localJob,
              pickedTargets: pickedTargets,
            };
            setLocalJob(updatedJob);

            // 立即同步通知父组件，确保依赖该扫描任务的其他任务能立刻获得数据
            onJobChange?.(updatedJob);

            // 异步处理仓库相关逻辑
            setTimeout(() => {
              // 为每个 pickedTarget 获取代码库信息
              pickedTargets?.forEach((service) => {
                service.key = `${service.service_name}/${service.service_module}`;
                if (service.repos && service.repos.length > 0 && !service.repoIsFeteched) {
                  getServiceRepoInfo(service);
                }
              });

              if (!utils.isEmpty(webhookSelectedRepo)) {
                checkRepoTooltip(webhookSelectedRepo);
              }
            }, 0);
          }
        } else if (localJob.spec.source === 'fromjob') {
          const dataSource = editRunner || stageExecMode ? localJob.spec.service_and_scannings : localJob.spec.service_scanning_options;
          const pickedTargets =
            dataSource?.filter((itemA) => {
              if (sourceJob?.type === 'zadig-build') {
                return sourceJob.spec.service_and_builds?.some((itemB) => itemB.service_name === itemA.service_name && itemB.service_module === itemA.service_module);
              } else if (sourceJob?.type === 'zadig-deploy') {
                return sourceJob.pickedTargets?.some(
                  (itemB) => itemB.service_name === itemA.service_name && (itemB.modules?.filter((module: any) => module.service_module === itemA.service_module)?.length || 0) > 0
                );
              } else if (sourceJob?.type === 'zadig-distribute-image') {
                // 构建对服务有范围限制，如果引用类型为构建，则只展示构建的服务，否则展示原始引用的服务
                if (refJob?.type === 'zadig-build') {
                  return refJob.spec.service_and_builds?.some((itemB) => itemB.service_name === itemA.service_name && itemB.service_module === itemA.service_module);
                } else {
                  return sourceJob.spec.targets?.some((itemB) => itemB.service_name === itemA.service_name && itemB.service_module === itemA.service_module);
                }
              } else if (sourceJob?.type === 'zadig-test') {
                // 构建对服务有范围限制，如果引用类型为构建，则只展示构建的服务，否则展示原始引用的服务
                if (refJob?.type === 'zadig-build') {
                  return refJob.spec.service_and_builds?.some((itemB) => itemB.service_name === itemA.service_name && itemB.service_module === itemA.service_module);
                } else {
                  return sourceJob.spec.target_services?.some((itemB) => itemB.service_name === itemA.service_name && itemB.service_module === itemA.service_module);
                }
              } else if (sourceJob?.type === 'zadig-scanning') {
                // 构建对服务有范围限制，如果引用类型为构建，则只展示构建的服务，否则展示原始引用的服务
                if (refJob?.type === 'zadig-build') {
                  return refJob.spec.service_and_builds?.some((itemB) => itemB.service_name === itemA.service_name && itemB.service_module === itemA.service_module);
                } else {
                  return sourceJob.spec.target_services?.some((itemB) => itemB.service_name === itemA.service_name && itemB.service_module === itemA.service_module);
                }
              } else if (sourceJob?.type === 'freestyle') {
                // 构建对服务有范围限制，如果引用类型为构建，则只展示构建的服务，否则展示原始引用的服务
                if (refJob?.type === 'zadig-build') {
                  return refJob.spec.service_and_builds?.some((itemB) => itemB.service_name === itemA.service_name && itemB.service_module === itemA.service_module);
                } else {
                  return sourceJob.spec.services?.some((itemB) => itemB.service_name === itemA.service_name && itemB.service_module === itemA.service_module);
                }
              } else {
                return false;
              }
            }) || [];

          // 处理 ref_repos 逻辑
          if (localJob.spec.ref_repos) {
            handleRefRepos(pickedTargets);
          }

          const updatedJob = {
            ...localJob,
            pickedTargets: pickedTargets,
          };
          setLocalJob(updatedJob);

          // fromjob模式立即通知父组件pickedTargets的变化，确保依赖任务能立刻获得数据
          if (pickedTargets && pickedTargets.length > 0) {
            onJobChange?.(updatedJob);
          }

          // 异步处理仓库相关逻辑
          setTimeout(() => {
            pickedTargets?.forEach((service) => {
              service.key = `${service.service_name}/${service.service_module}`;
              if (service.repos && service.repos.length > 0 && !service.repoIsFeteched) {
                getServiceRepoInfo(service);
              }
            });

            if (!utils.isEmpty(webhookSelectedRepo)) {
              checkRepoTooltip(webhookSelectedRepo);
            }
          }, 0);
        }
      }

      setIsInitializing(false);
    }, [localJob, editRunner, stageExecMode, sourceJob, refJob]);

    // 处理 ref_repos 逻辑 - 完全按照 Vue 版本实现
    const handleRefRepos = (pickedTargets: TargetService[]) => {
      if (sourceJob?.type === 'zadig-build') {
        pickedTargets.forEach((scanningService) => {
          const buildService = sourceJob.spec.service_and_builds?.find(
            (item) => item.service_name === scanningService.service_name && item.service_module === scanningService.service_module
          );
          if (scanningService.repos && scanningService.repos.length > 0) {
            scanningService.repos.forEach((scanRepo) => {
              const matchingRepo = buildService?.repos?.find(
                (buildRepo: any) =>
                  buildRepo.repo_owner === scanRepo.repo_owner && buildRepo.repo_namespace === scanRepo.repo_namespace && buildRepo.repo_name === scanRepo.repo_name
              );
              if (matchingRepo) {
                scanRepo.commit_id = matchingRepo.commit_id;
                scanRepo.branch = matchingRepo.branch;
                scanRepo.tag = matchingRepo.tag;
                scanRepo.branchOrTag = matchingRepo.branchOrTag;
                scanRepo.prs = matchingRepo.prs;
                scanRepo.repoSync = true;
              }
            });
          }
        });
      } else if (sourceJob?.type === 'zadig-scanning') {
        pickedTargets.forEach((scanningService) => {
          const originScanningService = sourceJob.pickedTargets?.find(
            (item) => item.service_name === scanningService.service_name && item.service_module === scanningService.service_module
          );
          if (scanningService.repos && scanningService.repos.length > 0 && originScanningService && originScanningService.repos) {
            scanningService.repos.forEach((scanRepo) => {
              const matchingRepo = originScanningService.repos?.find(
                (buildRepo: any) =>
                  buildRepo.repo_owner === scanRepo.repo_owner && buildRepo.repo_namespace === scanRepo.repo_namespace && buildRepo.repo_name === scanRepo.repo_name
              );
              if (matchingRepo) {
                scanRepo.commit_id = matchingRepo.commit_id;
                scanRepo.branch = matchingRepo.branch;
                scanRepo.tag = matchingRepo.tag;
                scanRepo.branchOrTag = matchingRepo.branchOrTag;
                scanRepo.prs = matchingRepo.prs;
                scanRepo.repoSync = true;
              }
            });
          }
        });
      } else if (sourceJob?.type === 'freestyle') {
        pickedTargets.forEach((scanningService) => {
          const freestyleService = sourceJob.spec.services?.find(
            (item) => item.service_name === scanningService.service_name && item.service_module === scanningService.service_module
          );
          if (scanningService.repos && scanningService.repos.length > 0 && freestyleService && freestyleService.repos) {
            scanningService.repos.forEach((scanRepo) => {
              const matchingRepo = freestyleService.repos?.find(
                (buildRepo: any) =>
                  buildRepo.repo_owner === scanRepo.repo_owner && buildRepo.repo_namespace === scanRepo.repo_namespace && buildRepo.repo_name === scanRepo.repo_name
              );
              if (matchingRepo) {
                scanRepo.commit_id = matchingRepo.commit_id;
                scanRepo.branch = matchingRepo.branch;
                scanRepo.tag = matchingRepo.tag;
                scanRepo.branchOrTag = matchingRepo.branchOrTag;
                scanRepo.prs = matchingRepo.prs;
                scanRepo.repoSync = true;
              }
            });
          }
        });
      } else if (sourceJob?.type === 'zadig-test') {
        pickedTargets.forEach((scanningService) => {
          const originTestService = sourceJob.pickedTargets?.find(
            (item) => item.service_name === scanningService.service_name && item.service_module === scanningService.service_module
          );
          if (scanningService.repos && scanningService.repos.length > 0 && originTestService && originTestService.repos) {
            scanningService.repos.forEach((scanRepo) => {
              const matchingRepo = originTestService.repos?.find(
                (buildRepo: any) =>
                  buildRepo.repo_owner === scanRepo.repo_owner && buildRepo.repo_namespace === scanRepo.repo_namespace && buildRepo.repo_name === scanRepo.repo_name
              );
              if (matchingRepo) {
                scanRepo.commit_id = matchingRepo.commit_id;
                scanRepo.branch = matchingRepo.branch;
                scanRepo.tag = matchingRepo.tag;
                scanRepo.branchOrTag = matchingRepo.branchOrTag;
                scanRepo.prs = matchingRepo.prs;
                scanRepo.repoSync = true;
              }
            });
          }
        });
      }
    };

    // 检查仓库提示 - 完全按照 Vue 版本实现
    const checkRepoTooltip = (val: any) => {
      if (!val) return;

      localJob.spec.scannings?.forEach((test) => {
        if (test.repos) {
          test.repos.forEach((repo) => {
            if (repo.codehost_id === val.codehost_id && repo.repo_name === val.repo_name && repo.repo_owner === val.repo_owner) {
              repo.showTip = true;
            } else {
              repo.showTip = false;
            }
          });
        }
      });

      localJob.pickedTargets?.forEach((test) => {
        if (test.repos) {
          test.repos.forEach((repo) => {
            if (repo.codehost_id === val.codehost_id && repo.repo_name === val.repo_name && repo.repo_owner === val.repo_owner) {
              repo.showTip = true;
            } else {
              repo.showTip = false;
            }
          });
        }
      });

      // checkRepoTooltip是被动更新显示状态，不需要通知父组件
    };

    // 获取服务仓库信息 - 完全按照 Vue 版本实现
    const getServiceRepoInfo = async (service: TargetService) => {
      const originRepos = service.repos;

      if (!originRepos || originRepos.length === 0) {
        return;
      }

      // 构造查询参数
      const reposQuery = originRepos
        .filter((re) => re.source_from !== 'param')
        .map((re) => ({
          source: re.source,
          repo_owner: re.repo_owner,
          repo: re.repo_name,
          default_branch: re.branch,
          codehost_id: re.codehost_id,
          repo_namespace: re.repo_namespace,
          filter_regexp: re.filter_regexp,
        }));

      const commitRepos = originRepos.filter((re) => re.source_from !== 'param' && re.enable_commit);

      try {
        // 获取所有分支信息 
        const res = await getAllBranchInfoAPI({ infos: reposQuery });

        if (res) {
          res.forEach((repo: any) => {
            if (repo.prs) {
              repo.prs.forEach((element: any) => {
                element.pr = element.id;
              });
              repo.branchPRsMap = utils.arrayToMapOfArrays(repo.prs, 'targetBranch');
            } else {
              repo.branchPRsMap = {};
            }
            repo.branchNames = repo.branches ? repo.branches.map((b: any) => b.name) : [];
          });

          const repoInfoMap = keyBy(res, (repo: any) => `${repo.repo_owner}/${repo.repo}`);
          const commitInfoMap = await getCommitInfoMap(commitRepos);

          // 更新原始仓库信息
          originRepos.forEach((repo) => {
            updateRepoInfo(repo, repoInfoMap, commitInfoMap);
          });

          // 标记仓库信息已获取，并触发 React 重新渲染
          service.repoIsFeteched = true;
          // 强制触发重新渲染 - 更新本地Job状态，确保所有引用都更新
          setLocalJob((prevJob) => {
            const updatedJob = { ...prevJob };
            // 更新 pickedTargets 中对应的服务
            if (updatedJob.pickedTargets) {
              updatedJob.pickedTargets = updatedJob.pickedTargets.map((target) => {
                if (target.service_name === service.service_name && target.service_module === service.service_module) {
                  // 更新 pickedTarget 中的仓库状态
                  return { ...target, repoIsFeteched: service.repoIsFeteched };
                }
                return target;
              });
            }
            //更新 scannings 中对应的服务
            if (updatedJob.spec.scannings) {
              updatedJob.spec = {
                ...updatedJob.spec,
                scannings: updatedJob.spec.scannings.map((scanning) => {
                  if (scanning.service_name === service.service_name && scanning.service_module === service.service_module) {
                    return { ...scanning, repoIsFeteched: service.repoIsFeteched, repos: service.repos };
                  }
                  return scanning;
                }),
              };
            }
            // 更新 service_scanning_options 中对应的服务
            if (updatedJob.spec.service_scanning_options) {
              updatedJob.spec = {
                ...updatedJob.spec,
                service_scanning_options: updatedJob.spec.service_scanning_options.map((option) => {
                  if (option.service_name === service.service_name && option.service_module === service.service_module) {
                    return { ...option, repoIsFeteched: service.repoIsFeteched };
                  }
                  return option;
                }),
              };
            }

            // 更新 service_and_scannings 中对应的服务
            if (updatedJob.spec.service_and_scannings) {
              updatedJob.spec = {
                ...updatedJob.spec,
                service_and_scannings: updatedJob.spec.service_and_scannings.map((scanning) => {
                  if (scanning.service_name === service.service_name && scanning.service_module === service.service_module) {
                    return { ...scanning, repoIsFeteched: service.repoIsFeteched };
                  }
                  return scanning;
                }),
              };
            }

            return updatedJob;
          });
        }
      } catch (error) {
        console.error('Failed to fetch repo info:', error);
        service.repoIsFeteched = false;
      }
    };

    // 获取提交信息映射
    const getCommitInfoMap = async (commitRepos: RepoInfo[]) => {
      const commitInfoMap: Record<string, any[]> = {};
      const commitPromises = commitRepos.map(async (repo) => {
        try {
          const commits = await getBranchCommitInfoAPI(repo.codehost_id || repo.code_host_id, repo.repo_namespace, repo.repo_name, repo.branch || '');
          if (commits) {
            commitInfoMap[`${repo.repo_owner}/${repo.repo_name}`] = commits;
          }
        } catch (error) {
          console.error(`Failed to fetch commit info for ${repo.repo_name}`, error);
        }
      });
      await Promise.all(commitPromises);
      return commitInfoMap;
    };

    // 更新仓库信息
    const updateRepoInfo = (repo: RepoInfo, repoInfoMap: Record<string, any>, commitInfoMap: Record<string, any[]>) => {
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
      (repo as any)[repo.prNumberPropName || 'pr'] = (repo as any)[repo.prNumberPropName || 'pr'] || null;
      repo.tag = repo.tag || '';

      let branchOrTag: BranchOrTag | undefined = undefined;
      if (repo.branch) {
        branchOrTag = { type: 'branch' as const, id: `branch-${repo.branch}`, name: repo.branch };
      } else if (repo.tag) {
        branchOrTag = { type: 'tag' as const, id: `tag-${repo.tag}`, name: repo.tag };
      }
      repo.branchOrTag = branchOrTag;
      repo.branchAndTagList = [
        {
          label: 'Branches',
          options: (repo.branchNames || []).map((name) => ({ type: 'branch' as const, id: `branch-${name}`, name })),
        },
        {
          label: 'Tags',
          options: (repo.tags || []).map((tag: any) => ({ type: 'tag' as const, id: `tag-${tag.name}`, name: tag.name })),
        },
      ];
    };

    // 搜索仓库信息 - 完全按照 Vue 版本实现
    const searchRepoInfo = async (build: RepoInfo, query: string) => {
      const reposQuery = [
        {
          source: build.source,
          repo_owner: build.repo_owner,
          repo: build.repo_name,
          default_branch: build.branch,
          codehost_id: build.codehost_id || build.code_host_id,
          repo_namespace: build.repo_namespace,
          filter_regexp: build.filter_regexp,
          key: query,
        },
      ];

      try {
        const res = await getAllBranchInfoAPI({ infos: reposQuery });

        const branches = build.branchAndTagList ? build.branchAndTagList.find((item) => item.label === 'Branches') : { options: [] as any[] };
        const tags = build.branchAndTagList ? build.branchAndTagList.find((item) => item.label === 'Tags') : { options: [] as any[] };

        if (build.source === 'other' && res.length === 0) {
          res[0] = {
            branches: build.branchOrTag?.type === 'branch' ? [build.branchOrTag] : [],
            tags: build.branchOrTag?.type === 'tag' ? [build.branchOrTag] : [],
          };
          if (query) {
            res[0] = { branches: [], tags: [] };
          }
        }

        if (res && res.length > 0) {
          build.loading = false;
          if (branches) {
            branches.options = res[0].branches?.map((item: any) => ({ id: 'branch-' + item.name, name: item.name, type: 'branch' })) || [];
          }
          if (tags) {
            tags.options = res[0].tags?.map((item: any) => ({ id: 'tag-' + item.name, name: item.name, type: 'tag' })) || [];
          }
        } else {
          if (branches) branches.options = [];
          if (tags) tags.options = [];
        }

        if (query && branches && tags) {
          const queryBranchInResponse = branches.options.findIndex((element: any) => element.name === query && element.type === 'branch');
          const queryTagInResponse = tags.options.findIndex((element: any) => element.name === query && element.type === 'tag');
          if (queryBranchInResponse === -1) {
            branches.options.unshift({ id: 'addBranch-' + query, name: query, type: 'branch' } as any);
          }
          if (queryTagInResponse === -1) {
            tags.options.unshift({ id: 'addTag-' + query, name: query, type: 'tag' } as any);
          }
        }

        // 搜索仓库信息是内部状态更新，不需要通知父组件
      } catch (error) {
        console.error('Failed to search repo info:', error);
      }
    };

    // 更改分支或标签 - 完全按照 Vue 版本实现
    const changeBranchOrTag = async (build: RepoInfo) => {
      if (build.branchOrTag) {
        if (build.prNumberPropName) {
          (build as any)[build.prNumberPropName] = null;
        }
        if (build.branchOrTag.type === 'branch') {
          build.branch = build.branchOrTag.name;
          build.tag = '';
          if (build.enable_commit) {
            try {
              const res = await getBranchCommitInfoAPI(build.codehost_id || build.code_host_id, build.repo_namespace, build.repo_name, build.branchOrTag.name);
              build.commits = res;
              // 获取commits是内部状态更新，在changeBranchOrTag最后统一通知
            } catch (error) {
              console.error('Failed to fetch commit info:', error);
            }
          }
        }
        if (build.branchOrTag.type === 'tag') {
          build.tag = build.branchOrTag.name;
          build.branch = '';
        }
        onJobChange?.(localJob);
      }
    };

    // 验证方法 - 完全按照 Vue 版本实现
    const validate = async (): Promise<boolean> => {
      return new Promise((resolve) => {
        const jobName = localJob.name;
        if (localJob.spec.scanning_type === '') {
          if (localJob.spec.scannings && localJob.spec.scannings.length > 0) {
            return resolve(true);
          }
          Toast.error(`${jobName}: 至少选择一个扫描`);
          return resolve(false);
        } else if (localJob.spec.scanning_type === 'service_scanning') {
          if (localJob.spec.source === 'runtime') {
            if (localJob.pickedTargets && localJob.pickedTargets.length > 0) {
              return resolve(true);
            }
          } else if (localJob.spec.source === 'fromjob') {
            if (localJob.pickedTargets && localJob.pickedTargets.length > 0) {
              return resolve(true);
            }
          }
          Toast.error(`${jobName}: 至少选择一个服务组件`);
          return resolve(false);
        }
        return resolve(true);
      });
    };

    // 处理目标服务选择变化
    const handleTargetServicesChange = (selectedServices: TargetService[]) => {
      if (viewMode) return;

      setLocalJob((prev) => {
        const updatedJob = {
          ...prev,
          spec: {
            ...prev.spec,
            target_services: selectedServices,
          },
          // ✅ 保留原有的 pickedTargets，避免被父组件覆盖
          pickedTargets: prev.pickedTargets,
        };

        // 使用更新后的 job 通知父组件
        onJobChange?.(updatedJob);
        return updatedJob;
      });
    };

    // 更新变量值
    const updateKeyVal = (service: TargetService, keyVal: KeyVal, field: string, value: any) => {
      if (viewMode) return;
      (keyVal as any)[field] = value;
      // keyVal 是引用类型，直接修改即可，不需要额外的状态更新
      onJobChange?.(localJob);
    };

    // 更新仓库信息
    const updateRepo = (repo: RepoInfo, field: string, value: any) => {
      if (viewMode) return;
      (repo as any)[field] = value;
      // repo 是引用类型，直接修改即可，不需要额外的状态更新
      onJobChange?.(localJob);
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

    // 优化的生命周期和监听器 - 避免无限循环
    useEffect(() => {
      if (!initRef.current) {
        init();
        initRef.current = true;
      }
    }, []); // 只在组件挂载时初始化一次

    // 监听关键字段变化
    useEffect(() => {
      if (initRef.current && localJob.spec.target_services) {
        init();
      }
    }, [localJob.spec.target_services?.length]); // 只监听数组长度变化

    // 监听 webhookSelectedRepo 变化
    useEffect(() => {
      if (initRef.current) {
        checkRepoTooltip(webhookSelectedRepo);
      }
    }, [webhookSelectedRepo]);

    // 暴露方法给父组件
    useImperativeHandle(ref, () => ({
      validate,
      getLatestJobData: () => {
        return localJob;
      },
    }));

    // 渲染变量表格
    const renderVariableTable = (keyVals: KeyVal[]) => {
      const filteredVars = keyVals.filter((item) => !(item.source === 'fixed' || item.source === 'reference'));
      if (filteredVars.length === 0) return null;

      return (
        <Table dataSource={filteredVars} pagination={false} size="small" className="variable-table">
          <Column title="键" dataIndex="key" key="key" />
          <Column title="描述" dataIndex="description" key="description" />
          <Column
            title="值"
            key="value"
            render={(_, record: KeyVal) => {
              if (record.type === 'choice') {
                return (
                  <Select
                    value={record.value}
                    onChange={(value) => updateKeyVal({} as TargetService, record, 'value', value)}
                    style={{ width: '100%' }}
                    disabled={viewMode}
                    filter
                    optionList={(record.choice_option || []).map((option) => ({
                      label: option,
                      value: option,
                    }))}
                  />
                );
              } else if (record.type === 'multi-select') {
                return (
                  <Select
                    value={record.choice_value || []}
                    onChange={(value) => updateKeyVal({} as TargetService, record, 'choice_value', value)}
                    style={{ width: '100%' }}
                    disabled={viewMode}
                    multiple
                    filter
                    optionList={(record.choice_option || []).map((option) => ({
                      label: option,
                      value: option,
                    }))}
                  />
                );
              } else if (record.type === 'string') {
                return (
                  <Input
                    value={record.value}
                    onChange={(value) => updateKeyVal({} as TargetService, record, 'value', value)}
                    disabled={viewMode}
                    mode={record.is_credential ? 'password' : undefined}
                    style={{ width: '100%' }}
                  />
                );
              } else if (record.type === 'text') {
                return (
                  <TextArea
                    value={record.value}
                    onChange={(value) => updateKeyVal({} as TargetService, record, 'value', value)}
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

      return (
        <div key={index} className="build-row">
          {/* 仓库名称 */}
          {!isPerforce && (
            <div style={{ width: '33%' }}>
              <Tooltip content={repo.repo_name}>
                <Text ellipsis className="repo-name">
                  {utils.tailCut(repo.repo_name, 20)}
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
              {repo.depot_type === 'stream' && (
                <Input
                  value={repo.stream}
                  onChange={(value) => updateRepo(repo, 'stream', value)}
                  placeholder="stream"
                  disabled={viewMode}
                  style={{ width: '33%', marginRight: 10 }}
                />
              )}
              {repo.depot_type === 'local' && (
                <TextArea
                  value={repo.view_mapping}
                  onChange={(value) => updateRepo(repo, 'view_mapping', value)}
                  placeholder="View Mapping"
                  disabled={viewMode}
                  style={{ width: '33%', marginRight: 10 }}
                />
              )}
              <Input
                value={typeof repo.changelist_id === 'number' ? repo.changelist_id : ''}
                onChange={(value) => updateRepo(repo, 'changelist_id', Number(value))}
                placeholder="Change List ID"
                disabled={viewMode}
                style={{ width: '28%' }}
              />
              <Input
                value={typeof repo.shelve_id === 'number' ? repo.shelve_id : ''}
                onChange={(value) => updateRepo(repo, 'shelve_id', Number(value))}
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
                        value={repo.branchOrTag?.name || ''}
                        onChange={(value) => updateRepo(repo, 'branchOrTag', { name: value, id: `manual-${value}`, type: 'branch' })}
                        placeholder="输入分支或标签"
                        disabled={viewMode}
                      />
                    ) : (
                      <Select
                        value={repo.branchOrTag?.id}
                        onChange={(value) => {
                          const allOptions = [...(repo.branchAndTagList?.[0]?.options || []), ...(repo.branchAndTagList?.[1]?.options || [])];
                          const selectedItem = allOptions.find((item) => item.id === value);
                          if (selectedItem) {
                            updateRepo(repo, 'branchOrTag', selectedItem);
                            changeBranchOrTag(repo);
                          }
                        }}
                        onSearch={(query) => searchRepoInfo(repo, query)}
                        onClear={() => searchRepoInfo(repo, '')}
                        filter
                        placeholder="选择分支或标签"
                        disabled={viewMode}
                        style={{ minWidth: 150 }}
                      >
                        {(repo.branchAndTagList || []).map((group, groupIndex) => (
                          <Select.OptGroup label={group.label} key={`${groupIndex}-${group.label}-${repo._id_}`}>
                            {(group.options || []).map((item, itemIndex) => (
                              <Select.Option value={item.id} key={`${itemIndex}-${item.id}-${group.label}`}>
                                {item.id.startsWith('addTag') || item.id.startsWith('addBranch') ? `使用PR或Tag模板"${item.name}"` : item.name}
                              </Select.Option>
                            ))}
                          </Select.OptGroup>
                        ))}
                      </Select>
                    )}
                  </>
                )}
              </div>

              {repo.source !== 'other' && (
                <div style={{ width: '28%', marginLeft: 10 }}>
                  {repo.repoSync ? (
                    <Text style={{ lineHeight: '32px' }}>
                      {repo.enable_commit ? repo.commit_id : repo.prs ? (Array.isArray(repo.prs) ? repo.prs.map((pr) => `#${pr}`).join(', ') : `#${repo.prs}`) : ''}
                    </Text>
                  ) : (
                    <>
                      {repo.enable_commit ? (
                        <Select
                          value={repo.commit_id}
                          onChange={(value) => updateRepo(repo, 'commit_id', value)}
                          placeholder="选择提交"
                          filter
                          disabled={viewMode}
                          optionList={(repo.commits || []).map((item) => ({
                            label: `${utils.tailCut(item.commit_id, 10)} ${utils.tailCut(item.commit_message, 60)}`,
                            value: item.commit_id,
                          }))}
                        />
                      ) : (
                        <>
                          {!utils.isEmpty(repo.branchPRsMap) ? (
                            <Select
                              multiple
                              value={repo.prs || []}
                              onChange={(value) => updateRepo(repo, 'prs', value)}
                              placeholder="选择PR"
                              filter
                              disabled={(repo.branchOrTag && repo.branchOrTag.type === 'tag') || viewMode}
                              optionList={(repo.branchPRsMap?.[repo.branchOrTag?.name || ''] || []).map((item) => ({
                                label: `#${item[repo.prNumberPropName || 'pr']} ${item.title}`,
                                value: item[repo.prNumberPropName || 'pr'],
                              }))}
                            />
                          ) : (
                            <Tooltip content="PR不存在">
                              <Input
                                value={Array.isArray(repo.prs) ? repo.prs.join(',') : repo.prs || ''}
                                onChange={(value) => updateRepo(repo, 'prs', value)}
                                placeholder="输入PR"
                                disabled={(repo.branchOrTag && repo.branchOrTag.type === 'tag') || viewMode}
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
                  <IconInfoCircle className="repo-warning" />
                </Tooltip>
              )}
            </>
          )}
        </div>
      );
    };

    // 渲染扫描任务表格
    const renderScanningTable = () => {
      const dataSource = localJob.spec.scanning_type === 'service_scanning' ? localJob.pickedTargets || [] : localJob.spec.scannings || [];

      if (dataSource.length === 0) return null;

      return (
        <div className="workflow-scanning-rows">
          <Table
            dataSource={dataSource}
            pagination={false}
            empty="无"
            rowKey={(record) => record?.key || record?.name || `${record?.service_name || ''}-${record?.service_module || ''}`}
          >
            {/* 展开列 */}
            <Column
              key="expand"
              width={50}
              render={(text, record) => {
                const hasVars = record.key_vals && record.key_vals.filter((item: any) => !(item.source === 'fixed' || item.source === 'reference')).length > 0;

                if (!hasVars) return null;

                const isExpanded = expandedKeys.includes(String(record.key || record.name || ''));
                return (
                  <Button
                    theme="borderless"
                    size="small"
                    icon={isExpanded ? <IconChevronDown /> : <IconChevronRight />}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExpand(String(record.key || record.name || ''));
                    }}
                  />
                );
              }}
            />

            {/* 服务组件列 - 仅在服务扫描模式显示 */}
            {localJob.spec.scanning_type === 'service_scanning' && (
              <Column
                title="服务组件"
                dataIndex="service_module"
                key="service_module"
                width={180}
                render={(text, record: TargetService) => (
                  <Tooltip content={record.service_name}>
                    <span style={{ cursor: 'pointer' }}>{text}</span>
                  </Tooltip>
                )}
              />
            )}

            {/* 扫描名称列 */}
            <Column title={localJob.spec.scanning_type === 'service_scanning' ? '扫描名称' : '测试名称'} dataIndex="name" key="name" width={180} />

            {/* 代码库列 */}
            <Column
              title="代码库"
              key="repository"
              render={(text, record: TargetService) => {
                const visibleRepos = (record.repos || []).filter((repo) => !repo.hidden);

                return (
                  <div>
                    {visibleRepos.map((repo, index) => renderRepoRow(repo, index))}
                    {visibleRepos.length === 0 && record.repos && record.repos.length > 0 && <Text type="tertiary">所有代码库已隐藏</Text>}
                    {!record.repos || (record.repos.length === 0 && <Text type="tertiary">无代码库信息</Text>)}
                  </div>
                );
              }}
            />
          </Table>

          {/* 渲染展开的变量表格 */}
          {dataSource.map((service) => {
            const key = service.key || service.name || '';
            if (!expandedKeys.includes(key)) return null;
            if (!service.key_vals || service.key_vals.length === 0) return null;

            return <div key={key}>{renderVariableTable(service.key_vals)}</div>;
          })}
        </div>
      );
    };

    // 渲染服务组件选择
    const renderServiceSelection = () => {
      if (localJob.spec.scanning_type !== 'service_scanning' || localJob.spec.source !== 'runtime') {
        return null;
      }

      return (
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            服务组件
          </Text>
          <Select
            multiple
            value={(localJob.spec.target_services || []).map((service) => service.key || `${service.service_name}/${service.service_module}`)}
            onChange={(selectedKeys) => {
              const keys = Array.isArray(selectedKeys) ? selectedKeys : [selectedKeys].filter(Boolean);
              const selectedServices = (localJob.spec.service_scanning_options || []).filter((service) =>
                keys.includes(service.key || `${service.service_name}/${service.service_module}`)
              );
              handleTargetServicesChange(selectedServices);
            }}
            placeholder="请选择服务组件"
            style={{ width: '100%' }}
            disabled={viewMode}
            filter
            optionList={(localJob.spec.service_scanning_options || []).map((service) => ({
              label: `${service.service_module}(${service.service_name})`,
              value: service.key || `${service.service_name}/${service.service_module}`,
              key: service.key || `${service.service_name}/${service.service_module}`,
            }))}
          />
        </div>
      );
    };

    return (
      <div className="job-zadig-scanning">
        {renderServiceSelection()}
        {renderScanningTable()}
      </div>
    );
  }
);

export default ZadigScanning;
