// SPDX-License-Identifier: EUPL-1.2
import { breaksLine, enterAsInput, flattenLines, pressBox, submitImplicitly } from './single-line';

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

  describe('enterAsInput', () => {
    it('prevents the line break of Enter and submits the form', () => {
      const { field, submitters } = formOf('<textarea></textarea><button>Add</button>');
      const event = enter();

      field.addEventListener('keydown', enterAsInput);
      field.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(submitters).toHaveLength(1);
    });

    it('prevents a beforeinput line break and submits the form', () => {
      const { field, submitters } = formOf('<textarea></textarea><button>Add</button>');
      const event = beforeInput('insertParagraph');

      field.addEventListener('beforeinput', enterAsInput);
      field.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(submitters).toHaveLength(1);
    });

    // An Angular template handler that returns false prevents the event's default.
    it('leaves other keys and input alone, and returns nothing', () => {
      const { field, submitters } = formOf('<textarea></textarea><button>Add</button>');
      const events = [
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
        beforeInput('insertText'),
      ];

      field.addEventListener('keydown', enterAsInput);
      field.addEventListener('beforeinput', enterAsInput);

      for (const event of events) {
        expect(enterAsInput(event)).toBeUndefined();
        field.dispatchEvent(event);
      }

      expect(events.map((event) => event.defaultPrevented)).toEqual([false, false]);
      expect(submitters).toEqual([]);
    });
  });

  describe('pressBox', () => {
    const boxed = () => {
      const box = document.createElement('div');
      const field = document.createElement('textarea');

      box.appendChild(field);
      box.addEventListener('mousedown', pressBox);
      document.body.appendChild(box);

      return { box, field };
    };

    it('focuses the line on a press on the box itself, keeping the press from moving focus', () => {
      const { box, field } = boxed();
      const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });

      box.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(field);
    });

    it('leaves a press on the line alone, so it can place the caret', () => {
      const { field } = boxed();
      const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });

      field.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });
  });
});
