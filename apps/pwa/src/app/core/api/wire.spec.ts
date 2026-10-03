// SPDX-License-Identifier: EUPL-1.2
import { Privacy, TaskStatus, type Task } from '@asys/domain';

import type * as Gen from '../../../generated/api';
import { SHAPES, fromWire, toWire, type Equals, type Wire } from './wire';

enum Colour {
  Red = 'red',
  Blue = 'blue',
}

describe('SHAPES', () => {
  it('proves every generated shape identical to its domain shape', () => {
    expect(Object.keys(SHAPES).sort()).toEqual(
      [
        'area',
        'blockerLink',
        'changeEntry',
        'command',
        'commandResult',
        'me',
        'reviewItem',
        'settings',
        'snapshot',
        'task',
      ].sort(),
    );

    for (const [name, proven] of Object.entries(SHAPES)) {
      expect({ name, proven }).toEqual({ name, proven: true });
    }
  });
});

describe('Wire', () => {
  it('turns string enum members into their literal values', () => {
    const same: Equals<Wire<{ c: Colour }>, { c: 'red' | 'blue' }> = true;

    expect(same).toBe(true);
  });

  it('drops readonly from properties, arrays and tuples', () => {
    const properties: Equals<Wire<{ readonly a: readonly string[] }>, { a: string[] }> = true;
    const tuples: Equals<Wire<readonly [number, number]>, [number, number]> = true;

    expect([properties, tuples]).toEqual([true, true]);
  });

  it('turns any into unknown and keeps null, optional and numbers', () => {
    const anyField: Equals<Wire<{ a: ReturnType<typeof JSON.parse> }>, { a: unknown }> = true;
    const nullable: Equals<Wire<{ a: number | null }>, { a: number | null }> = true;
    const optional: Equals<Wire<{ a?: boolean }>, { a?: boolean }> = true;

    expect([anyField, nullable, optional]).toEqual([true, true, true]);
  });

  it('recurses into nested objects and arrays and distributes unions', () => {
    const nested: Equals<
      Wire<{ readonly list: readonly { readonly s: Colour | null }[] }>,
      { list: { s: 'red' | 'blue' | null }[] }
    > = true;

    expect(nested).toBe(true);
  });

  it('matches a generated model with its domain counterpart', () => {
    const task: Equals<Wire<Gen.Task>, Wire<Task>> = true;

    expect(task).toBe(true);
  });
});

describe('drift detection', () => {
  it('reports an extra field', () => {
    // @ts-expect-error: the second type has a field the first lacks
    const drift: Equals<Wire<{ a: string }>, Wire<{ a: string; b: number }>> = true;
    // @ts-expect-error: a generated model with an extra domain field is not identical
    const model: Equals<Wire<Gen.Task>, Wire<Task & { extra: number }>> = true;

    expect([drift, model]).toEqual([true, true]);
  });

  it('reports a missing field', () => {
    // @ts-expect-error: the second type lacks a field the first has
    const drift: Equals<Wire<{ a: string; b: number }>, Wire<{ a: string }>> = true;
    // @ts-expect-error: a generated model missing a domain field is not identical
    const model: Equals<Wire<Gen.Task>, Wire<Omit<Task, 'notes'>>> = true;

    expect([drift, model]).toEqual([true, true]);
  });

  it('reports a widened enum', () => {
    // @ts-expect-error: the generated side accepts a value the enum does not
    const drift: Equals<Wire<{ c: 'red' | 'blue' | 'green' }>, Wire<{ c: Colour }>> = true;
    // @ts-expect-error: a status widened to any string is not the TaskStatus enum
    const model: Equals<Wire<Gen.Task>, Wire<Omit<Task, 'status'> & { status: string }>> = true;

    expect([drift, model]).toEqual([true, true]);
  });

  it('reports optional versus required', () => {
    // @ts-expect-error: an optional property differs from a required one
    const drift: Equals<Wire<{ a?: string }>, Wire<{ a: string }>> = true;
    // @ts-expect-error: a required domain property made optional is not identical
    const model: Equals<Wire<Gen.Task>, Wire<Omit<Task, 'notes'> & { notes?: string }>> = true;

    expect([drift, model]).toEqual([true, true]);
  });

  it('reports nullable versus non-null', () => {
    // @ts-expect-error: a nullable property differs from a non-null one
    const drift: Equals<Wire<{ a: string | null }>, Wire<{ a: string }>> = true;
    // @ts-expect-error: a nullable domain property made non-null is not identical
    const model: Equals<Wire<Gen.Task>, Wire<Omit<Task, 'closedAt'> & { closedAt: number }>> = true;

    expect([drift, model]).toEqual([true, true]);
  });
});

describe('conversion helpers', () => {
  const generated: Gen.Task = {
    id: 't1',
    kind: 'task',
    status: 'open',
    title: 'Write tests',
    notes: '',
    captureText: 'write tests',
    areaId: null,
    availableFrom: null,
    due: null,
    estimateMinutes: null,
    important: null,
    voice: null,
    privacy: 'hidden',
    dueMoveCount: 0,
    version: 1,
    createdAt: 100,
    closedAt: null,
  };

  it('fromWire returns the same value as the domain type', () => {
    const task: Task = fromWire<Task>(generated);

    expect(task.status).toBe(TaskStatus.Open);
    expect(task.privacy).toBe(Privacy.Hidden);
    expect(task).toEqual(generated);
  });

  it('toWire returns the same value as the generated request type', () => {
    const domain = fromWire<Task>(generated);
    const wire: Gen.Task = toWire(domain);

    expect(wire).toEqual(generated);
  });
});
