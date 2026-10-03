// SPDX-License-Identifier: EUPL-1.2
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';
import { Session } from './core/auth/session';
import { unauthorizedInterceptor } from './core/auth/unauthorized.interceptor';
import { Theme } from './core/platform/theme';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([unauthorizedInterceptor])),
    provideAppInitializer(() => {
      inject(Session).check();
    }),
    provideAppInitializer(() => {
      inject(Theme);
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
