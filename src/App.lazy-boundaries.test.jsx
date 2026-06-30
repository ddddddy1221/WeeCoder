import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

describe('App lazy module boundaries', () => {
  test('loads project feature modules through lazy boundaries', () => {
    const source = readFileSync('src/App.jsx', 'utf8');

    expect(source).toContain("lazy(() => import('./features/projects/ProjectCenter.jsx')");
    expect(source).toContain("lazy(() => import('./features/projects/ProjectWorkspace.jsx')");
    expect(source).not.toMatch(/import\s+\{\s*ProjectCenter\s*\}\s+from/);
    expect(source).not.toMatch(/import\s+\{\s*ProjectWorkspace\s*\}\s+from/);
  });
});
