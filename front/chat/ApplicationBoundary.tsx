import { Component, type ReactNode } from 'react';

export class ApplicationBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="application-error" role="status">新内容暂时无法显示。你可以继续对话，让 Seed 修复或恢复上一版本。<button type="button" onClick={() => this.setState({ failed: false })}>重新加载内容</button></div>;
    return this.props.children;
  }
}
