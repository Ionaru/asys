// SPDX-License-Identifier: EUPL-1.2
import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ReviewItem, ReviewItemAction, ReviewItemActionKind } from './review-item';

const keep: ReviewItemAction = { label: 'Keep', kind: ReviewItemActionKind.Secondary };

const drop: ReviewItemAction = { label: 'Drop', kind: ReviewItemActionKind.Quiet };

@Component({
  imports: [ReviewItem],
  template: `
    <asys-review-item
      [question]="'Still relevant?'"
      [reason]="reason()"
      [actions]="actions"
      [busy]="busy()"
      (decide)="decided.push($event)"
    >
      <a id="open-task" href="/tasks/1">Open Task</a>
    </asys-review-item>
  `,
})
class Host {
  readonly item = viewChild.required(ReviewItem);

  readonly reason = signal('No activity for 30 days');

  readonly busy = signal(false);

  readonly actions = [keep, drop];

  readonly decided: ReviewItemAction[] = [];
}

const setup = async () => {
  const fixture = TestBed.createComponent(Host);
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();

  const q = (selector: string): HTMLElement | null => fixture.nativeElement.querySelector(selector);
  const buttons = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.asys-review__actions button'));

  return { fixture, host: fixture.componentInstance, q, buttons };
};

describe('ReviewItem', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the label, question and reason', async () => {
    const { q } = await setup();

    expect(q('.asys-review__label')?.textContent?.trim()).toBe('Review item');
    expect(q('.asys-review__question')?.textContent?.trim()).toBe('Still relevant?');
    expect(q('.asys-review__reason')?.textContent?.trim()).toBe('No activity for 30 days');
  });

  it('omits the reason when it is empty', async () => {
    const { fixture, host, q } = await setup();

    host.reason.set('');
    await fixture.whenStable();

    expect(q('.asys-review__reason')).toBeNull();
  });

  it('renders one button per action, in order, with the kind as variant', async () => {
    const { buttons } = await setup();

    expect(buttons().map((b) => b.textContent?.trim())).toEqual(['Keep', 'Drop']);
    expect(buttons()[0].classList.contains('asys-button--secondary')).toBe(true);
    expect(buttons()[1].classList.contains('asys-button--quiet')).toBe(true);
  });

  it('emits decide with the action object of the clicked button', async () => {
    const { fixture, host, buttons } = await setup();

    buttons()[1].click();
    await fixture.whenStable();
    buttons()[0].click();
    await fixture.whenStable();

    expect(host.decided).toEqual([drop, keep]);
    expect(host.decided[0]).toBe(drop);
    expect(host.decided[1]).toBe(keep);
  });

  it('disables every button while busy and emits nothing', async () => {
    const { fixture, host, buttons } = await setup();

    host.busy.set(true);
    await fixture.whenStable();

    expect(buttons().every((b) => b.disabled)).toBe(true);

    buttons()[0].click();
    await fixture.whenStable();

    expect(host.decided).toEqual([]);
  });

  it('enables the buttons when not busy', async () => {
    const { buttons } = await setup();

    expect(buttons().some((b) => b.disabled)).toBe(false);
  });

  it('projects the link after the buttons, inside the group', async () => {
    const { q } = await setup();

    const group = q('.asys-review__actions');
    const link = q('#open-task');

    expect(group?.contains(link)).toBe(true);
    expect(group?.lastElementChild).toBe(link);
    expect(group?.querySelectorAll('button').length).toBe(2);
  });

  it('focus moves focus to the question', async () => {
    const { host, q } = await setup();

    host.item().focus();

    expect(document.activeElement).toBe(q('.asys-review__question'));
  });
});
