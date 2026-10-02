// SPDX-License-Identifier: EUPL-1.2
import { createHash } from 'node:crypto';
import type { CommandRequest } from '@asys/contract';
import { CommandTag } from '@asys/domain';
import { assert, describe, it } from '@effect/vitest';
import { canonicalJson, requestHash } from './request-hash';

const key = '0a1b2c3d-0000-4000-8000-000000000001';
const taskId = '0a1b2c3d-0000-4000-8000-000000000002';
const otherTaskId = '0a1b2c3d-0000-4000-8000-000000000003';

const complete = (id: string): CommandRequest => ({
  _tag: CommandTag.CompleteTask,
  idempotencyKey: key,
  taskId: id,
});

describe('canonicalJson', () => {
  it('sorts object keys recursively, keeps array order and writes no whitespace', () => {
    assert.strictEqual(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] }), '{"a":[{"c":3,"d":2}],"b":1}');
  });
});

describe('requestHash', () => {
  it('is the lowercase hex SHA-256 of the canonical encoded request', () => {
    const expected = createHash('sha256')
      .update(`{"_tag":"CompleteTask","idempotencyKey":"${key}","taskId":"${taskId}"}`)
      .digest('hex');

    assert.strictEqual(requestHash(complete(taskId)), expected);
  });

  it('does not depend on the insertion order of the keys', () => {
    const reordered: CommandRequest = {
      taskId,
      idempotencyKey: key,
      _tag: CommandTag.CompleteTask,
    };

    assert.strictEqual(requestHash(reordered), requestHash(complete(taskId)));
  });

  it('differs when only the taskId differs', () => {
    assert.notStrictEqual(requestHash(complete(otherTaskId)), requestHash(complete(taskId)));
  });

  it('differs when only the patch title differs in an EditTask', () => {
    const edit = (title: string): CommandRequest => ({
      _tag: CommandTag.EditTask,
      idempotencyKey: key,
      taskId,
      patch: { title },
    });

    assert.notStrictEqual(requestHash(edit('a')), requestHash(edit('b')));
  });

  it('differs when only the expected version differs in an EditTask', () => {
    const edit = (version: number): CommandRequest => ({
      _tag: CommandTag.EditTask,
      idempotencyKey: key,
      taskId,
      patch: { title: 'a' },
      expect: { version },
    });

    assert.notStrictEqual(requestHash(edit(1)), requestHash(edit(2)));
  });
});
