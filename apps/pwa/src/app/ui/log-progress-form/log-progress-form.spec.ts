// SPDX-License-Identifier: EUPL-1.2
import { TestBed } from '@angular/core/testing';
import { CommandTag, TaskStatus } from '@asys/domain';

import { estimateNowText, LogProgressForm, logProgressCommand } from './log-progress-form';

const must = <T>(value: T | null | undefined, what = 'value'): T => {
  if (value === null || value === undefined) {
    throw new Error(`Missing ${what}`);
  }

  return value;
};

const setup = async (estimateMinutes = 30, busy = false) => {
  const fixture = TestBed.createComponent(LogProgressForm);

  document.body.appendChild(fixture.nativeElement);
  fixture.componentRef.setInput('estimateMinutes', estimateMinutes);
  fixture.componentRef.setInput('busy', busy);

  const save = vi.fn<(minutes: number) => void>();
  const cancel = vi.fn<() => void>();

  fixture.componentInstance.save.subscribe(save);
  fixture.componentInstance.cancel.subscribe(cancel);

  await fixture.whenStable();

  const root = (): HTMLElement => fixture.nativeElement;
  const input = (): HTMLInputElement => must(root().querySelector('input.asys-field__input'));
  const form = (): HTMLFormElement => must(root().querySelector('form.asys-progress'));
  const error = (): HTMLElement | null => root().querySelector('.asys-field__error');
  const buttons = (): HTMLButtonElement[] => Array.from(root().querySelectorAll('button'));
  const button = (name: string): HTMLButtonElement =>
    must(buttons().find((b) => b.textContent?.trim() === name));
  const type = async (text: string): Promise<void> => {
    input().value = text;
    input().dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
  };
  const submit = async (): Promise<void> => {
    button('Save').click();
    await fixture.whenStable();
  };

  return { fixture, root, input, form, error, button, buttons, type, submit, save, cancel };
};

describe('LogProgressForm', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('labels the field and gives it a text input with a numeric keyboard', async () => {
    const { root, input } = await setup();
    const label = must(root().querySelector('label.asys-field__label'));

    expect(label.textContent?.trim()).toBe('Time still needed');
    expect(label.getAttribute('for')).toBe(input().id);
    expect(input().id).not.toBe('');
    expect(input().type).toBe('text');
    expect(input().getAttribute('inputmode')).toBe('numeric');
    expect(input().getAttribute('autocomplete')).toBe('off');
  });

  it('shows a hint with the stored Estimate and no error at first', async () => {
    const { root, error, input } = await setup(30);
    const hint = must(root().querySelector('.asys-field__hint'));

    expect(hint.textContent?.trim()).toBe('Whole minutes, less than 30 min.');
    expect(error()).toBeNull();
    expect(input().getAttribute('aria-invalid')).not.toBe('true');
  });

  it('formats a long Estimate in the hint', async () => {
    const { root } = await setup(90);

    expect(root().querySelector('.asys-field__hint')?.textContent?.trim()).toBe(
      'Whole minutes, less than 1 h 30.',
    );
  });

  it('has a Save submit button and a Cancel button', async () => {
    const { button } = await setup();

    expect(button('Save').type).toBe('submit');
    expect(button('Cancel').type).toBe('button');
  });

  it('gives each instance its own ids', async () => {
    const first = await setup();
    const second = await setup();

    expect(first.input().id).not.toBe(second.input().id);
  });

  it('focuses the input when it first renders', async () => {
    const { input } = await setup();

    expect(document.activeElement).toBe(input());
  });

  it.each([
    ['15', 15],
    ['29', 29],
    ['1', 1],
    ['  15  ', 15],
  ])('emits save for %j', async (text, minutes) => {
    const { type, submit, save, error } = await setup(30);

    await type(text);
    await submit();

    expect(save).toHaveBeenCalledExactlyOnceWith(minutes);
    expect(error()).toBeNull();
  });

  it.each(['30', '0', 'abc', '1.5', '', '   ', '31', '-5', '1e1', '15 min'])(
    'shows the error and emits nothing for %j',
    async (text) => {
      const { type, submit, save, error, input, root } = await setup(30);

      await type(text);
      await submit();

      expect(save).not.toHaveBeenCalled();
      expect(error()?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
        'Error: Use whole minutes from 1 to 29.',
      );
      expect(error()?.querySelector('.asys-field__error-word')?.textContent?.trim()).toBe('Error:');
      expect(input().getAttribute('aria-invalid')).toBe('true');
      expect(root().querySelector('.asys-field__hint')).toBeNull();
    },
  );

  it('names the highest allowed value after the stored Estimate', async () => {
    const { type, submit, error } = await setup(2);

    await type('2');
    await submit();

    expect(error()?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Error: Use whole minutes from 1 to 1.',
    );
  });

  it('points the input at the error with aria-describedby', async () => {
    const { type, submit, error, input, root } = await setup(30);

    expect(input().getAttribute('aria-describedby')).toBe(
      root().querySelector('.asys-field__hint')?.id,
    );

    await type('abc');
    await submit();

    expect(error()?.id).not.toBe('');
    expect(input().getAttribute('aria-describedby')).toBe(error()?.id);
  });

  it('clears the error and keeps the text after a valid submit', async () => {
    const { type, submit, save, error, input } = await setup(30);

    await type('abc');
    await submit();
    await type('15');
    await submit();

    expect(save).toHaveBeenCalledExactlyOnceWith(15);
    expect(error()).toBeNull();
    expect(input().value).toBe('15');
    expect(input().getAttribute('aria-invalid')).not.toBe('true');
  });

  it('does not reload the page on submit', async () => {
    const { form, type } = await setup(30);

    await type('15');
    const event = new Event('submit', { bubbles: true, cancelable: true });
    form().dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  describe('while busy', () => {
    it('disables Save', async () => {
      const { button } = await setup(30, true);

      expect(button('Save').disabled).toBe(true);
      expect(button('Cancel').disabled).toBe(false);
    });

    it('emits nothing even when the form is submitted directly', async () => {
      const { form, type, save, fixture } = await setup(30, true);

      await type('15');
      form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await fixture.whenStable();

      expect(save).not.toHaveBeenCalled();
    });

    it('saves again once it is no longer busy', async () => {
      const { fixture, type, submit, save } = await setup(30, true);

      await type('15');
      fixture.componentRef.setInput('busy', false);
      await fixture.whenStable();
      await submit();

      expect(save).toHaveBeenCalledExactlyOnceWith(15);
    });
  });

  describe('leaving', () => {
    it('emits cancel from the Cancel button', async () => {
      const { button, cancel, save, fixture } = await setup();

      button('Cancel').click();
      await fixture.whenStable();

      expect(cancel).toHaveBeenCalledTimes(1);
      expect(save).not.toHaveBeenCalled();
    });

    it('emits cancel when Escape is pressed in the input', async () => {
      const { input, cancel } = await setup();

      input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      expect(cancel).toHaveBeenCalledTimes(1);
    });

    it('emits cancel when Escape is pressed on a button in the form', async () => {
      const { button, cancel } = await setup();

      button('Save').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      expect(cancel).toHaveBeenCalledTimes(1);
    });

    it('does not cancel for other keys', async () => {
      const { input, cancel } = await setup();

      input().dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));

      expect(cancel).not.toHaveBeenCalled();
    });
  });
});

describe('logProgressCommand', () => {
  it('lowers the Estimate of an Open Task to the minutes still needed', () => {
    expect(logProgressCommand('dentist', 15)).toEqual({
      _tag: CommandTag.LogProgress,
      taskId: 'dentist',
      remainingMinutes: 15,
      expect: { status: TaskStatus.Open },
    });
  });

  it('carries the Task id and the minutes it is given', () => {
    const command = logProgressCommand('t7', 1);

    expect(command.taskId).toBe('t7');
    expect(command.remainingMinutes).toBe(1);
  });
});

describe('estimateNowText', () => {
  it.each([
    [1, 'Estimate is now 1 min.'],
    [10, 'Estimate is now 10 min.'],
    [15, 'Estimate is now 15 min.'],
    [90, 'Estimate is now 1 h 30.'],
  ])('reads the Estimate of %s minutes as %j', (minutes, text) => {
    expect(estimateNowText(minutes)).toBe(text);
  });
});
