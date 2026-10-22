// SPDX-License-Identifier: EUPL-1.2
import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { NowHeader } from './now-header';

@Component({
  imports: [NowHeader],
  template: `
    <asys-now-header [moment]="moment()" [datetime]="datetime()">
      <a id="more" href="/settings" aria-label="More: Settings">More</a>
    </asys-now-header>
  `,
})
class Host {
  readonly header = viewChild.required(NowHeader);

  readonly moment = signal('Fri 9 Oct · 14:05');

  readonly datetime = signal('2026-10-09T14:05');
}

@Component({
  imports: [NowHeader],
  template: `<asys-now-header moment="Fri 9 Oct · 14:05" datetime="2026-10-09T14:05" />`,
})
class BareHost {}

const collapsed = (el: Element | null | undefined): string | undefined =>
  el?.textContent?.replace(/\s+/g, ' ').trim();

const must = <T>(value: T | null | undefined, what = 'value'): T => {
  if (value === null || value === undefined) {
    throw new Error(`Missing ${what}`);
  }

  return value;
};

const setup = async () => {
  const fixture = TestBed.createComponent(Host);
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();

  const q = (selector: string): HTMLElement | null => fixture.nativeElement.querySelector(selector);
  const heading = (): HTMLElement => must(q('h1'), 'the heading');
  const top = (): HTMLElement => must(q('.asys-now-header__top'), 'the top row');

  return { fixture, host: fixture.componentInstance, q, heading, top };
};

describe('NowHeader', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders a header holding the top row, which holds the moment heading', async () => {
    const { q } = await setup();

    expect(
      q(
        'asys-now-header > header.asys-now-header > div.asys-now-header__top > h1.asys-now-header__moment',
      ),
    ).not.toBeNull();
    expect(document.querySelectorAll('asys-now-header h1')).toHaveLength(1);
  });

  it('makes the heading focusable by script only', async () => {
    const { heading } = await setup();

    expect(heading().tagName).toBe('H1');
    expect(heading().getAttribute('tabindex')).toBe('-1');
  });

  it('reads Now, then the moment in the heading', async () => {
    const { heading } = await setup();

    expect(collapsed(heading())).toBe('Now, Fri 9 Oct · 14:05');
  });

  it('hides the word Now from sight but not from screen readers', async () => {
    const { heading } = await setup();
    const hidden = must(heading().querySelector('span.asys-visually-hidden'));

    expect(collapsed(hidden)).toBe('Now,');
    expect(hidden.nextElementSibling).toBe(heading().querySelector('time'));
  });

  it('puts the moment in a time element with the datetime', async () => {
    const { heading } = await setup();
    const time = must(heading().querySelector('time'));

    expect(time.getAttribute('datetime')).toBe('2026-10-09T14:05');
    expect(collapsed(time)).toBe('Fri 9 Oct · 14:05');
  });

  it('follows a change of the moment and of the datetime', async () => {
    const { fixture, host, heading } = await setup();

    host.moment.set('Sat 10 Oct · 08:30');
    host.datetime.set('2026-10-10T08:30');
    await fixture.whenStable();

    const time = must(heading().querySelector('time'));

    expect(collapsed(heading())).toBe('Now, Sat 10 Oct · 08:30');
    expect(time.getAttribute('datetime')).toBe('2026-10-10T08:30');
    expect(collapsed(time)).toBe('Sat 10 Oct · 08:30');
  });

  it('projects content after the heading, inside the top row', async () => {
    const { q, heading, top } = await setup();
    const more = must(q('#more'));

    expect(top().contains(more)).toBe(true);
    expect(top().children).toHaveLength(2);
    expect(top().children[0]).toBe(heading());
    expect(top().children[1]).toBe(more);
    expect(heading().nextElementSibling).toBe(more);
  });

  it('keeps the top row as the only child of the header', async () => {
    const { q, top } = await setup();
    const header = must(q('header.asys-now-header'));

    expect(header.children).toHaveLength(1);
    expect(header.children[0]).toBe(top());
  });

  it('has the heading alone in the top row when nothing is projected', async () => {
    const fixture = TestBed.createComponent(BareHost);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();

    const top = must<HTMLElement>(fixture.nativeElement.querySelector('.asys-now-header__top'));

    expect(Array.from(top.children, (el) => el.tagName)).toEqual(['H1']);
  });

  it('focusHeading moves focus to the heading', async () => {
    const { fixture, host, heading } = await setup();

    expect(document.activeElement).not.toBe(heading());

    host.header().focusHeading();
    await fixture.whenStable();

    expect(document.activeElement).toBe(heading());
  });
});
