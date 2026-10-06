// SPDX-License-Identifier: EUPL-1.2
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';
import { keepaliveInterceptor } from './core/api/keepalive';
import { provideApi } from './core/api/provide-api';
import { Session } from './core/auth/session';
import { unauthorizedInterceptor } from './core/auth/unauthorized.interceptor';
import { Theme } from './core/platform/theme';
import { onViewTransitionCreated } from './core/platform/view-transitions';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withViewTransitions({ skipInitialTransition: true, onViewTransitionCreated }),
    ),
    provideHttpClient(withInterceptors([unauthorizedInterceptor, keepaliveInterceptor])),
    provideApi(),
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
