// SPDX-License-Identifier: EUPL-1.2
import { DOCUMENT } from '@angular/common';
import { inject } from '@angular/core';
import type { ActivatedRouteSnapshot, ViewTransitionInfo } from '@angular/router';

import { DataStore } from '../data/data-store';
import { Motion } from './motion';
import { TaskMorph } from './task-morph';

/** What kind of navigation a view transition accompanies; the value is the `data-transition` attribute. */
export enum TransitionKind {
  None = 'none',
  TabForward = 'tab-forward',
  TabBack = 'tab-back',
  Push = 'push',
  Pop = 'pop',
  Swap = 'swap',
}

/** What the transition kinds need to know about one side of a navigation. */
export interface RouteMotion {
  path: string;
  level: number;
  tab: number | null;
  auth: boolean;
}

const TAB_PATHS: readonly string[] = ['/now', '/today', '/inbox'];

const TASK_PATH_PREFIX = '/tasks/';

const NOW_PATH = '/now';

/** The leaf of a route snapshot tree, following first children. */
const leafOf = (snapshot: ActivatedRouteSnapshot): ActivatedRouteSnapshot => {
  let leaf = snapshot;

  while (leaf.firstChild !== null) {
    leaf = leaf.firstChild;
  }

  return leaf;
};

/** The path, navigation level and tab index of a root snapshot; a leaf without a numeric `level` is an auth route. */
export const routeMotion = (snapshot: ActivatedRouteSnapshot): RouteMotion => {
  const segments: string[] = snapshot.url.map((segment) => segment.path);
  let leaf = snapshot;

  while (leaf.firstChild !== null) {
    leaf = leaf.firstChild;
    segments.push(...leaf.url.map((segment) => segment.path));
  }

  const path = `/${segments.join('/')}`;
  const level: unknown = leaf.data['level'];
  const tab = TAB_PATHS.indexOf(path);

  return {
    path,
    level: typeof level === 'number' ? level : 0,
    tab: tab === -1 ? null : tab,
    auth: typeof level !== 'number',
  };
};

/** The kind of transition between two routes; the first matching rule decides. */
export const transitionKind = (from: RouteMotion, to: RouteMotion): TransitionKind => {
  if (from.path === to.path || from.auth || to.auth) {
    return TransitionKind.None;
  }

  if (to.level > from.level) {
    return TransitionKind.Push;
  }

  if (to.level < from.level) {
    return TransitionKind.Pop;
  }

  if (from.tab !== null && to.tab !== null) {
    return to.tab > from.tab ? TransitionKind.TabForward : TransitionKind.TabBack;
  }

  return TransitionKind.Swap;
};

/**
 * The transition the handler last took on, with the element it named for the morph. Module state because the
 * router calls the handler as a bare function, and an older transition's `finished` settles after a newer one began.
 */
let active: { transition: ViewTransition; named: Element | null } | null = null;

/** The `taskId` parameter of a snapshot's leaf, when its route motion path is a Task editor path. */
const taskIdOf = (snapshot: ActivatedRouteSnapshot): string | null =>
  routeMotion(snapshot).path.startsWith(TASK_PATH_PREFIX)
    ? leafOf(snapshot).paramMap.get('taskId')
    : null;

/** The first element hooking this Task that is not (inside) a leaving node, or null. */
const findMorphSource = (document: Document, id: string): Element | null => {
  for (const el of document.querySelectorAll('[data-task-id]')) {
    if (el.getAttribute('data-task-id') === id && el.closest('[data-leaving]') === null) {
      return el;
    }
  }

  return null;
};

/**
 * The router's view-transition handler. It skips a navigation that needs no motion, otherwise sets
 * `data-transition` on the root element for the stylesheet, and names the Task title that morphs.
 * Runs in the router's injection context.
 */
export const onViewTransitionCreated = (info: ViewTransitionInfo): void => {
  const document = inject(DOCUMENT);
  const motion = inject(Motion);
  const taskMorph = inject(TaskMorph);
  const dataStore = inject(DataStore);
  const { transition, from, to } = info;

  const kind = transitionKind(routeMotion(from), routeMotion(to));

  if (kind === TransitionKind.None || !motion.allowed()) {
    transition.skipTransition();

    return;
  }

  active?.named?.removeAttribute('data-morph');

  const current: { transition: ViewTransition; named: Element | null } = {
    transition,
    named: null,
  };

  active = current;

  const root = document.documentElement;

  root.setAttribute('data-transition', kind);

  const id =
    kind === TransitionKind.Push
      ? taskIdOf(to)
      : kind === TransitionKind.Pop
        ? taskIdOf(from)
        : null;
  const morphs =
    id !== null &&
    (kind === TransitionKind.Push ||
      (routeMotion(to).path === NOW_PATH &&
        (dataStore.now()?.ranked.some((entry) => entry.task.id === id) ?? false)));
  const source = morphs ? findMorphSource(document, id) : null;

  if (source === null) {
    taskMorph.taskId.set(null);
  } else {
    source.setAttribute('data-morph', '');
    current.named = source;
    taskMorph.taskId.set(id);
  }

  const cleanup = (): void => {
    if (active !== current) {
      return;
    }

    active = null;
    root.removeAttribute('data-transition');
    current.named?.removeAttribute('data-morph');
    taskMorph.taskId.set(null);
  };

  // `then` with both arguments rather than `finally`, so a rejected `finished` (a skipped transition) is handled.
  transition.finished.then(cleanup, cleanup);
};
