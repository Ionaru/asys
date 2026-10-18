// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { InputBox } from '../input-box/input-box';
import { breaksLine, flattenLines, SingleLine, submitImplicitly } from './single-line';

const enter = (init: KeyboardEventInit = {}): KeyboardEvent =>
  new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init });

const beforeInput = (inputType: string): InputEvent =>
  new InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true });

/** Builds a form from markup and records each submit and its submitter, preventing the navigation. */
const formOf = (markup: string) => {
  const form = document.createElement('form');
  const submitters: (HTMLElement | null)[] = [];

  form.innerHTML = markup;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submitters.push(event.submitter);
  });
  document.body.appendChild(form);

  const field = form.querySelector('textarea') as HTMLTextAreaElement;

  return { form, field, submitters };
};

describe('single-line', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('breaksLine', () => {
    it('is true for Enter, also with Shift, and false while composing', () => {
      expect(breaksLine(enter())).toBe(true);
      expect(breaksLine(enter({ shiftKey: true }))).toBe(true);
      expect(breaksLine(enter({ isComposing: true }))).toBe(false);
    });

    it('is false for other keys', () => {
      for (const key of ['a', 'Escape', 'Tab', 'End']) {
        expect(breaksLine(new KeyboardEvent('keydown', { key })), key).toBe(false);
      }
    });

    it('is true for a beforeinput line break or paragraph, and false for other input', () => {
      expect(breaksLine(beforeInput('insertLineBreak'))).toBe(true);
      expect(breaksLine(beforeInput('insertParagraph'))).toBe(true);
      expect(breaksLine(beforeInput('insertText'))).toBe(false);
      expect(breaksLine(beforeInput('insertFromPaste'))).toBe(false);
      expect(breaksLine(new Event('input'))).toBe(false);
    });
  });

  describe('flattenLines', () => {
    it('turns each line break into a space and returns the value', () => {
      const field = document.createElement('textarea');

      field.value = 'a\n\nb\n';

      expect(flattenLines(field)).toBe('a  b ');
      expect(field.value).toBe('a  b ');
    });

    it('keeps the selection where it was', () => {
      const field = document.createElement('textarea');

      document.body.appendChild(field);
      field.value = 'Call\nMarit';
      field.setSelectionRange(2, 7);
      flattenLines(field);

      expect([field.selectionStart, field.selectionEnd]).toEqual([2, 7]);
    });

    it('leaves a value without line breaks alone', () => {
      const field = document.createElement('textarea');

      document.body.appendChild(field);
      field.value = 'Call Marit';
      field.setSelectionRange(4, 4);

      expect(flattenLines(field)).toBe('Call Marit');
      expect([field.selectionStart, field.selectionEnd]).toEqual([4, 4]);
    });
  });

  describe('submitImplicitly', () => {
    it('clicks the first submit button, which submits with it as the submitter', () => {
      const { form, field, submitters } = formOf(
        '<textarea></textarea><button type="button">Other</button>' +
          '<button type="submit">Add</button><button type="submit">Later</button>',
      );
      const clicks: string[] = [];

      form.addEventListener('click', (event) =>
        clicks.push((event.target as HTMLElement).textContent ?? ''),
      );
      submitImplicitly(field);

      expect(clicks).toEqual(['Add']);
      expect(submitters.map((submitter) => submitter?.textContent)).toEqual(['Add']);
    });

    it('treats a button without a type as a submit button', () => {
      const { field, submitters } = formOf('<textarea></textarea><button>Save</button>');

      submitImplicitly(field);

      expect(submitters).toHaveLength(1);
    });

    it('submits nothing while the first submit button is disabled', () => {
      const { field, submitters } = formOf(
        '<textarea></textarea><button type="submit" disabled>Add</button>',
      );

      submitImplicitly(field);

      expect(submitters).toEqual([]);
    });

    it('submits a form without a submit button when no other field counts', () => {
      const { field, submitters } = formOf(
        '<textarea></textarea><textarea></textarea><input type="checkbox" />',
      );

      submitImplicitly(field);

      expect(submitters).toEqual([null]);
    });

    it.each(['text', 'time', 'number'])(
      'leaves a form without a submit button alone when it has a %s input',
      (type) => {
        const { field, submitters } = formOf(`<textarea></textarea><input type="${type}" />`);

        submitImplicitly(field);

        expect(submitters).toEqual([]);
      },
    );

    it('does nothing for a field outside a form', () => {
      const field = document.createElement('textarea');

      document.body.appendChild(field);

      expect(() => submitImplicitly(field)).not.toThrow();
    });
  });

  describe('SingleLine', () => {
    @Component({
      imports: [SingleLine, InputBox],
      template: `
        <form (submit)="submitted.push($event.submitter); $event.preventDefault()">
          @if (boxed()) {
            <asys-input-box>
              <textarea
                asys-single-line
                [submitOnEnter]="submitOnEnter()"
                (lineChange)="changes.push($event)"
                (lineBreak)="log.push('break')"
              ></textarea>
            </asys-input-box>
          } @else {
            <textarea
              asys-single-line
              [submitOnEnter]="submitOnEnter()"
              (lineChange)="changes.push($event)"
              (lineBreak)="log.push('break')"
            ></textarea>
          }
          <button type="submit" (click)="log.push('submit')">Add</button>
        </form>
      `,
    })
    class Host {
      readonly boxed = signal(true);
      readonly submitOnEnter = signal(true);
      readonly changes: string[] = [];
      readonly log: string[] = [];
      readonly submitted: (HTMLElement | null)[] = [];
    }

    const mount = async (setup: (host: Host) => void = () => undefined) => {
      const fixture = TestBed.createComponent(Host);

      setup(fixture.componentInstance);
      fixture.detectChanges();
      await fixture.whenStable();

      const el = fixture.nativeElement as HTMLElement;

      return {
        fixture,
        host: fixture.componentInstance,
        field: el.querySelector('textarea') as HTMLTextAreaElement,
      };
    };

    it('sets rows to 1', async () => {
      const { field } = await mount();

      expect(field.getAttribute('rows')).toBe('1');
    });

    it('adds the control class and wrap off in an input box', async () => {
      const { field } = await mount();

      expect(field.classList.contains('asys-input-box__control')).toBe(true);
      expect(field.getAttribute('wrap')).toBe('off');
    });

    it('adds neither the control class nor wrap outside an input box', async () => {
      const { field } = await mount((host) => host.boxed.set(false));

      expect(field.getAttribute('rows')).toBe('1');
      expect(field.classList.contains('asys-input-box__control')).toBe(false);
      expect(field.hasAttribute('wrap')).toBe(false);
    });

    it('flattens line breaks on input and emits lineChange with the flat value', async () => {
      const { field, host } = await mount();

      field.value = 'a\nb';
      field.dispatchEvent(new Event('input', { bubbles: true }));

      expect(field.value).toBe('a b');
      expect(host.changes).toEqual(['a b']);
    });

    it('prevents Enter, emits lineBreak and then submits through the first submit button', async () => {
      const { field, host } = await mount();
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });

      field.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(host.log).toEqual(['break', 'submit']);
      expect(host.submitted).toHaveLength(1);
    });

    it('prevents a beforeinput line break, emits lineBreak and submits', async () => {
      const { field, host } = await mount();
      const event = new InputEvent('beforeinput', {
        inputType: 'insertParagraph',
        bubbles: true,
        cancelable: true,
      });

      field.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(host.log).toEqual(['break', 'submit']);
    });

    it('emits lineBreak but does not submit while submitOnEnter is false', async () => {
      const { field, host } = await mount((h) => h.submitOnEnter.set(false));
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });

      field.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(host.log).toEqual(['break']);
      expect(host.submitted).toEqual([]);
    });

    it('leaves letters, Escape, composing Enter and insertText alone', async () => {
      const { field, host } = await mount();
      const events = [
        new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }),
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
        new KeyboardEvent('keydown', {
          key: 'Enter',
          isComposing: true,
          bubbles: true,
          cancelable: true,
        }),
        new InputEvent('beforeinput', { inputType: 'insertText', bubbles: true, cancelable: true }),
      ];

      for (const event of events) {
        field.dispatchEvent(event);
      }

      expect(events.map((event) => event.defaultPrevented)).toEqual([false, false, false, false]);
      expect(host.log).toEqual([]);
    });
  });
});
