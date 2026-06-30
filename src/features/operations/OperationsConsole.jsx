import { useState } from 'react';
import { Activity, Building2, Coins, Rocket, ScrollText, ServerCog } from 'lucide-react';

const OPERATIONS_TABS = Object.freeze([
  {
    description: '聚焦组织、任务、发布、安全和费用的全局风险。',
    icon: Activity,
    id: 'overview',
    label: '运行总览',
  },
  {
    description: '查看组织成员、角色权限和数据底座准备情况。',
    icon: Building2,
    id: 'organizations',
    label: '组织与权限',
  },
  {
    description: '查看 AI coding 队列、执行证据和失败重试。',
    icon: ServerCog,
    id: 'jobs',
    label: '后台任务',
  },
  {
    description: '确认部署环境、发布门禁和运维交接风险。',
    icon: Rocket,
    id: 'deployments',
    label: '部署与发布',
  },
  {
    description: '追踪操作审计、越权拒绝和 SLA 超时事件。',
    icon: ScrollText,
    id: 'audit',
    label: '审计与 SLA',
  },
  {
    description: '查看 AI、执行器、等待阻塞和部署资源费用。',
    icon: Coins,
    id: 'cost',
    label: '费用',
  },
]);

export function OperationsConsole({ children }) {
  const [activeTab, setActiveTab] = useState('overview');
  const activeView = OPERATIONS_TABS.find((tab) => tab.id === activeTab) || OPERATIONS_TABS[0];
  const ActiveIcon = activeView.icon;

  return (
    <section className="operations-console" aria-label="运营控制台">
      <section className="operations-command-focus" aria-label="运营态势焦点">
        <div className="operations-command-focus-heading">
          <div className="operations-command-focus-copy">
            <p className="eyebrow">运营工作台</p>
            <h2>运营控制台</h2>
            <strong>{`当前视图：${activeView.label}`}</strong>
            <span>{activeView.description}</span>
          </div>
          <div className="operations-command-focus-meta">
            <div className="operations-command-focus-icon" aria-hidden="true">
              <ActiveIcon size={18} />
            </div>
            <div>
              <span>只显示当前主题相关卡片</span>
              <small>{`${OPERATIONS_TABS.length} 个运营视角`}</small>
            </div>
          </div>
        </div>
        <div className="operations-tabs" role="tablist" aria-label="运营控制台视图">
          {OPERATIONS_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                aria-selected={activeTab === tab.id}
                className={activeTab === tab.id ? 'active' : ''}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                role="tab"
                type="button"
              >
                <Icon aria-hidden="true" size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>
      <div className="operations-content" data-testid="operations-content" data-view={activeTab}>
        {children}
      </div>
    </section>
  );
}
