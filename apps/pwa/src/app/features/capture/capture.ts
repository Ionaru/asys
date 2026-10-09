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
  templateUrl: './capture.component.html',
  styleUrl: './capture.css',
})
export class Capture {
  readonly #router = inject(Router);

  readonly #ids = inject(Ids);

  readonly #attempts = inject(CommandAttempts);

  readonly #injector = inject(Injector);

  readonly #destroyRef = inject(DestroyRef);

  private readonly titleField = viewChild(TextField);

  #pending: Command | null = null;

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

    const command = this.#commandFor(title);

    this.message.set(null);
    this.confirmation.set(null);
    this.busy.set(true);

    const outcome = await this.#attempts.send(command);

    this.busy.set(false);

    if (this.#destroyRef.destroyed) {
      return;
    }

    switch (outcome._tag) {
      case CommandOutcomeTag.Applied:
        this.#pending = null;
        this.confirmation.set(title);
        this.field.set('');
        await this.#router.navigate(['/capture'], { replaceUrl: true });
        this.#focusTitle();
        break;
      case CommandOutcomeTag.Failed:
        this.message.set(outcomeMessage(outcome));
        break;
      default:
        this.#pending = null;
        this.message.set(outcomeMessage(outcome));
        break;
    }
  }

  #commandFor(title: string): Command {
    const captureText = this.shared()?.captureText ?? title;
    const pending = this.#pending;

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
      taskId: this.#ids.next(),
      title,
      captureText,
    };

    this.#pending = command;

    return command;
  }

  #focusTitle(): void {
    afterNextRender(() => this.titleField()?.focus(), { injector: this.#injector });
  }
}
