import { createStageConfirmationFollowupTasks } from './stageConfirmations.js';
import { APP_USERS } from './users.js';

export function createProjectTaskLedger(
  project,
  { users = APP_USERS, stageIds = null, includeResolved = true } = {},
) {
  if (!project) {
    return createEmptyLedger();
  }

  const resolvedStageIds = resolveStageIds(project, stageIds);
  const history = Array.isArray(project.history) ? project.history : [];
  const stages = Array.isArray(project.stages) ? project.stages : [];

  const tasks = resolvedStageIds.flatMap((stageId) => {
    const stage = stages.find((candidate) => candidate.id === stageId);
    const confirmationEntry = project.stageConfirmations?.[stageId] || {};
    const stageName = stage?.name || confirmationEntry.stageName || stageId;

    return createStageConfirmationFollowupTasks(project, stageId, {
      includeResolved,
      users,
    }).map((task) => {
      const followupTaskId = task.id;
      const comments = getTaskComments(history, task);
      const latestCommentAt = getLatestTimestamp(comments.map((comment) => comment.at));

      return {
        ...task,
        followupTaskId,
        projectId: project.id || '',
        projectName: project.name || '',
        stageName,
        comments,
        commentCount: comments.length,
        updatedAt: getLatestTimestamp([latestCommentAt, task.resolvedAt, project.updatedAt]),
      };
    });
  });

  return {
    projectId: project.id || '',
    projectName: project.name || '',
    totalTaskCount: tasks.length,
    openTaskCount: tasks.filter((task) => task.status !== 'resolved').length,
    resolvedTaskCount: tasks.filter((task) => task.status === 'resolved').length,
    commentCount: tasks.reduce((sum, task) => sum + task.commentCount, 0),
    tasks,
  };
}

function createEmptyLedger() {
  return {
    projectId: '',
    projectName: '',
    totalTaskCount: 0,
    openTaskCount: 0,
    resolvedTaskCount: 0,
    commentCount: 0,
    tasks: [],
  };
}

function resolveStageIds(project, stageIds) {
  if (Array.isArray(stageIds)) {
    return unique(stageIds);
  }

  return unique([
    ...(Array.isArray(project.stages) ? project.stages.map((stage) => stage.id) : []),
    ...Object.keys(project.stageConfirmations || {}),
    project.currentStageId,
  ]);
}

function getTaskComments(history, task) {
  return history
    .filter((event) => {
      if (event?.type !== 'task-comment-added') {
        return false;
      }

      return (
        event.followupTaskId === task.id ||
        (event.stageId === task.stageId && event.itemId === task.itemId)
      );
    })
    .map((event) => ({
      actor: event.actor || 'System',
      at: event.at || '',
      comment: event.comment || event.note || '',
      note: event.note || '',
    }));
}

function getLatestTimestamp(values) {
  return values.filter(Boolean).sort().at(-1) || '';
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
