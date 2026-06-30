import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function loadEnvFile(filePath, { target = process.env, override = false } = {}) {
  let content;
  try {
    content = await readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  return applyEnvContent(content, { target, override });
}

export function loadEnvFileSync(filePath, { target = process.env, override = false } = {}) {
  if (!existsSync(filePath)) {
    return [];
  }
  return applyEnvContent(readFileSync(filePath, 'utf8'), { target, override });
}

export function loadLocalEnvFilesSync(rootDir, filenames = ['.env.local', '.env.yolo.local']) {
  return filenames.flatMap((filename) => loadEnvFileSync(join(rootDir, filename)));
}

function applyEnvContent(content, { target, override }) {
  const loaded = [];
  for (const rawLine of String(content || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const separator = line.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = stripQuotes(line.slice(separator + 1).trim());
    if (!override && target[key] !== undefined) {
      continue;
    }
    target[key] = value;
    loaded.push(key);
  }
  return loaded;
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
