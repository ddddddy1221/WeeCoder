import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { TaskQueuePage } from './TaskQueuePage.jsx';

describe('TaskQueuePage', () => {
  function renderTaskQueue(overrides = {}) {
    const props = {
      filter: 'all',
      inbox: {
        currentUserGroups: [],
        groups: [
          {
            assigneeName: '林项目经理',
            isCurrentUser: true,
            openTaskCount: 1,
            projects: [
              {
                openTaskCount: 1,
                projectId: 'portal',
                projectName: '客户门户升级',
                stageName: 'PRD approval',
                tasks: [
                  {
                    id: 'task-1',
                    priorityContext: { healthLevel: 'warning', healthScore: 65 },
                    stageName: 'PRD approval',
                    title: 'Follow-up blocker',
                  },
                ],
              },
            ],
            targetRole: 'pm',
            targetRoleLabel: 'PM',
          },
        ],
        openTaskCount: 1,
      },
      onFilterChange: vi.fn(),
      onOpenProject: vi.fn(),
      onOpenTask: vi.fn(),
      ...overrides,
    };

    render(
      <TaskQueuePage
        filter={props.filter}
        inbox={props.inbox}
        onFilterChange={props.onFilterChange}
        onOpenProject={props.onOpenProject}
        onOpenTask={props.onOpenTask}
      />,
    );

    return props;
  }

  test('uses Chinese requirement document wording in task focus summaries', () => {
    renderTaskQueue();

    const focus = screen.getByLabelText('角色待办焦点');
    expect(within(focus).getByText(/需求文档审批/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('PRD');
  });

  test('collapses the role inbox overview, focus, and filter into one compact focus area', () => {
    const onFilterChange = vi.fn();
    renderTaskQueue({ onFilterChange });

    const focus = screen.getByLabelText('角色待办焦点');
    expect(within(focus).getByText('当前焦点')).toBeInTheDocument();
    expect(within(focus).getByText('跟进事项阻塞')).toBeInTheDocument();
    expect(within(focus).getByText(/客户门户升级 · 需求文档审批/)).toBeInTheDocument();
    expect(within(focus).getByText('项目经理 · 林项目经理')).toBeInTheDocument();
    expect(within(focus).getByText('全部 1')).toBeInTheDocument();
    expect(within(focus).getByText('我的 0')).toBeInTheDocument();
    expect(within(focus).getByText('角色 1')).toBeInTheDocument();
    expect(within(focus).getByText('项目 1')).toBeInTheDocument();

    expect(screen.queryByLabelText('角色待办总览')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('待办处理焦点')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('角色待办筛选')).not.toBeInTheDocument();

    fireEvent.click(within(focus).getByRole('button', { name: '只看我的' }));
    expect(onFilterChange).toHaveBeenCalledWith('mine');
  });
});
