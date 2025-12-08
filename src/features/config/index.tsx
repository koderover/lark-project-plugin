import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom';
import { createRoot } from 'react-dom/client';
import '@douyinfe/semi-ui/dist/css/semi.min.css';

const App = lazy(() => import('./App'));

export default async function main() {
  await window.JSSDK.shared.setSharedModules({
    React,
    ReactDOM,
  });

  const container = document.createElement('div');
  container.id = 'app';
  document.body.appendChild(container);

  // 适配主题模式
  window.JSSDK.Context.load().then((ctx) => {
    document.body.setAttribute('theme-mode', ctx.colorScheme);
  });

  const root = createRoot(container);

  // 直接渲染应用，不进行登录检查
  root.render(
    <Suspense fallback={<div>loading...</div>}>
      <App />
    </Suspense>
  );
}
