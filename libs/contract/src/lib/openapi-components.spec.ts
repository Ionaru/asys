// SPDX-License-Identifier: MPL-2.0

import { OpenApi } from 'effect/http-api';
import { describe, expect, it } from 'vitest';
import { Api } from './api';

interface SchemaNode {
  readonly $ref?: string;
  readonly type?: string;
  readonly anyOf?: ReadonlyArray<SchemaNode>;
  readonly properties?: Record<string, SchemaNode>;
}

interface Operation {
  readonly requestBody?: {
    readonly content: Record<string, { readonly schema: SchemaNode }>;
  };
  readonly responses: Record<
    string,
    { readonly content?: Record<string, { readonly schema: SchemaNode }> }
  >;
}

interface Spec {
  readonly paths: Record<string, Record<string, Operation>>;
  readonly components: { readonly schemas: Record<string, SchemaNode> };
}

const spec = OpenApi.fromApi(Api) as unknown as Spec;

const schemas = spec.components.schemas;

const operation = (path: string, method: string): Operation => {
  const op = spec.paths[path]?.[method];

  if (op === undefined) {
    throw new Error(`missing ${method} ${path}`);
  }

  return op;
};

const responseSchema = (path: string, method: string, status: string) =>
  operation(path, method).responses[status]?.content?.['application/json']?.schema;

const requestSchema = (path: string, method: string) =>
  operation(path, method).requestBody?.content['application/json']?.schema;

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const commandMembers = [
  'CaptureTaskCommand',
  'TriageTaskCommand',
  'EditTaskCommand',
  'LogProgressCommand',
  'CompleteTaskCommand',
  'DropTaskCommand',
  'AddBlockerCommand',
  'RemoveBlockerCommand',
  'CreateAreaCommand',
  'UpdateAreaCommand',
  'SetTimeZoneCommand',
  'SetUrgencyWindowCommand',
  'ResolveReviewItemCommand',
];

const expectedNames = [
  'DateSpec',
  'MinuteInterval',
  'ActiveHours',
  'Task',
  'BlockerLink',
  'Area',
  'ReviewSubject',
  'ReviewItem',
  'Settings',
  'Changes',
  'Snapshot',
  'Meta',
  'ChangeEntry',
  'TaskPutEntry',
  'BlockerPutEntry',
  'BlockerRemoveEntry',
  'AreaPutEntry',
  'ReviewItemPutEntry',
  'SettingsPutEntry',
  'Command',
  'Expectation',
  'AreaExpectation',
  'TaskPatch',
  'AreaPatch',
  ...commandMembers,
  'CommandResult',
  'AppliedResult',
  'NotApplicableResult',
  'Me',
  'RecoveryCodes',
  'RecoverResult',
  'Health',
  'RegistrationResponse',
  'AuthenticationResponse',
  'PasskeyChallenge',
  'TaskKind',
  'TaskStatus',
  'Voice',
  'Privacy',
  'NotApplicableReason',
  'RejectedReason',
];

describe('OpenAPI component names', () => {
  it.each(expectedNames)('defines the named component %s', (name) => {
    expect(Object.keys(schemas)).toContain(name);
  });

  it('has no duplicated identifiers (no _N suffixes)', () => {
    expect(Object.keys(schemas).filter((key) => /_\d+$/.test(key))).toEqual([]);
  });

  it('references Snapshot from the snapshot response', () => {
    expect(responseSchema('/v1/snapshot', 'get', '200')).toEqual(ref('Snapshot'));
  });

  it('references Command and CommandResult from the commands endpoint', () => {
    expect(requestSchema('/v1/commands', 'post')).toEqual(ref('Command'));
    expect(responseSchema('/v1/commands', 'post', '200')).toEqual(ref('CommandResult'));
  });

  it('emits no allOf anywhere in the document', () => {
    expect(JSON.stringify(spec)).not.toContain('"allOf"');
  });

  it('types uuid-based id fields as string', () => {
    expect(schemas['Task']?.properties?.['id']?.type).toBe('string');
    expect(schemas['BlockerLink']?.properties?.['taskId']?.type).toBe('string');
  });

  it('models Command as a union of its 13 named members', () => {
    expect(schemas['Command']?.anyOf).toHaveLength(13);
    const refs = (schemas['Command']?.anyOf ?? []).map((node) => node.$ref).sort();

    expect(refs).toEqual(commandMembers.map((name) => ref(name).$ref).sort());
  });

  it('models CommandResult as a union of AppliedResult and NotApplicableResult', () => {
    const anyOf = schemas['CommandResult']?.anyOf ?? [];

    expect(anyOf).toHaveLength(2);
    expect(anyOf).toEqual(
      expect.arrayContaining([ref('AppliedResult'), ref('NotApplicableResult')]),
    );
  });
});
