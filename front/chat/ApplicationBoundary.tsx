import { Component, type ReactNode } from 'react';

export class ApplicationBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="application-error" role="status">New content could not be displayed. Continue chatting to ask Saplingagent to fix it or restore a previous version.<button type="button" onClick={() => this.setState({ failed: false })}>Reload content</button></div>;
    return this.props.children;
  }
}
