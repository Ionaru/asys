// SPDX-License-Identifier: EUPL-1.2
import { DOCUMENT } from '@angular/common';
import { inject } from '@angular/core';
import type { ActivatedRouteSnapshot, ViewTransitionInfo } from '@angular/router';

import { DataStore } from '../data/data-store';
import { Motion } from './motion';
import { TAB_PATHS } from './tabs';
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
  /** The leaf's numeric `data.level`; null outside the shell (the auth screens) or when a route has none. */
  level: number | null;
  tab: number | null;
  /** The leaf's `taskId` parameter, which only the Task editor has. */
  taskId: string | null;
}

const NOW_PATH = '/now';

/** The path, navigation level, tab index and Task id of a root snapshot, read along its first children. */
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
    level: typeof level === 'number' ? level : null,
    tab: tab === -1 ? null : tab,
    taskId: leaf.paramMap.get('taskId'),
  };
};

/** The kind of transition between two routes; the first matching rule decides. */
export const transitionKind = (from: RouteMotion, to: RouteMotion): TransitionKind => {
  if (from.path === to.path || from.level === null || to.level === null) {
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
  const { transition } = info;
  const from = routeMotion(info.from);
  const to = routeMotion(info.to);
  const kind = transitionKind(from, to);

  if (kind === TransitionKind.None || !motion.allowed()) {
    transition.skipTransition();

    return;
  }

  // Whatever an earlier transition named, directly or through the TaskMorph bindings, is unnamed before this one
  // names anything: two elements with one name would make the browser skip this transition.
  for (const el of document.querySelectorAll('[data-morph]')) {
    el.removeAttribute('data-morph');
  }

  const current: { transition: ViewTransition; named: Element | null } = {
    transition,
    named: null,
  };

  active = current;

  const root = document.documentElement;

  root.setAttribute('data-transition', kind);

  const id =
    kind === TransitionKind.Push ? to.taskId : kind === TransitionKind.Pop ? from.taskId : null;
  const morphs =
    id !== null &&
    (kind === TransitionKind.Push ||
      (to.path === NOW_PATH &&
        (dataStore.now()?.ranked.some((entry) => entry.task.id === id) ?? false)));
  const source = morphs ? findMorphSource(document, id) : null;

  if (source === null) {
    taskMorph.set(null);
  } else {
    source.setAttribute('data-morph', '');
    current.named = source;
    taskMorph.set(id);
  }

  const cleanup = (): void => {
    if (active !== current) {
      return;
    }

    active = null;
    root.removeAttribute('data-transition');
    current.named?.removeAttribute('data-morph');
    taskMorph.set(null);
  };

  // `then` with both arguments rather than `finally`, so a rejected `finished` (a skipped transition) is handled.
  transition.finished.then(cleanup, cleanup);
};
