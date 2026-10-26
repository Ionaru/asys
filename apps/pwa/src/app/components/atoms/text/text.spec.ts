// SPDX-License-Identifier: EUPL-1.2
import { Component, ElementRef, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Text, TextStyle } from './text';

@Component({
  imports: [Text],
  template: `<p asys-text [textStyle]="textStyle()" [muted]="muted()">Nothing waits here.</p>`,
})
class Host {
  readonly textStyle = signal(TextStyle.Body);

  readonly muted = signal(false);
}

@Component({ imports: [Text], template: `<p asys-text>Nothing waits here.</p>` })
class DefaultHost {}

@Component({
  imports: [Text],
  template: `<p asys-text>This Area no longer exists. <a href="/x">Go</a></p>`,
})
class MixedHost {}

@Component({
  imports: [Text],
  template: `
    <h2 asys-text [textStyle]="heading">Passkeys</h2>
    <span asys-text [textStyle]="strong">Bold</span>
  `,
})
class TagsHost {
  protected readonly heading = TextStyle.Heading;

  protected readonly strong = TextStyle.BodyStrong;
}

@Component({
  imports: [Text],
  template: `<h2 asys-text #h tabindex="-1">Passkeys</h2>`,
})
class FocusHost {
  readonly heading = viewChild('h', { read: ElementRef });
}

@Component({
  imports: [Text],
  template: `<p asys-text role="status">Saved.</p>`,
})
class RoleHost {}

const styleClasses = (element: HTMLElement): string[] =>
  Array.from(element.classList).filter(
    (name) => name.startsWith('asys-text--') && name !== 'asys-text--muted',
  );

const setup = async () => {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();

  const text = (): HTMLElement => fixture.nativeElement.querySelector('p');

  return { fixture, host: fixture.componentInstance, text };
};

describe('Text', () => {
  it('defaults to a bare paragraph in the Body style', async () => {
    const fixture = TestBed.createComponent(DefaultHost);
    await fixture.whenStable();

    const text: HTMLElement = fixture.nativeElement.querySelector('p');

    expect(text.tagName).toBe('P');
    expect(text.classList.contains('asys-text')).toBe(true);
    expect(text.classList.contains('asys-text--body')).toBe(true);
    expect(styleClasses(text)).toEqual(['asys-text--body']);
    expect(text.textContent).toBe('Nothing waits here.');
  });

  it.each([
    [TextStyle.Display, 'display'],
    [TextStyle.Title, 'title'],
    [TextStyle.Heading, 'heading'],
    [TextStyle.BodyStrong, 'body-strong'],
    [TextStyle.Body, 'body'],
    [TextStyle.Reason, 'reason'],
    [TextStyle.Label, 'label'],
    [TextStyle.Time, 'time'],
    [TextStyle.TimeLarge, 'time-large'],
  ])('puts only its own style class on %s', async (style, value) => {
    const { fixture, host, text } = await setup();

    host.textStyle.set(style);
    await fixture.whenStable();

    expect(style).toBe(value);
    expect(styleClasses(text())).toEqual([`asys-text--${value}`]);
  });

  it('adds the muted class when muted, and not for Reason alone', async () => {
    const { fixture, host, text } = await setup();

    host.textStyle.set(TextStyle.Reason);
    await fixture.whenStable();

    expect(text().classList.contains('asys-text--muted')).toBe(false);

    host.muted.set(true);
    await fixture.whenStable();

    expect(text().classList.contains('asys-text--muted')).toBe(true);
  });

  it('swaps the style class without leaving a stale one', async () => {
    const { fixture, host, text } = await setup();

    host.textStyle.set(TextStyle.Heading);
    await fixture.whenStable();

    expect(text().classList.contains('asys-text--heading')).toBe(true);
    expect(text().classList.contains('asys-text--body')).toBe(false);
  });

  it('keeps the tag and projects mixed content in order', async () => {
    const mixed = TestBed.createComponent(MixedHost);
    await mixed.whenStable();

    const paragraph: HTMLElement = mixed.nativeElement.querySelector('p');

    expect(paragraph.lastElementChild?.tagName).toBe('A');
    expect(paragraph.textContent).toBe('This Area no longer exists. Go');

    const tags = TestBed.createComponent(TagsHost);
    await tags.whenStable();

    expect(tags.nativeElement.querySelector('h2').classList.contains('asys-text--heading')).toBe(
      true,
    );
    expect(
      tags.nativeElement.querySelector('span').classList.contains('asys-text--body-strong'),
    ).toBe(true);
  });

  it('can be read as an element and focused', async () => {
    const fixture = TestBed.createComponent(FocusHost);
    await fixture.whenStable();

    const element = fixture.componentInstance.heading()?.nativeElement as HTMLElement;
    document.body.append(fixture.nativeElement);
    element.focus();

    expect(element.tagName).toBe('H2');
    expect(document.activeElement).toBe(element);

    fixture.nativeElement.remove();
  });

  it('adds no role or aria attribute, and keeps one the consumer sets', async () => {
    const { text } = await setup();

    expect(text().hasAttribute('role')).toBe(false);
    expect(
      text()
        .getAttributeNames()
        .filter((name) => name.startsWith('aria-')),
    ).toEqual([]);

    const role = TestBed.createComponent(RoleHost);
    await role.whenStable();

    expect(role.nativeElement.querySelector('p').getAttribute('role')).toBe('status');
  });
});
