import { ReactNode } from 'react';

interface ServiceInfo {
  service_name: string;
  modules?: Array<{
    service_module: string;
    service_name: string;
    image?: string;
    image_name?: string;
    images?: any[];
    [key: string]: any;
  }>;
  deployed?: boolean;
  updatable?: boolean;
  auto_sync?: boolean;
  service_variable?: any;
  env_variable?: any;
  variable_kvs?: Array<{
    key: string;
    value: string;
    type?: string;
    source?: string;
    description?: string;
    is_credential?: boolean;
    choice_option?: string[];
    choice_value?: string[];
  }>;
  variable_yaml?: string;
  override_kvs?: string;
  update_config?: boolean;
  value_merge_strategy?: string;
  isExpand?: boolean;
  [key: string]: any;
}

interface Job {
  name: string;
  type: string;
  spec: {
    [key: string]: any;
  };
  pickedModules?: any[];
  pickedTargets?: ServiceInfo[];
  [key: string]: any;
}

export interface CustomWorkflowDeployConfigProps {
  job: Job;
  projectName: string;
  registryId?: string;
  viewMode?: boolean;
  editRunner?: boolean;
  stageExecMode?: boolean;
  hideVarPreview?: boolean;
  triggerMode?: boolean;
  releasePlanMode?: boolean;
  ref?: any;
}

declare const CustomWorkflowDeployConfig: React.FC<CustomWorkflowDeployConfigProps>;

export default CustomWorkflowDeployConfig;
