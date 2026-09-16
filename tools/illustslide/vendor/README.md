# illustSlide vendor files

The editor serves these fixed copies from the same site. It does not fetch code from a CDN at runtime.

| file | version | source | license | SHA-256 |
| --- | --- | --- | --- | --- |
| `paper-core-0.12.18.min.js` | Paper.js 0.12.18 | https://www.npmjs.com/package/paper/v/0.12.18 | MIT | `3a8c73ecdf3929a7fe05f96b82e8146193ea449c5c3e889c5f4fe0184a30ed96` |
| `fflate-0.8.2.umd.js` | fflate 0.8.2 | https://www.npmjs.com/package/fflate/v/0.8.2 | MIT | `c3b34f2e9f5e74d4d7d64e01cac7a0c01954c6c406414d42185c7b53d6875ddf` |
| `opentype-1.3.4.min.js` | opentype.js 1.3.4 | https://www.npmjs.com/package/opentype.js/v/1.3.4 | MIT | `c0f9c7ca85e18075a8819e5fe2dee6e1d535f9a2269f5314f36cce94a183adba` |

The checked-in copies were obtained from the fixed npm package URLs above via
unpkg.  Paper.js is used only for geometry calculation; fflate creates the
portable project ZIP. opentype.js parses the bundled Japanese fonts and extracts glyph outlines.

The complete license notices are included as `PAPER-LICENSE.txt` and
`FFLATE-LICENSE.txt` and `OPENTYPE-LICENSE.txt`; the distributions also retain their license headers.

The Japanese conversion fonts are Noto Sans JP 2.004 and Noto Serif JP 2.003 (SIL Open Font License 1.1). Their sources, copyright notices, lossless WOFF conversion, SHA-256 hashes and complete licenses are recorded in [fonts/README.md](../fonts/README.md). Only the selected typeface is loaded, on demand, from the same site. Generated outline paths need no font at playback.
