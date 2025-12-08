import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Select, Typography, Space, Tag, Toast } from '@douyinfe/semi-ui';
import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { getDatabaseListByProjectNameAPI, validateSqlAPI } from '../../../../api/service';
import './Sql.css';

const { Text } = Typography;

interface DatabaseItem {
  id: string;
  name: string;
  host: string;
  port: number;
  type: string;
}

interface SqlError {
  message: string;
  line?: number;
  column?: number;
}

interface JobSpec {
  id?: string;
  sql?: string;
  source?: string;
  [key: string]: any;
}

interface Job {
  name: string;
  type: string;
  spec: JobSpec;
  [key: string]: any;
}

interface SqlProps {
  job: Job;
  projectName: string;
  viewMode?: boolean;
  onJobChange?: (job: Job) => void;
}

// 外部接口定义
export interface SqlRef {
  validate: () => Promise<boolean>;
  getData: () => Job;
}

const Sql = forwardRef<SqlRef, SqlProps>(({
  job,
  projectName,
  viewMode = false,
  onJobChange
}, ref) => {
  const [localJob, setLocalJob] = useState<Job>(job);
  const [databaseList, setDatabaseList] = useState<DatabaseItem[]>([]);
  const [errors, setErrors] = useState<SqlError[]>([]);

  useEffect(() => {
    setLocalJob(job);
    initDatabaseList();
  }, [job]);

  useEffect(() => {
    if (localJob.spec.sql && localJob.spec.id) {
      validateSql(localJob.spec.sql);
    } else {
      setErrors([]);
    }
  }, [localJob.spec.sql, localJob.spec.id]);

  // 初始化数据库列表
  const initDatabaseList = async () => {
    try {
      const res = await getDatabaseListByProjectNameAPI(projectName);
      if (res) {
        setDatabaseList(res);
      }
    } catch (error) {
      console.error('获取数据库列表失败:', error);
      Toast.error('获取数据库列表失败');
      setDatabaseList([]);
    }
  };

  // 数据库变化处理 - 严格按照 Vue 版本实现
  const changeDatabase = (databaseId: string) => {
    if (viewMode) return;

    const updatedJob = {
      ...localJob,
      spec: {
        ...localJob.spec,
        id: databaseId,
        sql: '', // 清空 SQL，匹配 Vue 版本逻辑
        type: databaseId ? databaseList.find(item => item.id === databaseId)?.type : undefined
      }
    };

    setLocalJob(updatedJob);
    setErrors([]); // 清空错误
    onJobChange?.(updatedJob);
  };

  // SQL变化处理
  const handleSqlChange = (sql: string) => {
    if (viewMode) return;

    const updatedJob = {
      ...localJob,
      spec: {
        ...localJob.spec,
        sql
      }
    };

    setLocalJob(updatedJob);
    onJobChange?.(updatedJob);
  };

  // 验证SQL语法 - 严格按照 Vue 版本实现
  const validateSql = async (sqlContent: string) => {
    if (!localJob.spec.id) {
      Toast.error('请选择数据库');
      return;
    }

    setErrors([]);

    if (!sqlContent.trim()) {
      return;
    }

    try {
      const payload = {
        type: localJob.spec.type,
        sql: sqlContent
      };

      const res = await validateSqlAPI(payload);

      if (res && Array.isArray(res)) {
        setErrors(res);
      } else {
        setErrors([]);
      }
    } catch (error) {
      console.error('SQL验证失败:', error);
      setErrors([]);
    }
  };

  // 防抖的SQL验证
  const debouncedValidateSql = React.useCallback(
    React.useMemo(() => {
      let timeoutId: number;
      return (sql: string) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          validateSql(sql);
        }, 300);
      };
    }, [localJob.spec.id]),
    [localJob.spec.id]
  );

  // 渲染验证状态 - 严格匹配 Vue 版本逻辑
  const renderValidationStatus = () => {
    // 如果有错误，显示错误信息
    if (errors.length > 0) {
      return (
        <div className="errors-container">
          <ul className="errors-list">
            <li className="errors-list-item">SQL查询检查失败：</li>
            {errors.map((error, index) => (
              <li key={index} className="errors-list-item">
                <div className="errors-list-item-text">{error.message}</div>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    
    // 如果没有错误且有 SQL 内容，显示成功
    if (errors.length === 0 && localJob.spec.sql && localJob.spec.sql.trim() !== '') {
      return (
        <div className="errors-container">
          <ul className="errors-list success-list">
            <li className="errors-list-item success-list-item">SQL查询检查通过</li>
          </ul>
        </div>
      );
    }
    
    // 如果 SQL 为空，显示提示
    if (!localJob.spec.sql || localJob.spec.sql.trim() === '') {
      return (
        <div className="errors-container">
          <ul className="errors-list">
            <li className="errors-list-item">请输入SQL查询语句</li>
          </ul>
        </div>
      );
    }

    return null;
  };

  // 获取选中的数据库信息
  const getSelectedDatabase = () => {
    return databaseList.find(db => db.id === localJob.spec.id);
  };

  // 外部接口实现 - 匹配 Vue 版本
  const validate = async (): Promise<boolean> => {
    const jobName = localJob.name;
    
    if (!localJob.spec.sql || localJob.spec.sql.trim() === '') {
      Toast.error(`${jobName}: 请输入 SQL 语句`);
      return false;
    }
    
    if (!localJob.spec.id || localJob.spec.id === '') {
      Toast.error(`${jobName}: 请选择数据库`);
      return false;
    }
    
    return true;
  };

  const getData = (): Job => {
    return localJob;
  };

  // 暴露外部接口
  useImperativeHandle(ref, () => ({
    validate,
    getData,
    getLatestJobData: () => {
      return localJob;
    }
  }), [validate, getData, localJob]);

  return (
    <div className="job-sql">
      <div>
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            数据库名称 <Text type="danger">*</Text>
          </Text>
          <Select
            value={localJob.spec.id}
            onChange={changeDatabase}
            placeholder="请选择数据库"
            style={{ width: 400 }}
            disabled={localJob.spec.source === 'fixed' || viewMode}
            optionList={databaseList.map(db => ({
              label: `${db.name}(${db.host}:${db.port})`,
              value: db.id
            }))}
          />

          {/* 显示选中数据库的详细信息 */}
          {localJob.spec.id && (
            <div style={{ marginTop: 8 }}>
              {(() => {
                const selectedDb = getSelectedDatabase();
                return selectedDb ? (
                  <Space>
                    <Tag color="blue">{selectedDb.type}</Tag>
                    <Text type="secondary" size="small">
                      {selectedDb.host}:{selectedDb.port}
                    </Text>
                  </Space>
                ) : null;
              })()}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            SQL查询 <Text type="danger">*</Text>
          </Text>
          <div className="sql-editor">
            <div className="resize">
              <CodeMirror
                value={localJob.spec.sql || ''}
                onChange={(value) => {
                  handleSqlChange(value);
                  debouncedValidateSql(value);
                }}
                extensions={[sql()]}
                readOnly={viewMode}
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  dropCursor: false,
                  allowMultipleSelections: false,
                  searchKeymap: true
                }}
                placeholder="请输入SQL查询语句..."
                style={{
                  height: '200px',
                  fontSize: '14px',
                  border: '1px solid #e5e6ea',
                  borderRadius: '4px'
                }}
              />
            </div>
            {renderValidationStatus()}
          </div>
        </div>

        {viewMode && localJob.spec.sql && (
          <div style={{ marginBottom: 16 }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              执行说明
            </Text>
            <div style={{
              padding: 12,
              backgroundColor: '#f7f8fa',
              border: '1px solid #e5e6ea',
              borderRadius: 4
            }}>
              <div style={{ width: '100%' }}>
                <div style={{ marginBottom: 8 }}>
                  <Text strong>注意事项：</Text>
                </div>
                <div style={{ marginBottom: 4 }}>
                  <Text type="secondary" size="small">
                    • 此SQL将在选定的数据库中执行
                  </Text>
                </div>
                <div style={{ marginBottom: 4 }}>
                  <Text type="secondary" size="small">
                    • 请确保SQL语句的正确性和安全性
                  </Text>
                </div>
                <div style={{ marginBottom: 4 }}>
                  <Text type="secondary" size="small">
                    • 建议在测试环境先验证SQL的执行结果
                  </Text>
                </div>
                <div>
                  <Text type="warning" size="small">
                    • 对于生产数据库的操作，请格外谨慎
                  </Text>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default Sql;