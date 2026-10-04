// SPDX-License-Identifier: EUPL-1.2

// Seeds an Owner's data through the HTTP API with the page's session. Call these before page.reload() so the PWA syncs it.
import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { E2E_ORIGIN } from './e2e-env.ts';

/** The parts of GET /v1/snapshot the specs read; the full shape is Snapshot in @asys/contract. */
export interface Snapshot {
  readonly seq: number;
  readonly areas: readonly { readonly id: string; readonly name: string }[];
  readonly tasks: readonly ({ readonly id: string; readonly title: string } & Record<
    string,
    unknown
  >)[];
  readonly settings: Record<string, unknown>;
}

export interface DateSpec {
  readonly date: string;
  readonly time?: string;
}

export interface TaskPatch {
  readonly title?: string;
  readonly notes?: string;
  readonly areaId?: string | null;
  readonly availableFrom?: DateSpec | null;
  readonly due?: DateSpec | null;
  readonly estimateMinutes?: number | null;
  readonly important?: boolean | null;
}

/** POSTs one Command and requires it to be Applied. */
export const command = async (
  page: Page,
  body: Record<string, unknown>,
): Promise<{ seq: number }> => {
  const response = await page.context().request.post('/v1/commands', {
    headers: { Origin: E2E_ORIGIN },
    data: { idempotencyKey: randomUUID(), ...body },
  });
  const text = await response.text();
  let json: { _tag?: string; seq?: number } = {};
  try {
    json = JSON.parse(text);
  } catch {
    // Reported below with the raw body.
  }
  if (response.status() !== 200 || json._tag !== 'Applied') {
    throw new Error(`${String(body['_tag'])} was not Applied: ${response.status()} ${text}`);
  }
  return { seq: json.seq as number };
};

export const captureTask = async (
  page: Page,
  input: { title: string; captureText?: string; areaId?: string },
): Promise<string> => {
  const taskId = randomUUID();
  await command(page, {
    _tag: 'CaptureTask',
    taskId,
    title: input.title,
    captureText: input.captureText ?? '',
    ...(input.areaId === undefined ? {} : { areaId: input.areaId }),
  });
  return taskId;
};

export const triageTask = async (
  page: Page,
  taskId: string,
  input: { important: boolean; estimateMinutes: number; areaId?: string },
): Promise<void> => {
  await command(page, {
    _tag: 'TriageTask',
    taskId,
    important: input.important,
    estimateMinutes: input.estimateMinutes,
    ...(input.areaId === undefined ? {} : { areaId: input.areaId }),
  });
};

export const editTask = async (page: Page, taskId: string, patch: TaskPatch): Promise<void> => {
  await command(page, { _tag: 'EditTask', taskId, patch });
};

export const addBlocker = async (page: Page, taskId: string, blockerId: string): Promise<void> => {
  await command(page, { _tag: 'AddBlocker', linkId: randomUUID(), taskId, blockerId });
};

/** Capture, Triage, then Edit when `due` is given. Returns the Task id. */
export const seedTask = async (
  page: Page,
  input: {
    title: string;
    important: boolean;
    estimateMinutes: number;
    due?: DateSpec;
    areaId?: string;
    captureText?: string;
  },
): Promise<string> => {
  const taskId = await captureTask(page, {
    title: input.title,
    captureText: input.captureText,
    areaId: input.areaId,
  });
  await triageTask(page, taskId, {
    important: input.important,
    estimateMinutes: input.estimateMinutes,
    areaId: input.areaId,
  });
  if (input.due !== undefined) await editTask(page, taskId, { due: input.due });
  return taskId;
};

export const snapshot = async (page: Page): Promise<Snapshot> => {
  const response = await page.context().request.get('/v1/snapshot');
  if (response.status() !== 200) throw new Error(`snapshot failed: ${response.status()}`);
  return (await response.json()) as Snapshot;
};

export const areaId = async (page: Page, name: string): Promise<string> => {
  const area = (await snapshot(page)).areas.find((candidate) => candidate.name === name);
  if (area === undefined) throw new Error(`No Area named ${name}`);
  return area.id;
};
