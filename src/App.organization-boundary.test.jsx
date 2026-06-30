import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

describe('App organization overview boundary', () => {
  test('renders the owner organization overview through a dedicated feature page', () => {
    const source = readFileSync('src/App.jsx', 'utf8');

    expect(source).toContain("lazy(() => import('./features/workspace/OrganizationOverviewPanel.jsx')");
    expect(source).toContain('<OrganizationOverviewPanel');
    expect(source).not.toContain('function OrganizationOverviewPanel');
    expect(source).not.toContain('function OwnerDecisionSummary');
    expect(source).not.toContain('function OwnerFocusSummary');
    expect(source).not.toContain('function OwnerRoleFlowPanel');
    expect(source).not.toContain('function OwnerEscalationDigestPanel');
    expect(source).not.toContain('function ProjectHealthPanel');
    expect(source).not.toContain('function OwnerCommandCenterPanel');
  });
});
