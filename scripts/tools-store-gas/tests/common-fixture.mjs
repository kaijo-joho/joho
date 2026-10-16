import { createHash, createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export function fakeUtilities() {
  return {
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'UTF-8' },
    computeDigest: (_algorithm, text) => [...createHash('sha256').update(text, 'utf8').digest()],
    computeHmacSha256Signature: (text, key) => [...createHmac('sha256', key).update(text, 'utf8').digest()],
    base64EncodeWebSafe: value => (typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value)).toString('base64url'),
    base64DecodeWebSafe: value => [...Buffer.from(value, 'base64url')],
    newBlob: value => ({ getDataAsString: () => Buffer.from(value).toString('utf8'), getBytes: () => [...Buffer.from(value)] }),
    getUuid: () => randomBytes(16).toString('hex')
  };
}

export function loadCommon(extra = {}) {
  const context = vm.createContext({ Utilities: fakeUtilities(), ...extra });
  vm.runInContext(readFileSync(new URL('../common/05_tools_store_contract.js', import.meta.url), 'utf8'), context);
  return { context, contract: context.ToolsStoreContract };
}

export function loadStore(extra = {}) {
  const loaded = loadCommon(extra);
  vm.runInContext(readFileSync(new URL('../common/06_tools_confirmation_contract.js', import.meta.url), 'utf8'), loaded.context);
  for (const name of ['01_tools_store_config.js', '40_tools_store_repository.js', '41_confirmation_repository.js', '10_tools_store_api.js']) {
    vm.runInContext(readFileSync(new URL('../store/' + name, import.meta.url), 'utf8'), loaded.context);
  }
  return loaded;
}
