// SPDX-License-Identifier: EUPL-1.2
import { MOCK_PLATFORM_LOCATION_CONFIG } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';

import { DataStore } from './core/data/data-store';
import { preloadOnLaunch } from './preload-on-launch';

const launchAt = (url: string): ReturnType<typeof vi.fn<() => void>> => {
  const preload = vi.fn<() => void>();

  TestBed.configureTestingModule({
    providers: [
      { provide: MOCK_PLATFORM_LOCATION_CONFIG, useValue: { startUrl: `http://localhost${url}` } },
      { provide: DataStore, useValue: { preload } },
    ],
  });
  TestBed.runInInjectionContext(preloadOnLaunch);

  return preload;
};

describe('preloadOnLaunch', () => {
  it.each([
    '/',
    '/now',
    '/inbox',
    '/tasks/t1',
    '/capture?text=milk',
    '/account',
    '/recovered',
    '/signin-help',
  ])('preloads the snapshot on a launch at %s', (url) => {
    expect(launchAt(url)).toHaveBeenCalledTimes(1);
  });

  it.each(['/signin', '/signin?returnUrl=%2Fnow', '/signin/', '/signup#token=abc', '/recover'])(
    'preloads nothing on a launch at %s',
    (url) => {
      expect(launchAt(url)).not.toHaveBeenCalled();
    },
  );
});
