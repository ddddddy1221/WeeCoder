import { useState } from 'react';
import {
  Bell,
  Command,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Search,
  Settings,
  Workflow,
  X,
} from 'lucide-react';

const ICONS = {
  Command,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  Workflow,
};

export function AppShell({
  activeDestination,
  children,
  currentUser,
  demoUsers = [],
  navigationItems = [],
  notificationsCount = 0,
  onDestinationChange,
  onLogout,
  onOrganizationChange,
  onUserChange,
  organization,
  organizations = [],
}) {
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);

  return (
    <div className="control-shell" data-layout="hybrid">
      <aside className="control-rail" aria-label="主导航">
        <div className="control-brand" aria-label="WeeCoder AI 交付系统">
          W
        </div>
        <nav className="control-nav">
          {navigationItems.map((item) => {
            const Icon = ICONS[item.icon] || LayoutDashboard;
            const isActive = item.id === activeDestination;
            return (
              <button
                aria-current={isActive ? 'page' : undefined}
                className={isActive ? 'active' : ''}
                key={item.id}
                onClick={() => onDestinationChange(item.id)}
                title={item.label}
                type="button"
              >
                <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <button className="control-settings" title="设置" type="button">
          <Settings aria-hidden="true" size={19} strokeWidth={1.8} />
          <span>设置</span>
        </button>
      </aside>

      <div className="control-body">
        <header className="control-command-bar" aria-label="顶部命令栏">
          <div className="control-product-title">
            <strong>AI 交付中枢</strong>
            <span>{navigationItems.find((item) => item.id === activeDestination)?.label}</span>
          </div>
          <div className="control-command-actions">
            {organizations.length ? (
              <label className="control-organization-select">
                <span>组织</span>
                <select
                  aria-label="全局组织"
                  onChange={(event) => onOrganizationChange(event.target.value)}
                  value={organization?.id || ''}
                >
                  {organizations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <button className="command-icon-button search" title="搜索项目" type="button">
              <Search aria-hidden="true" size={18} />
              <span>搜索项目</span>
            </button>
            <button className="command-icon-button notification" title="通知" type="button">
              <Bell aria-hidden="true" size={18} />
              <span>通知</span>
              {notificationsCount ? <b>{notificationsCount}</b> : null}
            </button>
            <button
              aria-expanded={isAccountMenuOpen}
              aria-label="打开账户菜单"
              className="control-account-button"
              onClick={() => setIsAccountMenuOpen((open) => !open)}
              type="button"
            >
              <span className="control-avatar">{getInitials(currentUser?.name)}</span>
              <span className="control-account-copy">
                <strong>{currentUser?.name || '未登录用户'}</strong>
                <small>{currentUser?.roleLabel || '未知角色'}</small>
              </span>
            </button>
          </div>
          {isAccountMenuOpen ? (
            <div className="control-account-menu" aria-label="账户菜单">
              <div className="control-account-menu-heading">
                <div>
                  <strong>{currentUser?.name}</strong>
                  <small>{currentUser?.roleLabel}</small>
                </div>
                <button
                  aria-label="关闭账户菜单"
                  className="icon-only subtle"
                  onClick={() => setIsAccountMenuOpen(false)}
                  title="关闭"
                  type="button"
                >
                  <X aria-hidden="true" size={17} />
                </button>
              </div>
              {demoUsers.length ? (
                <label>
                  当前用户
                  <select
                    aria-label="当前用户"
                    onChange={(event) => onUserChange(event.target.value)}
                    value={currentUser?.id || ''}
                  >
                    {demoUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} · {user.roleLabel}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <button className="control-logout" onClick={onLogout} type="button">
                <LogOut aria-hidden="true" size={16} />
                退出登录
              </button>
            </div>
          ) : null}
        </header>

        <main className="console-main">
          <section className="console-content">{children}</section>
        </main>
      </div>
    </div>
  );
}

function getInitials(name) {
  return String(name || 'W').trim().slice(0, 2).toUpperCase();
}
