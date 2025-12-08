import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Select, Modal, Button, Switch, Checkbox, Toast, Form } from '@douyinfe/semi-ui';
import { IconCopy, IconChevronRight } from '@douyinfe/semi-icons';
import { getNacosNamespaceAPI, getNacosConfigAPI, getNacosConfigDetailAPI } from '../../../../api/service';
import CodeMirror from '@uiw/react-codemirror';
import { yaml } from '@codemirror/lang-yaml';
import { json } from '@codemirror/lang-json';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { diffLines } from 'diff';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import CodeDiff from '../CodeDiff';
import './Nacos.css';

interface NacosConfig {
  data_id: string;
  group: string;
  namespace_name: string;
  namespace_id: string;
  content: string;
  original_content?: string;
  format?: string;
  label?: string;
  key: string;
  diff?: Array<{
    added?: boolean;
    removed?: boolean;
    value: string;
  }>;
  cloneData?: boolean;
}

interface NamespaceItem {
  namespace_id: string;
  namespace_name: string;
}

interface CompareInfo {
  dialogVisible: boolean;
  newConfig?: NacosConfig | null;
  oldConfigName: string;
  configs: NacosConfig[];
  newString: string;
  oldString: string;
  lang: string;
  outputFormat: 'line-by-line' | 'side-by-side';
  onlyShowDiff: boolean;
}

interface JobSpec {
  source?: string;
  nacos_id?: string;
  namespace_id?: string;
  nacos_datas?: NacosConfig[];
  default_nacos_datas?: NacosConfig[];
  nacos_filtered_data?: NacosConfig[];
  data_fixed?: boolean;
  [key: string]: any;
}

interface Job {
  name: string;
  type: string;
  spec: JobSpec;
  [key: string]: any;
}

interface NacosProps {
  job: Job;
  projectName: string;
  stageExecMode?: boolean;
  editRunner?: boolean;
  viewMode?: boolean;
  onJobChange?: (updatedJob: Job) => void;
}

export interface NacosRef {
  validate: () => Promise<boolean>;
}

const Nacos = forwardRef<NacosRef, NacosProps>(({ job, projectName, stageExecMode = false, editRunner = false, viewMode = false, onJobChange }, ref) => {
  // 使用本地状态管理job，确保不直接修改props
  const [localJob, setLocalJob] = useState<Job>(() => ({ ...job }));
  const [namespaceList, setNamespaceList] = useState<NamespaceItem[]>([]);
  const [configList, setConfigList] = useState<NacosConfig[]>([]);
  const [compareInfo, setCompareInfo] = useState<CompareInfo>({
    dialogVisible: false,
    newConfig: null,
    oldConfigName: '',
    configs: [],
    newString: '',
    oldString: '',
    lang: 'yaml',
    outputFormat: 'line-by-line',
    onlyShowDiff: false,
  });

  const formRef = useRef<any>(null);

  // 防抖同步本地job变更到父组件，避免过于频繁的更新
  const syncJobToParent = (updatedJob: Job, immediate: boolean = false) => {
    if (!onJobChange) return;

    // 如果是立即更新（如选择变化），直接同步
    if (immediate) {
      onJobChange(updatedJob);
      return;
    }

    // 对于内容编辑等高频操作，检查是否真的有变化
    const currentContent = JSON.stringify(updatedJob.spec?.nacos_config || []);
    const lastSyncedContent = JSON.stringify(localJob.spec?.nacos_config || []);

    if (currentContent !== lastSyncedContent) {
      onJobChange(updatedJob);
    }
  };

  // 暴露给父组件的方法
  useImperativeHandle(
    ref,
    () => ({
      validate: async () => {
        const jobName = localJob.name;
        if (localJob.spec.nacos_datas && localJob.spec.nacos_datas.length === 0) {
          Toast.error(`${jobName}: 请选择配置`);
          return false;
        }
        return true;
      },
      getLatestJobData: () => {
        return localJob;
      },
    }),
    [localJob]
  );

  // 组件初始化和关键字段变化时重新初始化
  useEffect(() => {
    // 初始化本地job状态
    setLocalJob({ ...job });

    // 检查是否需要初始化（有 nacos_id 就需要初始化）
    if (job.spec?.nacos_id) {
      init();
    }
  }, [job.name, job.spec?.nacos_id, job.spec?.namespace_id, JSON.stringify(job.spec?.nacos_datas || []), JSON.stringify(job.spec?.nacos_filtered_data || [])]);

  // 获取命名空间列表 - 对应Vue版本的getNamespace方法
  const getNamespace = (nacosId: string) => {
    getNacosNamespaceAPI(nacosId)
      .then((res) => {
        setNamespaceList(res || []);
      })
      .catch((error) => {
        console.error('获取命名空间列表失败:', error);
        setNamespaceList([]);
      });
  };

  // 获取配置列表 - 完全对应Vue版本的getConfigList方法
  const getConfigList = (nacosId: string, namespaceId: string, clear = true) => {
    if (clear) {
      setLocalJob((prev) => {
        const updatedJob = {
          ...prev,
          spec: {
            ...prev.spec,
            nacos_datas: [],
          },
        };
        // 同步到父组件（选择操作，立即更新）
        syncJobToParent(updatedJob, true);
        return updatedJob;
      });
    }

    if (namespaceId) {
      getNacosConfigAPI(nacosId, namespaceId)
        .then((res) => {
          if (res) {
            res.forEach((item: any) => {
              item.content = '';
              item.format = '';
              item.original_content = '';
              item.diff = [];
            });

            const mappedConfigs = res
              .map((item: any) => {
                return {
                  ...item,
                  key: `${item.group}/${item.namespace_name}/${item.data_id}`,
                };
              })
              .filter((item: any) => {
                if (localJob.spec.source === 'fixed' && localJob.spec.nacos_filtered_data && localJob.spec.nacos_filtered_data.length > 0) {
                  return localJob.spec.nacos_filtered_data.some((filteredData) => filteredData.group === item.group && filteredData.data_id === item.data_id);
                }
                return true;
              });

            setConfigList(mappedConfigs);

            if (!(stageExecMode || editRunner)) {
              const defaultDatas = localJob.spec.default_nacos_datas || [];
              defaultDatas.forEach((item) => {
                const itemConfig = mappedConfigs.find((config) => config.group === item.group && config.data_id === item.data_id);
                if (itemConfig) {
                  item.namespace_name = itemConfig.namespace_name;
                  item.namespace_id = itemConfig.namespace_id;
                  item.key = `${item.group}/${item.namespace_name}/${item.data_id}`;
                  item.diff = [];
                  item.original_content = '';
                  item.format = '';
                }
              });

              setLocalJob((prev) => {
                const updatedJob = {
                  ...prev,
                  spec: {
                    ...prev.spec,
                    nacos_datas: defaultDatas,
                  },
                };
                // 同步到父组件
                syncJobToParent(updatedJob);
                return updatedJob;
              });

              getConfigDetail(defaultDatas);
            }
          }
        })
        .catch((error) => {
          console.error('获取配置列表失败:', error);
          setConfigList([]);
        });
    }
  };

  // 获取配置详情 - 完全对应Vue版本的getConfigDetail方法
  const getConfigDetail = async (value: NacosConfig[]) => {
    if (value && value.length > 0) {
      try {
        const nacosId = localJob.spec.nacos_id;
        const namespaceId = localJob.spec.namespace_id;

        // 并行获取所有选中配置的详细信息
        await Promise.all(
          value.map(async (item) => {
            // 如果已经有 original_content，跳过获取
            if (item.original_content !== undefined && item.original_content !== '') {
              return;
            }

            try {
              const detail = await getNacosConfigDetailAPI(nacosId!, namespaceId!, item.group, item.data_id, projectName);

              if (item.cloneData) {
                item.content = item.content || '';
              } else {
                item.content = detail.content || '';
              }
              item.format = detail.format || item.format || 'TEXT';
              item.original_content = detail.content || '';
              item.diff = [];
              updateContent(item.content, item);
            } catch (error) {
              console.warn(`获取配置详情失败: ${item.group}/${item.data_id}`, error);
              // 设置默认值
              item.content = '';
              item.format = item.format || 'TEXT';
              item.original_content = '';
              item.diff = [];
            }
          })
        );

        // 更新localJob状态
        setLocalJob((prev) => {
          const updatedJob = {
            ...prev,
            spec: {
              ...prev.spec,
              nacos_datas: value,
            },
          };
          // 同步到父组件
          syncJobToParent(updatedJob);
          return updatedJob;
        });
      } catch (error) {
        console.error('批量获取配置详情失败:', error);
      }
    }
  };

  // 更新内容 - 对应Vue版本的updateContent方法
  const updateContent = (data: string, obj: NacosConfig) => {
    if (obj.original_content !== undefined && obj.original_content !== '') {
      obj.diff = diffLines(obj.original_content.replace(/\r\n|\r|\\n/g, '\n').replace(/\\t/g, '\t'), data.replace(/\r\n|\r|\\n/g, '\n').replace(/\\t/g, '\t'));
    }
  };

  // 初始化比较信息 - 对应Vue版本的initCompareInfo方法
  const initCompareInfo = () => {
    setCompareInfo({
      configs: [],
      onlyShowDiff: false,
      lang: 'yaml',
      oldConfigName: '',
      oldString: '',
      newConfig: null,
      newString: '',
      dialogVisible: false,
      outputFormat: 'line-by-line',
    });
  };

  // 比较配置 - 对应Vue版本的compareConfig方法
  const compareConfig = async (target: NacosConfig) => {
    const nacosId = localJob.spec.nacos_id;
    const namespaceId = localJob.spec.namespace_id;

    try {
      const configs = await getNacosConfigAPI(nacosId!, namespaceId!);
      if (configs) {
        setCompareInfo((prev) => ({
          ...prev,
          configs: configs.map((item: any) => ({
            ...item,
            label: `${item.group}/${item.namespace_name}/${item.data_id}`,
          })),
          lang: target.format?.toLowerCase() || 'yaml',
          oldConfigName: target.key,
          oldString: target.content,
          newString: '',
          dialogVisible: true,
        }));
      }
    } catch (error) {
      console.error('获取配置列表失败:', error);
    }
  };

  // 变更比较配置 - 对应Vue版本的changeCompareConfig方法
  const changeCompareConfig = async (value: NacosConfig) => {
    const nacosId = localJob.spec.nacos_id;
    const namespace = value.namespace_id;
    const groupName = value.group;
    const dataName = value.data_id;
    const projectNameParam = projectName;

    try {
      const config = await getNacosConfigDetailAPI(nacosId!, namespace, groupName, dataName, projectNameParam);

      if (config) {
        setCompareInfo((prev) => ({
          ...prev,
          newString: config.content || '',
        }));
      }
    } catch (error) {
      console.error('获取配置详情失败:', error);
    }
  };

  // 复制命令成功 - 对应Vue版本的copyCommandSuccess方法
  const copyCommandSuccess = () => {
    Toast.success('复制成功');
  };

  // 初始化方法 - 完全对应Vue版本的init方法
  const init = () => {
    if (localJob.spec.nacos_datas && localJob.spec.nacos_datas.length > 0 && (editRunner || stageExecMode)) {
      localJob.spec.nacos_datas.forEach((data) => {
        data.key = `${data.group}/${data.namespace_name}/${data.data_id}`;
        data.cloneData = true;
        delete data.original_content;
      });
    }

    if (localJob.spec.source === 'runtime') {
      getNamespace(localJob.spec.nacos_id!);
    }

    getConfigList(localJob.spec.nacos_id!, localJob.spec.namespace_id!, false);

    if (localJob.spec.nacos_datas) {
      getConfigDetail(localJob.spec.nacos_datas);
    }

    // 克隆、触发、阶段执行、从编辑器编辑、发布计划
    // 该模式下，nacos_datas 中的 original_content 设置为 nacos_filtered_data 中的内容，匹配规则为 同 group、namespace_name、data_id 的配置
    if (stageExecMode || editRunner) {
      // 如果 nacos_datas 存在 nacos_filtered_data 中不存在的内容，则将 nacos_datas 设置为空
      if (
        localJob.spec.nacos_datas &&
        localJob.spec.nacos_filtered_data &&
        localJob.spec.nacos_datas.some(
          (data) =>
            !localJob.spec.nacos_filtered_data!.some(
              (filteredData) => filteredData.group === data.group && filteredData.namespace_name === data.namespace_name && filteredData.data_id === data.data_id
            )
        )
      ) {
        setLocalJob((prev) => {
          const updatedJob = {
            ...prev,
            spec: {
              ...prev.spec,
              nacos_datas: [],
            },
          };
          // 同步到父组件
          syncJobToParent(updatedJob);
          return updatedJob;
        });
      }

      if (localJob.spec.nacos_filtered_data && localJob.spec.nacos_filtered_data.length > 0 && localJob.spec.nacos_datas) {
        localJob.spec.nacos_datas.forEach((data) => {
          const matchedData = localJob.spec.nacos_filtered_data!.find(
            (item) => item.group === data.group && item.namespace_name === data.namespace_name && item.data_id === data.data_id
          );
          if (matchedData) {
            data.original_content = matchedData.content;
          }
          updateContent(data.content, data);
        });
      }
    }
  };

  // 获取CodeMirror语言扩展
  const getLanguageExtension = (format: string) => {
    const formatLower = format.toLowerCase();
    switch (formatLower) {
      case 'yaml':
      case 'yml':
        return [yaml()];
      case 'json':
        return [json()];
      case 'javascript':
      case 'js':
        return [javascript()];
      default:
        return [];
    }
  };

  return (
    <section className="workflow-nacos-rows">
      {/* 配置比较对话框 */}
      <Modal
        title="比较配置内容"
        visible={compareInfo.dialogVisible}
        onCancel={initCompareInfo}
        width={900}
        className="nacos-compare-modal"
        footer={
          <Button size="default" onClick={() => setCompareInfo((prev) => ({ ...prev, dialogVisible: false }))}>
            确定
          </Button>
        }
      >
        <Form>
          <Form.Section text="选择配置">
            <div className="config-list">
              <Select
                value={compareInfo.newConfig?.key}
                onChange={(value) => {
                  const config = compareInfo.configs.find((c) => c.key === value);
                  if (config) {
                    changeCompareConfig(config);
                  }
                }}
                placeholder="请选择配置"
                optionList={compareInfo.configs.map((item) => ({
                  label: item.label,
                  value: item.key,
                }))}
                style={{ width: 200 }}
              />
              <span className="arrow">
                <IconChevronRight />
              </span>
              <span className="old-file-name">{compareInfo.oldConfigName}</span>
            </div>
          </Form.Section>
        </Form>

        <div className="compare-container">
          <div className="header">
            <div className="left">
              <span>配置差异</span>
            </div>
            <div className="right">
              <div className="operation">
                <span>分割</span>
                <Switch
                  checked={compareInfo.outputFormat === 'line-by-line'}
                  onChange={(checked) =>
                    setCompareInfo((prev) => ({
                      ...prev,
                      outputFormat: checked ? 'line-by-line' : 'side-by-side',
                    }))
                  }
                />
                <span>统一</span>
                <Checkbox
                  checked={compareInfo.onlyShowDiff}
                  onChange={(e) =>
                    setCompareInfo((prev) => ({
                      ...prev,
                      onlyShowDiff: Boolean(e.target.checked),
                    }))
                  }
                >
                  仅显示差异
                </Checkbox>
                <Button
                  size="default"
                  theme="borderless"
                  type="primary"
                  icon={<IconCopy />}
                  onClick={() => {
                    navigator.clipboard.writeText(compareInfo.newString);
                    copyCommandSuccess();
                  }}
                >
                  复制配置
                </Button>
              </div>
            </div>
          </div>
          <div className="content">
            <CodeDiff
              oldString={compareInfo.oldString}
              newString={compareInfo.newString}
              language={compareInfo.lang}
              outputFormat={compareInfo.outputFormat}
              context={compareInfo.onlyShowDiff ? 0 : 10}
            />
          </div>
        </div>
      </Modal>

      <Form
        ref={formRef}
        labelWidth="140px"
        initValues={{
          'spec.namespace_id': localJob.spec.namespace_id,
          'spec.nacos_datas': (localJob.spec.nacos_datas || []).map((data) => data.key),
        }}
      >
        {localJob.spec.source === 'runtime' && (
          <Form.Section>
            <Form.Select
              field="spec.namespace_id"
              label="命名空间"
              placeholder="请选择"
              onChange={(namespaceId) => {
                getConfigList(localJob.spec.nacos_id!, namespaceId as string);
                setLocalJob((prev) => {
                  const updatedJob = {
                    ...prev,
                    spec: {
                      ...prev.spec,
                      namespace_id: namespaceId as string,
                    },
                  };
                  // 同步到父组件
                  syncJobToParent(updatedJob);
                  return updatedJob;
                });
              }}
              disabled={viewMode}
              style={{ width: '100%' }}
              rules={[{ required: true, message: '请选择' }]}
            >
              {namespaceList.map((item, index) => (
                <Select.Option key={index} value={item.namespace_id}>
                  {item.namespace_name}
                </Select.Option>
              ))}
            </Form.Select>
          </Form.Section>
        )}

        {!localJob.spec.data_fixed && (
          <Form.Section>
            <Form.Select
              field="spec.nacos_datas"
              label="Nacos配置"
              placeholder="请选择"
              multiple
              onChange={(selectedKeys) => {
                const selectedConfigs = configList.filter((config) => (selectedKeys as string[]).includes(config.key));
                getConfigDetail(selectedConfigs);
                setLocalJob((prev) => {
                  const updatedJob = {
                    ...prev,
                    spec: {
                      ...prev.spec,
                      nacos_datas: selectedConfigs,
                    },
                  };
                  // 同步到父组件
                  syncJobToParent(updatedJob);
                  return updatedJob;
                });
              }}
              disabled={viewMode}
              style={{ width: '100%' }}
              rules={[{ required: true, message: '请选择' }]}
            >
              {configList.map((item, index) => (
                <Select.Option key={index} value={item.key}>
                  {item.key}
                </Select.Option>
              ))}
            </Form.Select>
          </Form.Section>
        )}

        {localJob.spec.nacos_datas && localJob.spec.nacos_datas.length > 0 && (
          <div className="nacos-config-section">
            <div className="config-section-header">
              <span className="config-section-title">配置内容</span>
              <span className="config-count">{localJob.spec.nacos_datas.length} 个配置</span>
            </div>

            <div className="config-list">
              {localJob.spec.nacos_datas.map((item, index) => (
                <div key={`${item.group}/${item.namespace_name}/${item.data_id}`} className="config-item">
                  <div className="config-item-header">
                    <div className="config-info">
                      <span className="config-name">{item.data_id}</span>
                      <span className="config-meta">
                        {item.group} · {item.namespace_name}
                        {item.format && <span className="config-format">{item.format}</span>}
                      </span>
                    </div>
                    <div className="config-actions">
                      <Button size="default" type="tertiary" onClick={() => compareConfig(item)} disabled={viewMode} icon={<IconChevronRight />}>
                        比较
                      </Button>
                    </div>
                  </div>

                  <div className="config-editor-container">
                    <PanelGroup direction="horizontal" autoSaveId={`nacos-config-${item.key}`}>
                      {/* 左侧配置编辑器 */}
                      <Panel defaultSize={60} minSize={35} className="editor-panel">
                        <div className="panel-header">
                          <span className="panel-title">配置内容</span>
                        </div>
                        <div className="editor-wrapper">
                          <CodeMirror
                            value={item.content}
                            onChange={(value) => {
                              updateContent(value, item);
                              setLocalJob((prev) => {
                                const updatedJob = { ...prev };
                                const targetConfig = updatedJob.spec.nacos_datas?.find((c) => c.key === item.key);
                                if (targetConfig) {
                                  targetConfig.content = value;
                                }
                                // 同步到父组件（内容编辑，使用变化检测）
                                syncJobToParent(updatedJob, false);
                                return updatedJob;
                              });
                            }}
                            extensions={getLanguageExtension(item.format || 'text')}
                            theme={oneDark}
                            readOnly={viewMode}
                            basicSetup={{
                              lineNumbers: true,
                              foldGutter: true,
                              searchKeymap: true,
                              highlightActiveLine: false,
                            }}
                            style={{
                              height: '100%',
                              fontSize: '12px',
                              fontFamily: 'Monaco, "Cascadia Code", "SF Mono", Consolas, monospace',
                            }}
                          />
                        </div>
                      </Panel>

                      {/* 可调整大小的分割器 */}
                      <PanelResizeHandle className="resize-handle" />

                      {/* 右侧差异显示 */}
                      <Panel defaultSize={40} minSize={25} className="diff-panel">
                        <div className="panel-header">
                          <span className="panel-title">变更对比</span>
                          {item.diff && item.diff.length > 0 && <span className="diff-count">{item.diff.filter((d) => d.added || d.removed).length} 处变更</span>}
                        </div>
                        <div className="diff-content">
                          {item.diff && item.diff.length > 0 ? (
                            <pre className="diff-pre">
                              {item.diff.map((data, diffIndex) => (
                                <div key={diffIndex} className={`diff-line ${data.added ? 'added' : ''} ${data.removed ? 'removed' : ''}`}>
                                  <span className="diff-text">{data.value}</span>
                                </div>
                              ))}
                            </pre>
                          ) : (
                            <div className="no-changes">
                              <span>暂无变更</span>
                            </div>
                          )}
                        </div>
                      </Panel>
                    </PanelGroup>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Form>
    </section>
  );
});

export default Nacos;
