import React, { useState } from 'react';
import { Space, Tooltip, Typography } from '@douyinfe/semi-ui';
import { IconBranch,IconPriceTag } from '@douyinfe/semi-icons';

const { Text } = Typography;

// 代码仓库信息接口（完整的API数据结构）
export interface RepoInfo {
  source: string;
  repo_owner: string;
  repo_namespace: string;
  repo_name: string;
  remote_name: string;
  branch: string;
  prs?: number[]; // PR列表（可选）
  enable_commit: boolean;
  commit_id: string;
  commit_message: string;
  hidden: boolean;
  is_primary: boolean;
  codehost_id: number;
  oauth_token: string;
  address: string;
  author_name: string;
  source_from: string;
  param_name: string;
  job_name: string;
  service_name: string;
  service_module: string;
  repo_index: number;
  submission_id: string;
  disable_ssl: boolean;
  depot_type: string;
  tag?: string; // 标签名称（可选，用于Git标签）
  codehost_name?: string; // 代码托管名称（兼容性字段）
}

interface RepoJumpProps {
  build: RepoInfo;
  showCommit?: boolean; // 是否显示commit信息
  children?: React.ReactNode;
}

const RepoJump: React.FC<RepoJumpProps> = ({ 
  build, 
  showCommit = true,
  children 
}) => {
  const [currentPr, setCurrentPr] = useState<number | string>('');

  if (!build || !build.source) {
    return <Text type="tertiary">-</Text>;
  }

  // 统一的 SDK 跳转函数
  const handleSDKNavigation = (url: string, event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      if (window.JSSDK?.navigation?.open) {
        window.JSSDK.navigation.open(url);
      } else {
        console.warn('SDK navigation not available, fallback to window.open');
        window.open(url, '_blank');
      }
    } catch (error) {
      console.error('Navigation failed:', error);
      // 降级处理
      window.open(url, '_blank');
    }
  };

  // 处理PR点击切换
  const handleSetPr = (item: number, event: React.MouseEvent) => {
    event.stopPropagation();
    setCurrentPr(item);
  };

  // 构建Tag链接
  const renderTag = () => {
    if (!build.tag || build.source === 'other') {
      if (build.tag && build.source === 'other') {
        return (
          <Space spacing={4}>
            <Text style={{ color: '#4a4a4a', fontSize: '12px' }}>{build.tag}</Text>
          </Space>
        );
      }
      return null;
    }

    let tagUrl = '';
    let isSupported = true;

    switch (build.source) {
      case 'github':
      case 'gitlab':
        tagUrl = `${build.address}/${build.repo_owner}/${build.repo_name}/tags/${build.tag}`;
        break;
      case 'gitee':
      case 'gitee-enterprise':
        tagUrl = `${build.address}/${build.repo_owner}/${build.repo_name}/tree/${build.tag}`;
        break;
      case 'gerrit':
        isSupported = false;
        break;
      default:
        break;
    }

    const tooltipContent = build.source === 'gerrit' 
      ? '暂不支持在该类型上查看 Release'
      : `在 ${build.source} 上查看 Release`;

    return (
      <Tooltip content={tooltipContent}>
        <Space spacing={4}>
        <IconPriceTag size="small" style={{ color: '#0066cc', verticalAlign: 'bottom' }} />
          {isSupported && tagUrl ? (
            <Text 
              link
              onClick={(e) => handleSDKNavigation(tagUrl, e)}
              style={{ fontSize: '12px' }}
            >
              {build.tag}
            </Text>
          ) : (
            <Text style={{ fontSize: '12px' }}>{build.tag}</Text>
          )}
        </Space>
      </Tooltip>
    );
  };

  // 构建Branch链接
  const renderBranch = () => {
    // 如果有tag就不显示branch
    if (!build.branch || build.tag) {
      return null;
    }

    if (build.source === 'other') {
      return (
        <Space spacing={4}>
          <IconBranch size="small" style={{ color: '#0066cc', verticalAlign: 'bottom' }} />
          <Text style={{ color: '#4a4a4a', fontSize: '12px' }}>{build.branch}</Text>
        </Space>
      );
    }

    let branchUrl = '';
    let isSupported = true;

    switch (build.source) {
      case 'github':
      case 'gitee':
      case 'gitee-enterprise':
      case 'gitlab':
        branchUrl = `${build.address}/${build.repo_owner}/${build.repo_name}/tree/${build.branch}`;
        break;
      case 'gerrit':
        isSupported = false;
        break;
      default:
        if (!build.source) {
          branchUrl = `${build.address}/${build.repo_owner}/${build.repo_name}/tree/${build.branch}`;
        }
        break;
    }

    const tooltipContent = build.source === 'gerrit' 
      ? '暂不支持在该类型上查看 Branch'
      : `在 ${build.source} 上查看 Branch`;

    return (
      <Tooltip content={tooltipContent}>
        <Space spacing={4}>
          <IconBranch size="small" style={{ color: '#0066cc', verticalAlign: 'bottom' }} />
          {isSupported && branchUrl ? (
            <Text 
              link
              onClick={(e) => handleSDKNavigation(branchUrl, e)}
              style={{ fontSize: '12px' }}
            >
              {build.branch}
            </Text>
          ) : (
            <Text style={{ fontSize: '12px' }}>{build.branch}</Text>
          )}
        </Space>
      </Tooltip>
    );
  };

  // 构建PR链接
  const renderPrs = () => {
    if (!build.prs || build.prs.length === 0) {
      return null;
    }

    let prUrl = '';
    const usedPr = currentPr || build.prs[0];

    switch (build.source) {
      case 'github':
        prUrl = `${build.address}/${build.repo_owner}/${build.repo_name}/pull/${usedPr}`;
        break;
      case 'gitlab':
        prUrl = `${build.address}/${build.repo_owner}/${build.repo_name}/merge_requests/${usedPr}`;
        break;
      case 'gitee':
      case 'gitee-enterprise':
        prUrl = `${build.address}/${build.repo_owner}/${build.repo_name}/pulls/${usedPr}`;
        break;
      default:
        if (!build.source) {
          prUrl = `${build.address}/${build.repo_owner}/${build.repo_name}/pull/${usedPr}`;
        }
        break;
    }

    return (
      <Tooltip content={`在 ${build.source} 上查看 PR`}>
        <Space spacing={4} style={{ marginLeft: '4px' }}>
          {prUrl ? (
            <Text 
              link
              onClick={(e) => handleSDKNavigation(prUrl, e)}
              style={{ fontSize: '12px' }}
            >
              {build.prs.map((item, index) => (
                <span 
                  key={item}
                  onClick={(e) => handleSetPr(item, e)}
                  style={{ cursor: 'pointer' }}
                >
                  #{item}
                  {index < build.prs!.length - 1 && ', '}
                </span>
              ))}
            </Text>
          ) : (
            <Text style={{ fontSize: '12px' }}>
              {build.prs.map((item, index) => (
                <span key={item}>
                  #{item}
                  {index < build.prs!.length - 1 && ', '}
                </span>
              ))}
            </Text>
          )}
        </Space>
      </Tooltip>
    );
  };

  // 构建Commit链接
  const renderCommit = () => {
    if (!build.commit_id || !showCommit) {
      return null;
    }

    let commitUrl = '';
    let displayCommit = build.commit_id.substring(0, 8);

    switch (build.source) {
      case 'github':
      case 'gitee':
      case 'gitlab':
        commitUrl = `${build.address}/${build.repo_owner}/${build.repo_name}/commit/${build.commit_id}`;
        break;
      case 'gitee-enterprise':
        commitUrl = `${build.address}/enterprise/dashboard/projects/${build.repo_owner}/${build.repo_name}/commit/${build.commit_id}`;
        break;
      case 'gerrit':
        if (!build.prs || build.prs.length === 0) {
          commitUrl = `${build.address}/c/${build.repo_name}/+/${build.submission_id}`;
          displayCommit = build.commit_id.substring(0, 8);
        } else {
          // Gerrit with PRs case
          const usedPr = currentPr || build.prs[0];
          commitUrl = `${build.address}/c/${build.repo_name}/+/${usedPr}`;
          displayCommit = build.commit_id.substring(0, 8);
        }
        break;
      default:
        break;
    }

    return (
      <Tooltip content={`在 ${build.source} 上查看 Commit`}>
        <Space spacing={4}>
          {commitUrl ? (
            <Text 
              link
              onClick={(e) => handleSDKNavigation(commitUrl, e)}
              style={{ fontSize: '12px' }}
            >
              {displayCommit}
            </Text>
          ) : (
            <Text style={{ fontSize: '12px' }}>{displayCommit}</Text>
          )}
        </Space>
      </Tooltip>
    );
  };

  return (
    <div style={{ color: '#0066cc' }}>
      {children}
      <Space spacing={4}>
        {renderTag()}
        {renderBranch()}
        {renderPrs()}
        {renderCommit()}
      </Space>
    </div>
  );
};

export default RepoJump;
