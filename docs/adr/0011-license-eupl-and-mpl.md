# EUPL-1.2 for ASYS, MPL-2.0 for the packages third parties build on

ASYS is open source under EUPL-1.2, which, like AGPL-3.0, applies its copyleft to offering the software as a service ("providing access to its essential functionalities"), and which lists GPL, AGPL, LGPL and MPL-2.0 as compatible; every dependency is MIT or Apache-2.0. The domain package and the contract package are MPL-2.0 instead, so third-party front-ends that bundle them keep their own license while changes to those files stay open, which ADR 0003's promise to other front-ends needs. Every file carries an SPDX license header, and contributions use a Developer Certificate of Origin while the author is the only copyright holder.

## Considered Options

- **AGPL-3.0**: the same network copyleft and better known; the fallback if EUPL proves too unfamiliar.
- **GPL-3.0**: rejected because it does not cover use as a hosted service.
- **LGPL-3.0 for the packages**: rejected because its relinking obligation is awkward for bundled JavaScript.
