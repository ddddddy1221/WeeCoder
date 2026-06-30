import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export class JsonProjectStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async listProjects() {
    const state = await this.readState();
    return state.projects;
  }

  async getProject(projectId) {
    const projects = await this.listProjects();
    return projects.find((project) => project.id === projectId) || null;
  }

  async addProject(project) {
    const state = await this.readState();
    const nextState = {
      ...state,
      projects: [project, ...state.projects],
    };
    await this.writeState(nextState);
    return project;
  }

  async updateProject(projectId, update) {
    const state = await this.readState();
    const index = state.projects.findIndex((project) => project.id === projectId);

    if (index === -1) {
      return null;
    }

    const updated = typeof update === 'function'
      ? await update(state.projects[index])
      : update;
    const projects = [...state.projects];
    projects[index] = updated;
    await this.writeState({ ...state, projects });
    return updated;
  }

  async readState() {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { projects: [] };
      }
      throw error;
    }
  }

  async writeState(state) {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  }
}
