// SPDX-License-Identifier: EUPL-1.2
// jsdom implements HTMLDialogElement without show, showModal or close (jsdom issue 3294), so the unit tests
// get a small stand-in. A real browser queues the close event; here it fires at once.
if (!('showModal' in HTMLDialogElement.prototype)) {
  Object.defineProperty(HTMLDialogElement.prototype, 'show', {
    configurable: true,
    writable: true,
    value(this: HTMLDialogElement): void {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    writable: true,
    value(this: HTMLDialogElement): void {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    writable: true,
    value(this: HTMLDialogElement): void {
      if (!this.open) {
        return;
      }
      this.open = false;
      this.dispatchEvent(new Event('close'));
    },
  });
}
