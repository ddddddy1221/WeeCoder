import { describe, expect, test } from 'vitest';
import {
  getNavigationItems,
  getPreferredStageIdForTab,
  getWorkspaceTabForStage,
} from './navigation.js';

describe('control console navigation', () => {
  test('shows operations only to authorized owner and technical roles', () => {
    expect(getNavigationItems({ role: 'owner' }).map((item) => item.id)).toEqual([
      'workspace',
      'projects',
      'tasks',
      'delivery',
      'operations',
    ]);
    expect(getNavigationItems({ role: 'tech-lead' }).map((item) => item.id)).toEqual([
      'workspace',
      'projects',
      'tasks',
      'delivery',
      'operations',
    ]);
    expect(getNavigationItems({ role: 'qa' }).map((item) => item.id)).toEqual([
      'workspace',
      'projects',
      'tasks',
      'delivery',
    ]);
  });

  test('maps task stages to stable project workspace tabs', () => {
    expect(getWorkspaceTabForStage('pm-requirements')).toBe('requirements');
    expect(getWorkspaceTabForStage('ops-requirements')).toBe('architecture-ops');
    expect(getWorkspaceTabForStage('development')).toBe('development');
    expect(getWorkspaceTabForStage('review')).toBe('review');
    expect(getWorkspaceTabForStage('qa')).toBe('qa');
    expect(getWorkspaceTabForStage('acceptance')).toBe('acceptance');
    expect(getWorkspaceTabForStage('unknown-stage')).toBe('overview');
  });

  test('maps workspace tabs back to a relevant project stage', () => {
    const stages = [
      { id: 'intake' },
      { id: 'pm-requirements' },
      { id: 'prd-approval' },
      { id: 'architecture' },
      { id: 'ops-requirements' },
      { id: 'development' },
      { id: 'review' },
      { id: 'qa' },
      { id: 'acceptance' },
    ];

    expect(getPreferredStageIdForTab('requirements', stages, 'acceptance')).toBe(
      'pm-requirements',
    );
    expect(getPreferredStageIdForTab('architecture-ops', stages, 'ops-requirements')).toBe(
      'ops-requirements',
    );
    expect(getPreferredStageIdForTab('activity', stages, 'acceptance')).toBe('acceptance');
  });
});
