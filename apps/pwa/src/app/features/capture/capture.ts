// SPDX-License-Identifier: EUPL-1.2
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  inject,
  Injector,
  input,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommandTag, type Command } from '@asys/domain';

import { CommandOutcomeTag } from '../../core/api/data-api';
import { CommandAttempts } from '../../core/data/command-attempts';
import { DataStore } from '../../core/data/data-store';
import { outcomeMessage } from '../../core/data/outcome-message';
import { sharedCapture } from '../../core/data/shared-capture';
import { Ids } from '../../core/platform/ids';
import { Button, ButtonVariant } from '../../ui/button/button';
import { TextField } from '../../ui/text-field/text-field';

/** The share target: prefills what was shared and captures it into the Inbox with one tap. */
@Component({
  selector: 'app-capture',
  imports: [RouterLink, Button, TextField],
  providers: [CommandAttempts],
  template: `
    <h1 class="capture__title">Capture</h1>
    <form class="capture__form" (submit)="add($event)">
      <asys-text-field label="Title" [value]="field()" (valueChange)="field.set($event)" />
      <button asys-button type="submit" [variant]="Variant.Primary" [disabled]="!canAdd()">
        Add
      </button>
    </form>
    <div class="capture__status" role="status">
      @if (confirmation(); as captured) {
        <p class="capture__text">Captured “{{ captured }}”. It waits in the Inbox until Triage.</p>
        <p class="capture__links">
          <a routerLink="/inbox">Open the Inbox</a>
          <a routerLink="/now">Go to Now</a>
        </p>
      } @else if (message(); as text) {
        <p class="capture__text">{{ text }}</p>
      }
    </div>
  `,
  styles: `
    .capture__title {
      margin: 0 0 var(--space-3);
      font-size: var(--font-size-title);
      line-height: var(--line-height-title);
      font-weight: 700;
    }

    .capture__form {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-3);
      margin: 0 0 var(--space-3);
    }

    .capture__text {
      margin: 0 0 var(--space-2);
      font-size: var(--font-size-body);
      line-height: var(--line-height-body);
    }

    .capture__links {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-4);
      margin: 0;
      font-size: var(--font-size-body);
      line-height: var(--line-height-body);
    }

    .capture__links a {
      display: inline-flex;
      align-items: center;
      min-height: var(--tap-target);
    }
  `,
})
export class Capture {
  private readonly router = inject(Router);

  private readonly ids = inject(Ids);

  private readonly attempts = inject(CommandAttempts);

  private readonly dataStore = inject(DataStore);

  private readonly injector = inject(Injector);

  private readonly destroyRef = inject(DestroyRef);

  private readonly titleField = viewChild(TextField);

  private pending: Command | null = null;

  readonly title = input<string | undefined>();

  readonly text = input<string | undefined>();

  readonly url = input<string | undefined>();

  protected readonly Variant = ButtonVariant;

  protected readonly shared = computed(() =>
    sharedCapture({ title: this.title(), text: this.text(), url: this.url() }),
  );

  protected readonly field = linkedSignal(() => this.shared()?.title ?? '');

  protected readonly busy = signal(false);

  protected readonly message = signal<string | null>(null);

  protected readonly confirmation = signal<string | null>(null);

  protected readonly canAdd = computed(() => this.field().trim() !== '' && !this.busy());

  /** Sends the capture once; the shared URL is replaced after it is applied. */
  protected async add(event: Event): Promise<void> {
    event.preventDefault();

    const title = this.field().trim();

    if (title === '' || this.busy()) {
      return;
    }

    const command = this.commandFor(title);

    this.message.set(null);
    this.confirmation.set(null);
    this.busy.set(true);

    const outcome = await this.dataStore.send(command, this.attempts.keyFor(command));

    this.attempts.settle(command, outcome);
    this.busy.set(false);

    if (this.destroyRef.destroyed) {
      return;
    }

    switch (outcome._tag) {
      case CommandOutcomeTag.Applied:
        this.pending = null;
        this.confirmation.set(title);
        this.field.set('');
        await this.router.navigate(['/capture'], { replaceUrl: true });
        this.focusTitle();
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

  private commandFor(title: string): Command {
    const captureText = this.shared()?.captureText ?? title;
    const pending = this.pending;

    if (
      pending !== null &&
      pending._tag === CommandTag.CaptureTask &&
      pending.title === title &&
      pending.captureText === captureText
    ) {
      return pending;
    }

    const command: Command = {
      _tag: CommandTag.CaptureTask,
      taskId: this.ids.next(),
      title,
      captureText,
    };

    this.pending = command;

    return command;
  }

  private focusTitle(): void {
    afterNextRender(() => this.titleField()?.focus(), { injector: this.injector });
  }
}
