import React from 'react';
import { Input, Select, Table, Typography } from '@douyinfe/semi-ui';

const { Text } = Typography;

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

interface WorkflowVariablesProps {
  variables?: WorkflowVariable[];
  payload?: any;
  onChange?: (variables: WorkflowVariable[]) => void;
  viewMode?: boolean;
}

const WorkflowVariables: React.FC<WorkflowVariablesProps> = ({
  variables,
  payload,
  onChange,
  viewMode = false
}) => {
  // Use either variables prop or payload.params based on what's provided
  const workflowVariables = variables || (payload?.params || []);
  
  // Render variable value based on type
  const renderValueInput = (variable: WorkflowVariable) => {
    if (variable.type === 'repo') {
      // Not implementing repo selector as it's a separate component in the reference
      return <Text type="secondary">Repo selector not implemented</Text>;
    }
    
    switch (variable.type) {
      case 'choice':
        return (
          <Select
            value={variable.value}
            onChange={(value) => {
              if (onChange) {
                const newVariables = workflowVariables.map(v =>
                  v.key === variable.key ? { ...v, value } : v
                );
                onChange(newVariables);
              }
            }}
            style={{ width: '100%' }}
            disabled={viewMode}
            placeholder="请选择"
            size="default"
          >
            {(variable.choice_option || []).map((option, index) => (
              <Select.Option key={index} value={option}>{option}</Select.Option>
            ))}
          </Select>
        );
        
      case 'multi-select':
        return (
          <Select
            multiple
            value={variable.choice_value || []}
            onChange={(value) => {
              if (onChange) {
                const newVariables = workflowVariables.map(v =>
                  v.key === variable.key ? { ...v, choice_value: value } : v
                );
                onChange(newVariables);
              }
            }}
            style={{ width: '100%' }}
            disabled={viewMode}
            placeholder="请选择多个值"
            size="default"
          >
            {(variable.choice_option || []).map((option, index) => (
              <Select.Option key={index} value={option}>{option}</Select.Option>
            ))}
          </Select>
        );
        
      case 'text':
        return (
          <Input
            type="textarea"
            value={variable.value}
            onChange={(value) => {
              if (onChange) {
                const newVariables = workflowVariables.map(v =>
                  v.key === variable.key ? { ...v, value } : v
                );
                onChange(newVariables);
              }
            }}
            style={{ width: '100%' }}
            disabled={viewMode}
            size="default"
          />
        );
        
      case 'string':
      default:
        return (
          <Input
            value={variable.value}
            onChange={(value) => {
              if (onChange) {
                const newVariables = workflowVariables.map(v =>
                  v.key === variable.key ? { ...v, value } : v
                );
                onChange(newVariables);
              }
            }}
            style={{ width: '100%' }}
            disabled={viewMode}
            size="default"
            type="text"
            mode={variable.is_credential ? 'password' : undefined}
          />
        );
    }
  };
  
  const columns = [
    {
      title: '变量名',
      dataIndex: 'key',
      width: '30%',
      render: (_: any, record: WorkflowVariable) => record.name || record.key
    },
    {
      title: '描述',
      dataIndex: 'description',
      width: '30%',
      render: (text: string) => <span>{text}</span>
    },
    {
      title: '值',
      width: '40%',
      render: (_: any, record: WorkflowVariable) => renderValueInput(record)
    }
  ];

  return (
    <div className="workflow-variables-table" style={{ width: '100%' }}>
      <Table
        className="variable-table"
        columns={columns}
        dataSource={workflowVariables.filter(item => 
          !(item.source === 'fixed' || item.source === 'reference')
        )}
        pagination={false}
        size="default"
        rowKey="key"
        style={{
          width: '100%',
          margin: '0',
          background: '#f8fcfd',
          border: '1px solid #ccc',
          borderRadius: '4px',
          tableLayout: 'fixed'
        }}
      />
    </div>
  );
};

export default WorkflowVariables;