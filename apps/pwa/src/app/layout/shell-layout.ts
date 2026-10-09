// SPDX-License-Identifier: EUPL-1.2
import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  type AnimationCallbackEvent,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  linkedSignal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';

import { CaptureQueue } from '../core/data/capture-queue';
import { CommandAttempts } from '../core/data/command-attempts';
import { DataStore } from '../core/data/data-store';
import { DoneUndo, PauseReason, UNDO_WINDOW_MS } from '../core/data/done-undo';
import { Motion } from '../core/platform/motion';
import { TAB_PATHS } from '../core/platform/tabs';
import { pathOf } from '../core/platform/url-path';
import { BottomNav } from '../ui/bottom-nav/bottom-nav';
import { CaptureButton } from '../ui/capture-button/capture-button';
import { QuickAdd } from '../ui/quick-add/quick-add';
import { UndoBar, UndoBarVariant } from '../ui/undo-bar/undo-bar';
import { flyCapture, tabInView } from './capture-flight';
import { leaveMarked } from './shell-motion';

/** The signed-in frame: the routed screen, quick add, the Undo bar and the bottom navigation. */
@Component({
  selector: 'app-shell-layout',
  imports: [RouterOutlet, BottomNav, CaptureButton, QuickAdd, UndoBar],
  providers: [CommandAttempts, CaptureQueue, DoneUndo],
  templateUrl: './shell-layout.component.html',
  styleUrl: './shell-layout.css',
})
export class ShellLayout {
  readonly #router = inject(Router);

  readonly #injector = inject(Injector);

  readonly #document = inject(DOCUMENT);

  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly #motion = inject(Motion);

  private readonly bottomNav = viewChild(BottomNav);

  private readonly bottomNavHost = viewChild(BottomNav, { read: ElementRef<HTMLElement> });

  private readonly pill = viewChild('pill', { read: ElementRef<HTMLElement> });

  private readonly main = viewChild<ElementRef<HTMLElement>>('main');

  private readonly undoBar = viewChild(UndoBar);

  private readonly undoBarHost = viewChild(UndoBar, { read: ElementRef<HTMLElement> });

  protected readonly captureQueue = inject(CaptureQueue);

  protected readonly dataStore = inject(DataStore);

  protected readonly doneUndo = inject(DoneUndo);

  protected readonly PauseReason = PauseReason;

  protected readonly windowMs = UNDO_WINDOW_MS;

  protected readonly onCapturePath = computed(() => {
    const navigation = this.#router.lastSuccessfulNavigation();

    if (navigation === null) {
      return false;
    }

    return TAB_PATHS.includes(
      pathOf(this.#router.serializeUrl(navigation.finalUrl ?? navigation.extractedUrl)),
    );
  });

  protected readonly open = linkedSignal<boolean, boolean>({
    source: this.onCapturePath,
    computation: () => false,
  });

  protected readonly text = signal('');

  /** Whether focus is in the Undo bar, from its `focusInside` output. */
  #focusInBar = false;

  /** Whether the next change of the bar's layout follows a pointer activation of Dismiss or Try again. */
  #pointerActivated = false;

  /** The latest notice, keyed by its seq: each notice is a new node, so the live region reads it, even when the text repeats. */
  protected readonly notices = computed(() => {
    const notice = this.doneUndo.notice();

    return notice === null ? [] : [notice];
  });

  protected readonly undoView = computed(() => {
    const failure = this.doneUndo.failure();

    if (failure !== null) {
      return {
        variant: failure.closedElsewhere ? UndoBarVariant.Notice : UndoBarVariant.Failed,
        title: failure.title,
        detail: failure.message,
        canRetry: failure.canRetry,
        remainingMs: null,
        windowKey: null,
      };
    }

    const pending = this.doneUndo.pending();

    if (pending !== null) {
      return {
        variant: UndoBarVariant.Done,
        title: pending.title,
        detail: null,
        canRetry: false,
        remainingMs: pending.remainingMs,
        windowKey: pending.taskId,
      };
    }

    return null;
  });

  constructor() {
    effect(() => {
      if (this.doneUndo.focusRequest() > 0) {
        afterNextRender(() => this.undoBar()?.focusAction(), { injector: this.#injector });
      }
    });

    effect(() => {
      const undone = this.doneUndo.undone();

      if (undone !== null) {
        afterNextRender(() => this.#focusTitle(undone.taskId), { injector: this.#injector });
      }
    });

    // A layout change removes the button that had focus: restore the focus the bar lost, and drop a
    // Focus pause that no focusout will end. Created after the Undo effect, so a restored title wins.
    effect(() => {
      this.undoView();

      untracked(() => {
        const wasInBar = this.#focusInBar;
        const pointer = this.#pointerActivated;

        this.#pointerActivated = false;

        if (wasInBar) {
          afterNextRender(() => this.#guardFocus(pointer), { injector: this.#injector });
        }
      });
    });

    // The bar's height lifts the page padding and quick add above it.
    effect((onCleanup) => {
      const element = this.undoBarHost()?.nativeElement;

      if (!element || typeof ResizeObserver !== 'function') {
        return;
      }

      const stop = this.#observeBlockSize(element, '--shell-undo-height');

      onCleanup(() => {
        stop();
        this.#host.nativeElement.style.setProperty('--shell-undo-height', '0px');
      });
    });

    // The nav's height lifts the page padding, the Undo bar and quick add above it. Until it is known
    // (and without ResizeObserver) the stylesheet's own estimate stands.
    effect((onCleanup) => {
      const element = this.bottomNavHost()?.nativeElement;

      if (!element || typeof ResizeObserver !== 'function') {
        return;
      }

      const stop = this.#observeBlockSize(element, '--shell-nav-height');

      onCleanup(() => {
        stop();
        this.#host.nativeElement.style.removeProperty('--shell-nav-height');
      });
    });
  }

  /** The Capture button in the bar: opens quick add, or closes it again. */
  protected toggleQuickAdd(): void {
    if (this.open()) {
      this.close();
    } else {
      this.captureQueue.clearMessage();
      this.open.set(true);
    }
  }

  protected close(): void {
    this.open.set(false);

    afterNextRender(() => this.pill()?.nativeElement.focus(), { injector: this.#injector });
  }

  protected leave(event: AnimationCallbackEvent): void {
    void leaveMarked(this.#motion, event);
  }

  protected inside(reason: PauseReason, inside: boolean): void {
    if (inside) {
      this.doneUndo.pause(reason);
    } else {
      this.doneUndo.resume(reason);
    }
  }

  protected barFocus(inside: boolean): void {
    this.#focusInBar = inside;
    this.inside(PauseReason.Focus, inside);
  }

  protected retryDone(activation: { readonly keyboard: boolean }): void {
    this.#pointerActivated = !activation.keyboard;
    this.doneUndo.retry();
  }

  protected dismissDone(activation: { readonly keyboard: boolean }): void {
    this.#pointerActivated = !activation.keyboard;
    this.doneUndo.dismiss();
  }

  /** Moves focus to the next title, or to the page heading when there is none (Escape in the bar). */
  protected focusMain(): void {
    this.#focusTitle(null);
  }

  /**
   * Writes the border-box block size of `element` to the custom property `name` on the shell host, as
   * it changes. Returns the function that stops observing.
   */
  #observeBlockSize(element: HTMLElement, name: string): () => void {
    const observer = new ResizeObserver((entries) => {
      const size = entries[0]?.borderBoxSize[0]?.blockSize;

      if (size !== undefined) {
        this.#host.nativeElement.style.setProperty(name, `${size}px`);
      }
    });

    observer.observe(element);

    return () => observer.disconnect();
  }

  /**
   * Runs after a layout change that happened while focus was in the bar. Focus still in the bar stays.
   * Otherwise the Focus pause ends, and when focus was lost (not moved elsewhere) and the change was
   * not a pointer action, it goes to the bar's first button, or to the page as Escape does.
   */
  #guardFocus(pointer: boolean): void {
    const active = this.#document.activeElement;

    if (this.undoBarHost()?.nativeElement.contains(active)) {
      return;
    }

    this.doneUndo.resume(PauseReason.Focus);
    this.#focusInBar = false;

    const lost =
      active === null ||
      active === this.#document.body ||
      active.closest('[data-leaving]') !== null;

    if (pointer || !lost) {
      return;
    }

    const bar = this.undoBar();

    if (bar) {
      bar.focusAction();
    } else {
      this.focusMain();
    }
  }

  /** Focuses the first title in the page that is not leaving (that of `taskId`, when given), else the heading. */
  #focusTitle(taskId: string | null): void {
    const main = this.main()?.nativeElement;

    if (!main) {
      return;
    }

    const title = Array.from(main.querySelectorAll<HTMLElement>('[data-task-id]')).find(
      (element) =>
        (taskId === null || element.dataset['taskId'] === taskId) &&
        element.closest('[data-leaving]') === null,
    );

    (title ? (title.closest('a') ?? title) : main.querySelector<HTMLElement>('h1'))?.focus();
  }

  protected add(text: string): void {
    const from = this.#host.nativeElement
      .querySelector('.asys-quickadd__input')
      ?.getBoundingClientRect();

    this.text.set('');
    this.captureQueue.submit(text);
    this.#flight(from, text);
  }

  /** Flies the captured text to the Inbox tab, when motion is allowed and the tab is visible. */
  #flight(from: DOMRectReadOnly | undefined, text: string): void {
    const viewport = this.#document.defaultView?.visualViewport;
    const tab = this.bottomNav()?.inboxTab();

    if (from === undefined || !this.#motion.allowed() || !viewport || !tab) {
      return;
    }

    const to = tab.getBoundingClientRect();

    if (tabInView(to, viewport)) {
      void flyCapture(this.#document, this.#motion, from, to, text);
    }
  }
}
