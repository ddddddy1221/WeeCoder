import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

describe('App workspace boundary', () => {
  test('renders the personal workspace through a dedicated feature page', () => {
    const source = readFileSync('src/App.jsx', 'utf8');

    expect(source).toContain("lazy(() => import('./features/workspace/PersonalWorkspacePanel.jsx')");
    expect(source).toContain('<PersonalWorkspacePanel');
    expect(source).not.toContain('function PersonalWorkspacePanel');
    expect(source).not.toContain('function RolePriorityQueue');
    expect(source).not.toContain('function RoleHandoffSummary');
    expect(source).not.toContain('function PrimaryRoleActionCard');
    expect(source).not.toContain('function PersonalAlertPanel');
  });
});
