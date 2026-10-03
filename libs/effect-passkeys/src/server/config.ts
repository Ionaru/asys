// SPDX-License-Identifier: MIT

import { Context, Layer } from 'effect';

/** The relying party settings the ceremonies run with. */
export interface PasskeyConfigValues {
  /** The relying party id, for example `localhost` or `asys.example.com`. */
  readonly rpId: string;
  /** The relying party name, shown by authenticators. */
  readonly rpName: string;
  /** The exact expected origin, for example `http://localhost:4200`. */
  readonly origin: string;
  /** Refuse to remove a user's only passkey. */
  readonly keepLastPasskey: boolean;
  /** The name of a passkey that is created without one. */
  readonly defaultPasskeyName: string;
}

/** The host's passkey settings. */
export class PasskeyConfig extends Context.Service<PasskeyConfig, PasskeyConfigValues>()(
  'effect-passkeys/PasskeyConfig',
) {
  /** Provides the given settings. */
  static readonly layer = (values: PasskeyConfigValues): Layer.Layer<PasskeyConfig> =>
    Layer.succeed(PasskeyConfig)(values);
}
