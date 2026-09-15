# Ilapo vendor files

The editor loads these files locally.  It does not fetch a library at runtime.

| file | version | source | license | SHA-256 |
| --- | --- | --- | --- | --- |
| `paper-core-0.12.18.min.js` | Paper.js 0.12.18 | https://www.npmjs.com/package/paper/v/0.12.18 | MIT | `3a8c73ecdf3929a7fe05f96b82e8146193ea449c5c3e889c5f4fe0184a30ed96` |
| `fflate-0.8.2.umd.js` | fflate 0.8.2 | https://www.npmjs.com/package/fflate/v/0.8.2 | MIT | `c3b34f2e9f5e74d4d7d64e01cac7a0c01954c6c406414d42185c7b53d6875ddf` |

The checked-in copies were obtained from the fixed npm package URLs above via
unpkg.  Paper.js is used only for geometry calculation; fflate creates the
portable project ZIP.

The complete license notices are included as `PAPER-LICENSE.txt` and
`FFLATE-LICENSE.txt`; both minified distributions also retain their headers.
