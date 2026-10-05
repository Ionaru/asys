// SPDX-License-Identifier: EUPL-1.2
import { Routes } from '@angular/router';

import { signedInGuard, signedOutGuard } from './core/auth/guards';
import { Capture } from './features/capture/capture';
import { Inbox } from './features/inbox/inbox';
import { Now } from './features/now/now';
import { Today } from './features/today/today';
import { ShellLayout } from './layout/shell-layout';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'now' },
  {
    path: 'signin',
    loadComponent: () => import('./features/sign-in/sign-in').then((m) => m.SignIn),
    canActivate: [signedOutGuard],
    title: 'Sign in · ASYS',
  },
  {
    path: 'signup',
    loadComponent: () => import('./features/sign-up/sign-up').then((m) => m.SignUp),
    canActivate: [signedOutGuard],
    title: 'Sign up · ASYS',
  },
  {
    path: 'recover',
    loadComponent: () => import('./features/recover/recover').then((m) => m.Recover),
    canActivate: [signedOutGuard],
    title: 'Recovery code · ASYS',
  },
  {
    path: 'recovered',
    loadComponent: () => import('./features/recovered/recovered').then((m) => m.Recovered),
    canActivate: [signedInGuard],
    title: 'Signed in · ASYS',
  },
  {
    path: '',
    component: ShellLayout,
    canActivate: [signedInGuard],
    children: [
      { path: 'now', component: Now, title: 'Now · ASYS', data: { level: 0 } },
      { path: 'today', component: Today, title: 'Today · ASYS', data: { level: 0 } },
      { path: 'inbox', component: Inbox, title: 'Inbox · ASYS', data: { level: 0 } },
      { path: 'capture', component: Capture, title: 'Capture · ASYS', data: { level: 0 } },
      {
        path: 'tasks/:taskId',
        loadComponent: () =>
          import('./features/task/task-editor-route').then((m) => m.TaskEditorRoute),
        title: 'Task · ASYS',
        data: { level: 1 },
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/settings/settings').then((m) => m.Settings),
        title: 'Settings · ASYS',
        data: { level: 1 },
      },
      {
        path: 'settings/areas',
        loadComponent: () => import('./features/areas/area-list').then((m) => m.AreaList),
        title: 'Areas · ASYS',
        data: { level: 2 },
      },
      {
        path: 'settings/areas/new',
        loadComponent: () =>
          import('./features/areas/area-editor-route').then((m) => m.AreaEditorRoute),
        title: 'New Area · ASYS',
        data: { level: 3 },
      },
      {
        path: 'settings/areas/:areaId',
        loadComponent: () =>
          import('./features/areas/area-editor-route').then((m) => m.AreaEditorRoute),
        title: 'Area · ASYS',
        data: { level: 3 },
      },
      {
        path: 'account',
        loadComponent: () => import('./features/account/account').then((m) => m.Account),
        title: 'Account · ASYS',
        data: { level: 2 },
      },
    ],
  },
  { path: '**', redirectTo: 'now' },
];
