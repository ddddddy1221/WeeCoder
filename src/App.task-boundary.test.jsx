import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

describe('App task queue boundary', () => {
  test('renders the task queue through a dedicated feature page', () => {
    const source = readFileSync('src/App.jsx', 'utf8');

    expect(source).toContain("lazy(() => import('./features/tasks/TaskQueuePage.jsx')");
    expect(source).toContain('<TaskQueuePage');
    expect(source).not.toContain("import { TaskQueuePage } from './features/tasks/TaskQueuePage.jsx';");
    expect(source).not.toContain('<RoleInboxPanel');
    expect(source).not.toContain('function RoleInboxPanel');
    expect(source).not.toContain('function RoleInboxOverview');
  });
});
