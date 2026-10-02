// SPDX-License-Identifier: EUPL-1.2
import type { Area, BlockerLink, DateSpec, ReviewItem, Settings, Task } from '@asys/domain';
import type { areas, reviewItems, settings, taskBlockers, tasks } from './schema';

const specToColumns = (spec: DateSpec | null) => ({
  date: spec === null ? null : spec.date,
  time: spec === null ? null : (spec.time ?? null),
});

const columnsToSpec = (date: string | null, time: string | null): DateSpec | null => {
  if (date === null) return null;
  return time === null ? { date } : { date, time };
};

export const taskToRow = (ownerId: string, task: Task): typeof tasks.$inferInsert => {
  const availableFrom = specToColumns(task.availableFrom);
  const due = specToColumns(task.due);

  return {
    ownerId,
    id: task.id,
    kind: task.kind,
    status: task.status,
    title: task.title,
    notes: task.notes,
    captureText: task.captureText,
    areaId: task.areaId,
    availableFromDate: availableFrom.date,
    availableFromTime: availableFrom.time,
    dueDate: due.date,
    dueTime: due.time,
    estimateMinutes: task.estimateMinutes,
    important: task.important,
    voice: task.voice,
    privacy: task.privacy,
    dueMoveCount: task.dueMoveCount,
    version: task.version,
    createdAt: new Date(task.createdAt),
    closedAt: task.closedAt === null ? null : new Date(task.closedAt),
  };
};

export const rowToTask = (row: typeof tasks.$inferSelect): Task => ({
  id: row.id,
  kind: row.kind,
  status: row.status,
  title: row.title,
  notes: row.notes,
  captureText: row.captureText,
  areaId: row.areaId,
  availableFrom: columnsToSpec(row.availableFromDate, row.availableFromTime),
  due: columnsToSpec(row.dueDate, row.dueTime),
  estimateMinutes: row.estimateMinutes,
  important: row.important,
  voice: row.voice,
  privacy: row.privacy,
  dueMoveCount: row.dueMoveCount,
  version: row.version,
  createdAt: row.createdAt.getTime(),
  closedAt: row.closedAt === null ? null : row.closedAt.getTime(),
});

export const areaToRow = (ownerId: string, area: Area): typeof areas.$inferInsert => ({
  ownerId,
  id: area.id,
  name: area.name,
  activeHours: area.activeHours,
  defaultPrivacy: area.defaultPrivacy,
  version: area.version,
});

export const rowToArea = (row: typeof areas.$inferSelect): Area => ({
  id: row.id,
  name: row.name,
  activeHours: row.activeHours,
  defaultPrivacy: row.defaultPrivacy,
  version: row.version,
});

export const linkToRow = (
  ownerId: string,
  link: BlockerLink,
): typeof taskBlockers.$inferInsert => ({
  ownerId,
  id: link.id,
  taskId: link.taskId,
  blockerId: link.blockerId,
});

export const rowToLink = (row: typeof taskBlockers.$inferSelect): BlockerLink => ({
  id: row.id,
  taskId: row.taskId,
  blockerId: row.blockerId,
});

export const reviewItemToRow = (
  ownerId: string,
  item: ReviewItem,
): typeof reviewItems.$inferInsert => ({
  ownerId,
  id: item.id,
  kind: item.kind,
  subjects: item.subjects,
  payload: item.payload,
  dedupeKey: item.dedupeKey,
  createdAt: new Date(item.createdAt),
  resolvedAt: item.resolvedAt === null ? null : new Date(item.resolvedAt),
});

export const rowToReviewItem = (row: typeof reviewItems.$inferSelect): ReviewItem => ({
  id: row.id,
  kind: row.kind,
  subjects: row.subjects,
  payload: row.payload,
  dedupeKey: row.dedupeKey,
  createdAt: row.createdAt.getTime(),
  resolvedAt: row.resolvedAt === null ? null : row.resolvedAt.getTime(),
});

export const settingsToRow = (ownerId: string, value: Settings): typeof settings.$inferInsert => ({
  ownerId,
  timeZone: value.timeZone,
  urgencyWindowDays: value.urgencyWindowDays,
});

export const rowToSettings = (row: typeof settings.$inferSelect): Settings => ({
  timeZone: row.timeZone,
  urgencyWindowDays: row.urgencyWindowDays,
});
