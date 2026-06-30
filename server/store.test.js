import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { JsonProjectStore } from './store.js';

describe('JsonProjectStore', () => {
  let tempDir;
  let store;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'wee-coder-store-'));
    store = new JsonProjectStore(join(tempDir, 'projects.json'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test('awaits async project updater before writing state', async () => {
    await store.addProject({
      id: 'project-1',
      name: 'Original project',
      stages: [],
    });

    const updated = await store.updateProject('project-1', async (project) => ({
      ...project,
      name: 'Updated project',
    }));

    expect(updated).toMatchObject({
      id: 'project-1',
      name: 'Updated project',
    });
    await expect(store.getProject('project-1')).resolves.toMatchObject({
      id: 'project-1',
      name: 'Updated project',
    });
  });
});
