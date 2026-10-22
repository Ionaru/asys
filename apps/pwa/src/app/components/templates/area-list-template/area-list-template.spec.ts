// SPDX-License-Identifier: EUPL-1.2
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AreaListTemplate, type AreaListRow } from './area-list-template';

const setup = (rows: readonly AreaListRow[], loaded = true, failed = false) => {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(AreaListTemplate);
  fixture.componentRef.setInput('rows', rows);
  fixture.componentRef.setInput('loaded', loaded);
  fixture.componentRef.setInput('failed', failed);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  return { fixture, host };
};

describe('AreaListTemplate', () => {
  it('links each row to its Area, in the order given', () => {
    const { host } = setup([
      { id: 'b', name: 'Work', summary: 'Mon to Fri, 09:00 to 17:00' },
      { id: 'a', name: 'Home', summary: 'Every day' },
    ]);

    const links = [...host.querySelectorAll<HTMLAnchorElement>('a.area-list__link')];
    expect(links.map((link) => link.querySelector('.area-list__name')?.textContent)).toEqual([
      'Work',
      'Home',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/settings/areas/b',
      '/settings/areas/a',
    ]);
    expect(links[0]?.querySelector('.area-list__summary')?.textContent).toBe(
      'Mon to Fri, 09:00 to 17:00',
    );
  });

  it('says there are no Areas yet and still offers a new one', () => {
    const { host } = setup([]);

    expect(host.querySelector('.area-list__text')?.textContent).toBe('No Areas yet.');
    expect(host.querySelector('a[href="/settings/areas/new"]')?.textContent?.trim()).toBe(
      'New Area',
    );
  });

  it('shows the load state until loaded and emits retry from it', () => {
    const { fixture, host } = setup([], false, true);
    const retry = vi.fn<() => void>();
    fixture.componentInstance.retry.subscribe(retry);

    expect(host.querySelector('.area-list__list')).toBeNull();
    expect(host.querySelector('a[href="/settings/areas/new"]')).toBeNull();
    const button = host.querySelector<HTMLButtonElement>('asys-load-state button');
    expect(button).not.toBeNull();
    button?.click();
    expect(retry).toHaveBeenCalledOnce();
  });
});
