// SPDX-License-Identifier: EUPL-1.2
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CaptureTemplate } from './capture-template';

const setup = async (title = 'A page') => {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(CaptureTemplate);
  fixture.componentRef.setInput('title', title);
  fixture.componentRef.setInput('canAdd', true);
  fixture.componentRef.setInput('confirmation', null);
  fixture.componentRef.setInput('message', null);
  document.body.append(fixture.nativeElement as HTMLElement);
  await fixture.whenStable();
  const host = fixture.nativeElement as HTMLElement;
  const textarea = (): HTMLTextAreaElement => {
    const found = host.querySelector('textarea');
    if (found === null) throw new Error('Missing textarea');
    return found;
  };
  return { fixture, host, textarea };
};

describe('CaptureTemplate', () => {
  it('shows the Title and reports typing as titleChange', async () => {
    const { fixture, textarea } = await setup();
    const titleChange = vi.fn<(title: string) => void>();
    fixture.componentInstance.title.subscribe(titleChange);

    expect(textarea().value).toBe('A page');

    textarea().value = 'Another page';
    textarea().dispatchEvent(new Event('input', { bubbles: true }));

    expect(titleChange).toHaveBeenCalledExactlyOnceWith('Another page');
  });

  it('reports a submit as add and keeps the form from navigating', async () => {
    const { fixture, host } = await setup();
    const add = vi.fn<() => void>();
    fixture.componentInstance.add.subscribe(add);
    const event = new Event('submit', { cancelable: true });

    host.querySelector('form')?.dispatchEvent(event);

    expect(add).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it('focusTitle moves focus to the Title', async () => {
    const { fixture, textarea } = await setup();

    fixture.componentInstance.focusTitle();

    expect(document.activeElement).toBe(textarea());
  });

  it('shows the confirmation with links to the Inbox and Now', async () => {
    const { fixture, host } = await setup('');
    fixture.componentRef.setInput('confirmation', 'A page');
    await fixture.whenStable();

    expect(host.querySelector('.capture__text')?.textContent).toBe(
      'Captured “A page”. It waits in the Inbox until Triage.',
    );
    expect(
      [...host.querySelectorAll('.capture__links a')].map((link) => link.getAttribute('href')),
    ).toEqual(['/inbox', '/now']);
  });
});
