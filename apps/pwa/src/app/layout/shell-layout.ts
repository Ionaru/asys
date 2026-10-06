// SPDX-License-Identifier: EUPL-1.2
import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { CommandTag, type Command } from '@asys/domain';

import { CommandOutcomeTag } from '../core/api/data-api';
import { CommandAttempts } from '../core/data/command-attempts';
import { DataStore } from '../core/data/data-store';
import { outcomeMessage } from '../core/data/outcome-message';
import { Ids } from '../core/platform/ids';
import { TAB_PATHS } from '../core/platform/tabs';
import { BottomNav } from '../ui/bottom-nav/bottom-nav';
import { Button, ButtonSize, ButtonVariant } from '../ui/button/button';
import { CaptureButton } from '../ui/capture-button/capture-button';
import { QuickAdd } from '../ui/quick-add/quick-add';

/** The signed-in frame: a Settings link, the routed screen, quick add and the bottom navigation. */
@Component({
  selector: 'app-shell-layout',
  imports: [RouterOutlet, RouterLink, Button, BottomNav, CaptureButton, QuickAdd],
  providers: [CommandAttempts],
  template: `
    <header class="shell__header">
      <a asys-button routerLink="/settings" [variant]="Variant.Quiet" [size]="Size.Small"
        >Settings</a
      >
    </header>
    <main
      class="asys-page shell__page"
      [class.shell__page--pill]="onCapturePath() && !open()"
      [class.shell__page--bar]="onCapturePath() && open()"
    >
      <router-outlet />
    </main>
    @if (onCapturePath()) {
      @if (open()) {
        <asys-quick-add
          class="shell__quickadd"
          [(value)]="text"
          [busy]="busy()"
          [message]="message()"
          (add)="add($event)"
          (close)="close()"
        />
      } @else {
        <button asys-capture-button #pill class="shell__capture" (click)="openQuickAdd()"></button>
      }
    }
    <asys-bottom-nav class="shell__nav" [inboxCount]="dataStore.inboxCount()" />
  `,
  styles: `
    .shell__header {
      display: flex;
      justify-content: flex-end;
      padding: var(--space-2) var(--space-4);
    }

    .shell__page {
      padding-bottom: calc(56px + var(--space-4) + env(safe-area-inset-bottom));
    }

    .shell__page--pill {
      padding-bottom: calc(
        56px + var(--space-4) + env(safe-area-inset-bottom) + 56px + var(--space-3)
      );
    }

    .shell__page--bar {
      padding-bottom: calc(
        56px + var(--space-4) + env(safe-area-inset-bottom) + var(--tap-target) + 3 *
          var(--space-3) + var(--space-2) + var(--space-1) + 2 * var(--line-height-reason)
      );
    }

    .shell__capture {
      position: fixed;
      right: var(--space-4);
      bottom: calc(56px + var(--space-3) + env(safe-area-inset-bottom));
    }

    .shell__quickadd {
      position: fixed;
      inset-inline: 0;
      bottom: calc(56px + env(safe-area-inset-bottom));
      display: block;
    }

    .shell__nav {
      position: fixed;
      inset-inline: 0;
      bottom: 0;
      display: block;
      padding-bottom: env(safe-area-inset-bottom);
      background: var(--surface);
    }
  `,
})
export class ShellLayout {
  private readonly router = inject(Router);

  private readonly ids = inject(Ids);

  private readonly attempts = inject(CommandAttempts);

  private readonly injector = inject(Injector);

  private readonly pill = viewChild('pill', { read: ElementRef<HTMLElement> });

  private readonly quickAdd = viewChild(QuickAdd);

  private pending: Command | null = null;

  protected readonly dataStore = inject(DataStore);

  protected readonly Variant = ButtonVariant;

  protected readonly Size = ButtonSize;

  protected readonly onCapturePath = computed(() => {
    const navigation = this.router.lastSuccessfulNavigation();

    if (navigation === null) {
      return false;
    }

    const url = this.router.serializeUrl(navigation.finalUrl ?? navigation.extractedUrl);
    const path = url.split(/[?#]/)[0];

    return TAB_PATHS.includes(path);
  });

  protected readonly open = linkedSignal<boolean, boolean>({
    source: this.onCapturePath,
    computation: () => false,
  });

  protected readonly text = signal('');

  protected readonly message = signal<string | null>(null);

  protected readonly busy = signal(false);

  protected openQuickAdd(): void {
    if (!this.busy()) {
      this.message.set(null);
    }

    this.open.set(true);
  }

  protected close(): void {
    this.open.set(false);

    afterNextRender(() => this.pill()?.nativeElement.focus(), { injector: this.injector });
  }

  protected async add(text: string): Promise<void> {
    if (this.busy()) {
      return;
    }

    const command = this.commandFor(text);

    this.busy.set(true);

    const outcome = await this.dataStore.send(command, this.attempts.keyFor(command));

    this.attempts.settle(command, outcome);
    this.busy.set(false);

    switch (outcome._tag) {
      case CommandOutcomeTag.Applied:
        this.pending = null;
        this.text.set('');
        this.message.set('Captured. It waits in the Inbox.');
        this.focusInput();
        break;
      case CommandOutcomeTag.Failed:
        this.message.set(outcomeMessage(outcome));
        break;
      default:
        this.pending = null;
        this.message.set(outcomeMessage(outcome));
        break;
    }
  }

  private commandFor(text: string): Command {
    const pending = this.pending;

    if (pending !== null && pending._tag === CommandTag.CaptureTask && pending.title === text) {
      return pending;
    }

    const command: Command = {
      _tag: CommandTag.CaptureTask,
      taskId: this.ids.next(),
      title: text,
      captureText: text,
    };

    this.pending = command;

    return command;
  }

  private focusInput(): void {
    afterNextRender(
      () => {
        if (this.open()) {
          this.quickAdd()?.focus();
        }
      },
      { injector: this.injector },
    );
  }
}
