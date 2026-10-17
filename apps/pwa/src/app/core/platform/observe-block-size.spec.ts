// SPDX-License-Identifier: EUPL-1.2
import { observeBlockSize } from './observe-block-size';

const OBSERVER_KEY = 'ResizeObserver';

interface FakeObserver {
  readonly observed: Element[];
  readonly disconnect: ReturnType<typeof vi.fn>;
  readonly report: (entries: unknown[]) => void;
}

/** Installs a `ResizeObserver` that reports nothing until a test calls `report`. */
const installObserver = (): FakeObserver[] => {
  const instances: FakeObserver[] = [];

  class FakeResizeObserver {
    readonly observed: Element[] = [];

    readonly disconnect = vi.fn();

    readonly #callback: (entries: unknown[], observer: unknown) => void;

    constructor(callback: (entries: unknown[], observer: unknown) => void) {
      this.#callback = callback;
      instances.push(this);
    }

    observe(target: Element): void {
      this.observed.push(target);
    }

    unobserve(): void {
      // Not used by observeBlockSize.
    }

    report(entries: unknown[]): void {
      this.#callback(entries, this);
    }
  }

  vi.stubGlobal(OBSERVER_KEY, FakeResizeObserver);

  return instances;
};

const entry = (blockSize: number): unknown => ({
  borderBoxSize: [{ blockSize, inlineSize: 390 }],
});

describe('observeBlockSize', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates one observer and observes the element once', () => {
    const instances = installObserver();
    const element = document.createElement('div');

    observeBlockSize(element, vi.fn());

    expect(instances).toHaveLength(1);
    expect(instances[0]?.observed).toEqual([element]);
  });

  it('reports the border-box block size of the entry', () => {
    const instances = installObserver();
    const onSize = vi.fn();

    observeBlockSize(document.createElement('div'), onSize);
    instances[0]?.report([entry(56)]);

    expect(onSize).toHaveBeenCalledTimes(1);
    expect(onSize).toHaveBeenCalledWith(56);
  });

  it('reads only the first entry', () => {
    const instances = installObserver();
    const onSize = vi.fn();

    observeBlockSize(document.createElement('div'), onSize);
    instances[0]?.report([entry(10), entry(20)]);

    expect(onSize).toHaveBeenCalledTimes(1);
    expect(onSize).toHaveBeenCalledWith(10);
  });

  it('ignores an entry without a border box size', () => {
    const instances = installObserver();
    const onSize = vi.fn();

    observeBlockSize(document.createElement('div'), onSize);
    instances[0]?.report([{}]);

    expect(onSize).not.toHaveBeenCalled();
  });

  it('ignores an entry with an empty border box size list', () => {
    const instances = installObserver();
    const onSize = vi.fn();

    observeBlockSize(document.createElement('div'), onSize);
    instances[0]?.report([{ borderBoxSize: [] }]);

    expect(onSize).not.toHaveBeenCalled();
  });

  it('ignores a report without entries', () => {
    const instances = installObserver();
    const onSize = vi.fn();

    observeBlockSize(document.createElement('div'), onSize);
    instances[0]?.report([]);

    expect(onSize).not.toHaveBeenCalled();
  });

  it('disconnects the observer when the returned function is called', () => {
    const instances = installObserver();

    const stop = observeBlockSize(document.createElement('div'), vi.fn());

    expect(instances[0]?.disconnect).not.toHaveBeenCalled();

    stop();

    expect(instances[0]?.disconnect).toHaveBeenCalledTimes(1);
  });
});
