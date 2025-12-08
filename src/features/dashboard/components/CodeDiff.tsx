import React from 'react';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer';

interface CodeDiffProps {
  oldString: string;
  newString: string;
  language?: string;
  outputFormat?: 'line-by-line' | 'side-by-side';
  context?: number;
}

const CodeDiff: React.FC<CodeDiffProps> = ({
  oldString = '',
  newString = '',
  language = 'text',
  outputFormat = 'side-by-side',
  context = 10
}) => {
  // 处理字符串格式
  const processedOldString = oldString.replace(/\r\n|\r|\\n/g, '\n').replace(/\\t/g, '\t');
  const processedNewString = newString.replace(/\r\n|\r|\\n/g, '\n').replace(/\\t/g, '\t');

  // 自定义样式
  const diffViewerStyles = {
    variables: {
      light: {
        // 设置基础颜色
        codeFoldGutterBackground: '#f7f8fa',
        codeFoldBackground: '#f7f8fa',
        // 删除和添加的行背景色
        removedBackground: '#ffebee',
        addedBackground: '#e8f5e8',
        removedColor: '#000',
        addedColor: '#000',
        // 代码字体
        fontFamily: 'Monaco, Consolas, "Courier New", monospace',
        fontSize: '13px'
      }
    },
    line: {
      padding: '2px 8px',
      fontSize: '13px',
      lineHeight: '20px'
    },
    marker: {
      fontSize: '13px'
    },
    content: {
      fontFamily: 'Monaco, Consolas, "Courier New", monospace',
      fontSize: '13px'
    },
    gutter: {
      padding: '2px 8px',
      fontSize: '12px',
      color: '#666'
    },
    // 添加容器样式确保滚动正常工作
    diffContainer: {
      height: '100%',
      overflow: 'auto'
    },
    codeFold: {
      height: 'auto'
    }
  };

  return (
    <div className="code-diff-view" style={{ height: '100%', border: '1px solid #e5e6ea', overflow: 'hidden' }}>
      <div style={{ height: '100%', overflow: 'auto' }}>
        <ReactDiffViewer
          oldValue={processedOldString}
          newValue={processedNewString}
          splitView={outputFormat === 'side-by-side'}
          compareMethod={DiffMethod.LINES}
          leftTitle="原内容"
          rightTitle="新内容"
          styles={diffViewerStyles}
          hideLineNumbers={false}
          showDiffOnly={context === 0}
          extraLinesSurroundingDiff={context === 0 ? 0 : context}
          useDarkTheme={false}
          renderContent={(str: string) => (
            <pre style={{ 
              display: 'inline', 
              margin: 0, 
              fontSize: '13px',
              fontFamily: 'Monaco, Consolas, "Courier New", monospace'
            }}>
              {str}
            </pre>
          )}
        />
      </div>
    </div>
  );
};

export default CodeDiff;
