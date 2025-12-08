import React, { useState, useEffect } from 'react';
import { Spin, Typography, Space, Button, Empty } from '@douyinfe/semi-ui';
import { IconLoading, IconAlertTriangle, IconRefresh } from '@douyinfe/semi-icons';

const { Text } = Typography;

interface LoadingWrapperProps {
  loading: boolean;
  children: React.ReactNode;
  tip?: string;
  size?: 'small' | 'middle' | 'large';
  delay?: number;
  error?: string | null;
  errorAction?: () => void;
  errorActionText?: string;
  emptyText?: string;
  minHeight?: string | number;
  isEmpty?: boolean;
}

const LoadingWrapper: React.FC<LoadingWrapperProps> = ({
  loading,
  children,
  tip = '加载中...',
  size = 'middle',
  delay = 0,
  error = null,
  errorAction,
  errorActionText = '重试',
  emptyText = '暂无数据',
  minHeight = '200px',
  isEmpty = false
}) => {
  const [showLoading, setShowLoading] = useState(false);

  useEffect(() => {
    if (loading) {
      if (delay > 0) {
        const timer = setTimeout(() => {
          setShowLoading(true);
        }, delay);
        return () => clearTimeout(timer);
      } else {
        setShowLoading(true);
      }
    } else {
      setShowLoading(false);
    }
  }, [loading, delay]);

  // 错误状态
  if (error) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight,
        padding: '40px 20px'
      }}>
        <Space direction="vertical" align="center">
          <IconAlertTriangle size="extra-large" style={{ color: '#ff4d4f' }} />
          <Text type="danger" strong style={{ marginTop: 8 }}>
            加载失败
          </Text>
          <Text type="secondary" style={{ marginTop: 4, textAlign: 'center' }}>
            {error}
          </Text>
          {errorAction && (
            <Button 
              type="primary" 
              theme="light"
              icon={<IconRefresh />}
              onClick={errorAction}
              style={{ marginTop: 16 }}
            >
              {errorActionText}
            </Button>
          )}
        </Space>
      </div>
    );
  }

  // 加载状态
  if (showLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight,
        padding: '40px 20px'
      }}>
        <Space direction="vertical" align="center">
          <Spin size={size} />
          <Text type="secondary" style={{ marginTop: 8 }}>
            {tip}
          </Text>
        </Space>
      </div>
    );
  }

  // 空状态
  if (isEmpty && !loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight,
        padding: '40px 20px'
      }}>
        <Empty
          title={emptyText}
          description="您可以尝试刷新页面或稍后再试"
        />
      </div>
    );
  }

  return <>{children}</>;
};

export default LoadingWrapper;