<!-- SPDX-License-Identifier: EUPL-1.2 -->
# EUPL-1.2 for ASYS, MPL-2.0 for the packages third parties build on

ASYS is open source under EUPL-1.2, which, like AGPL-3.0, applies its copyleft to offering the software as a service ("providing access to its essential functionalities"), and which lists GPL, AGPL, LGPL and MPL-2.0 as compatible; every production dependency carries a permissive licence (MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC or 0BSD), which a licence allowlist check over `pnpm licenses list --prod` enforces in CI; build and development tools are not covered. The domain package and the contract package are MPL-2.0 instead, so third-party front-ends that bundle them keep their own license while changes to those files stay open, which ADR 0003's promise to other front-ends needs. The passkey library `libs/effect-passkeys` (`@ionaru/effect-passkeys`) is MIT: it is a general library meant for other projects as well, like its sibling fresh-passkeys. Every file with comment syntax carries an SPDX license identifier line, and the repository follows the REUSE 3.3 specification: a root `REUSE.toml` gives every file its copyright notice and gives files without comment syntax their licence. Contributions use a Developer Certificate of Origin while the author is the only copyright holder.

## Considered Options

- **AGPL-3.0**: the same network copyleft and better known; the fallback if EUPL proves too unfamiliar.
- **GPL-3.0**: rejected because it does not cover use as a hosted service.
- **LGPL-3.0 for the packages**: rejected because its relinking obligation is awkward for bundled JavaScript.
