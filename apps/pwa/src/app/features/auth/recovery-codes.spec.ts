// SPDX-License-Identifier: EUPL-1.2
import { Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { AppUpdate } from '../../core/platform/app-update';
import { recoveryCodes, type RecoveryCodesRef } from './recovery-codes';

const FIRST = ['aaaa-1111', 'bbbb-2222', 'cccc-3333'];

const SECOND = ['dddd-4444', 'eeee-5555'];

@Component({ template: '' })
class Host {
  readonly ref: RecoveryCodesRef = recoveryCodes();
}

describe('recoveryCodes', () => {
  let hold: ReturnType<typeof vi.fn<() => void>>;
  let release: ReturnType<typeof vi.fn<() => void>>;

  const create = (): { fixture: ComponentFixture<Host>; ref: RecoveryCodesRef } => {
    const fixture = TestBed.createComponent(Host);

    return { fixture, ref: fixture.componentInstance.ref };
  };

  const useClipboard = (writeText: (text: string) => Promise<void>): void => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  };

  beforeEach(() => {
    hold = vi.fn<() => void>();
    release = vi.fn<() => void>();
    TestBed.configureTestingModule({
      providers: [{ provide: AppUpdate, useValue: { hold, release } }],
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('starts with no codes, no status and no hold', () => {
    const { fixture, ref } = create();

    expect(ref.codes()).toEqual([]);
    expect(ref.copyStatus()).toBeNull();
    expect(hold).not.toHaveBeenCalled();

    fixture.destroy();

    expect(release).not.toHaveBeenCalled();
  });

  describe('show', () => {
    it('sets the codes and holds the update prompt once', () => {
      const { ref } = create();

      ref.show(FIRST);

      expect(ref.codes()).toEqual(FIRST);
      expect(hold).toHaveBeenCalledTimes(1);
      expect(release).not.toHaveBeenCalled();
    });

    it('holds once over two shows and keeps the second set', () => {
      const { ref } = create();

      ref.show(FIRST);
      ref.show(SECOND);

      expect(ref.codes()).toEqual(SECOND);
      expect(hold).toHaveBeenCalledTimes(1);
      expect(release).not.toHaveBeenCalled();
    });

    it('clears the copy status of the previous set', async () => {
      useClipboard(() => Promise.resolve());
      const { ref } = create();

      ref.show(FIRST);
      await ref.copy();

      expect(ref.copyStatus()).toBe('Copied.');

      ref.show(SECOND);

      expect(ref.copyStatus()).toBeNull();
    });
  });

  describe('hide', () => {
    it('clears the codes and the copy status and releases the hold once', async () => {
      useClipboard(() => Promise.resolve());
      const { ref } = create();

      ref.show(FIRST);
      await ref.copy();
      ref.hide();

      expect(ref.codes()).toEqual([]);
      expect(ref.copyStatus()).toBeNull();
      expect(hold).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledTimes(1);
    });

    it('releases once over two hides', () => {
      const { ref } = create();

      ref.show(FIRST);
      ref.hide();
      ref.hide();

      expect(release).toHaveBeenCalledTimes(1);
    });

    it('does not release when nothing was shown', () => {
      const { ref } = create();

      ref.hide();

      expect(release).not.toHaveBeenCalled();
    });

    it('holds again for a set shown after a hide', () => {
      const { fixture, ref } = create();

      ref.show(FIRST);
      ref.hide();
      ref.show(SECOND);

      expect(hold).toHaveBeenCalledTimes(2);
      expect(release).toHaveBeenCalledTimes(1);

      fixture.destroy();

      expect(release).toHaveBeenCalledTimes(2);
    });
  });

  describe('destroy', () => {
    it('clears the codes and releases the hold once', () => {
      const { fixture, ref } = create();

      ref.show(FIRST);
      fixture.destroy();

      expect(ref.codes()).toEqual([]);
      expect(hold).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledTimes(1);
    });

    it('releases once after two shows', () => {
      const { fixture, ref } = create();

      ref.show(FIRST);
      ref.show(SECOND);
      fixture.destroy();

      expect(hold).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledTimes(1);
    });

    it('does not release again after a hide', () => {
      const { fixture, ref } = create();

      ref.show(FIRST);
      ref.hide();
      fixture.destroy();

      expect(release).toHaveBeenCalledTimes(1);
    });
  });

  describe('copy', () => {
    it('writes the codes one per line and reports Copied.', async () => {
      const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);

      useClipboard(writeText);
      const { ref } = create();

      ref.show(FIRST);
      await ref.copy();

      expect(writeText).toHaveBeenCalledExactlyOnceWith(FIRST.join('\n'));
      expect(ref.copyStatus()).toBe('Copied.');
    });

    it('reports the failure text when the write is rejected', async () => {
      useClipboard(() => Promise.reject(new Error('denied')));
      const { ref } = create();

      ref.show(FIRST);
      await ref.copy();

      expect(ref.copyStatus()).toBe('Could not copy. Select the codes instead.');
    });

    it('reports the failure text when the browser has no clipboard', async () => {
      const { ref } = create();

      ref.show(FIRST);
      await ref.copy();

      expect(ref.copyStatus()).toBe('Could not copy. Select the codes instead.');
    });

    it('replaces a failure with Copied. on a later success', async () => {
      const writeText = vi
        .fn<(text: string) => Promise<void>>()
        .mockRejectedValueOnce(new Error('denied'))
        .mockResolvedValueOnce(undefined);

      useClipboard(writeText);
      const { ref } = create();

      ref.show(FIRST);
      await ref.copy();

      expect(ref.copyStatus()).toBe('Could not copy. Select the codes instead.');

      await ref.copy();

      expect(ref.copyStatus()).toBe('Copied.');
    });
  });
});
