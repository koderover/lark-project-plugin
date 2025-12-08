import React, { Component, ReactNode } from 'react';
import { Card, Button, Typography, Space, Toast } from '@douyinfe/semi-ui';
import { IconAlertTriangle, IconRefresh, IconInfoCircle } from '@douyinfe/semi-icons';

const { Text, Title } = Typography;

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  showDetails?: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({
      error,
      errorInfo
    });

    // 调用自定义错误处理函数
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // 记录错误到控制台
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // 显示错误提示
    Toast.error('组件出现错误，请查看详情或刷新页面');
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // 如果提供了自定义fallback，使用它
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // 默认错误UI
      return (
        <Card
          style={{
            margin: '16px 0',
            backgroundColor: '#fef0f0',
            border: '1px solid #f56c6c'
          }}
        >
          <div style={{ textAlign: 'center', padding: '24px 16px' }}>
            <IconAlertTriangle
              size="extra-large"
              style={{ color: '#f56c6c', marginBottom: 16 }}
            />

            <Title heading={4} style={{ color: '#f56c6c', marginBottom: 8 }}>
              组件加载出错
            </Title>

            <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
              抱歉，该组件遇到了一个错误。您可以尝试刷新页面或联系技术支持。
            </Text>

            <Space>
              <Button
                type="primary"
                icon={<IconRefresh />}
                onClick={this.handleRetry}
              >
                重试
              </Button>

              <Button
                theme="borderless"
                onClick={this.handleReload}
              >
                刷新页面
              </Button>
            </Space>

            {/* 错误详情 */}
            {this.props.showDetails && this.state.error && (
              <details style={{ marginTop: 16, textAlign: 'left' }}>
                <summary style={{ cursor: 'pointer', marginBottom: 8 }}>
                  <Space>
                    <IconInfoCircle />
                    <Text strong>错误详情</Text>
                  </Space>
                </summary>

                <Card
                  style={{
                    backgroundColor: '#f7f8fa',
                    border: '1px solid #e5e6ea',
                    marginTop: 8
                  }}
                  bodyStyle={{ padding: 12 }}
                >
                  <div style={{ marginBottom: 8 }}>
                    <Text strong size="small">错误信息：</Text>
                    <div style={{
                      fontFamily: 'Monaco, Consolas, monospace',
                      fontSize: '12px',
                      color: '#f56c6c',
                      backgroundColor: '#fef0f0',
                      padding: '8px',
                      borderRadius: '4px',
                      marginTop: '4px',
                      overflowX: 'auto'
                    }}>
                      {this.state.error.message}
                    </div>
                  </div>

                  {this.state.error.stack && (
                    <div>
                      <Text strong size="small">错误堆栈：</Text>
                      <div style={{
                        fontFamily: 'Monaco, Consolas, monospace',
                        fontSize: '11px',
                        color: '#666',
                        backgroundColor: '#f7f8fa',
                        padding: '8px',
                        borderRadius: '4px',
                        marginTop: '4px',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        overflowX: 'auto',
                        whiteSpace: 'pre-wrap'
                      }}>
                        {this.state.error.stack}
                      </div>
                    </div>
                  )}

                  {this.state.errorInfo && (
                    <div style={{ marginTop: 8 }}>
                      <Text strong size="small">组件堆栈：</Text>
                      <div style={{
                        fontFamily: 'Monaco, Consolas, monospace',
                        fontSize: '11px',
                        color: '#666',
                        backgroundColor: '#f7f8fa',
                        padding: '8px',
                        borderRadius: '4px',
                        marginTop: '4px',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        overflowX: 'auto',
                        whiteSpace: 'pre-wrap'
                      }}>
                        {this.state.errorInfo.componentStack}
                      </div>
                    </div>
                  )}
                </Card>
              </details>
            )}
          </div>
        </Card>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;