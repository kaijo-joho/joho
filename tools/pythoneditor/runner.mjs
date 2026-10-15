import { LIMITS } from './core.mjs';

// Workerを捨てればSharedArrayBufferがない環境でも確実に停止できる。
export class PythonRunner {
  constructor(onEvent, options = {}) {
    this.onEvent = onEvent;
    this.makeWorker = options.makeWorker || (() => new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' }));
    this.runMs = options.runMs || LIMITS.runMs;
    this.generation = 0;
    this.worker = null;
    this.active = false;
  }
  run(request) {
    if (this.active) throw new Error('実行中です。停止してから再実行してください。');
    this.active = true;
    const generation = ++this.generation;
    try {
      this.worker ||= this.makeWorker();
      this.inputBuffer = typeof WebAssembly.Suspending !== 'function' && globalThis.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined' ? new SharedArrayBuffer(65536) : null;
      this.worker.onmessage = ({ data }) => {
        if (!this.active || generation !== this.generation || data.generation !== generation) return;
        if (['done', 'error'].includes(data.type)) {
          this.active = false;
          clearTimeout(this.timer);
          this.waiting = false;
        }
        if (data.type === 'input') { this.waiting = true; this.inputId = data.inputId; this.pauseClock(); }
        this.onEvent(data);
      };
      this.worker.onerror = () => this.fail('Pythonの実行環境を読み込めませんでした。通信を確認して再実行してください。', generation);
      this.remainingMs = this.runMs;
      this.resumeClock();
      this.worker.postMessage({ ...request, type: 'run', generation, inputBuffer: this.inputBuffer });
      this.onEvent({ type: 'status', generation, text: 'Pythonを準備しています…' });
    } catch (e) { this.fail(String(e.message || e), generation); }
    return generation;
  }
  pauseClock() {
    clearTimeout(this.timer);
    this.remainingMs = Math.max(0, this.remainingMs - (performance.now() - this.startedAt));
  }
  resumeClock() {
    this.startedAt = performance.now();
    this.timer = setTimeout(() => this.stop('実行時間の上限で停止しました。'), this.remainingMs);
  }
  fail(message, generation) {
    this.dispose();
    this.onEvent({ type: 'error', generation, error: message });
  }
  input(value, eof = false) {
    if (!this.active || !this.waiting) return false;
    if (typeof value !== 'string' || value.length > LIMITS.code) throw new Error('入力が長すぎます。');
    if (!this.inputBuffer) {
      this.worker.postMessage({ type: 'input', generation: this.generation, inputId: this.inputId, value, eof });
      this.waiting = false;
      this.resumeClock();
      return true;
    }
    const bytes = new TextEncoder().encode(value);
    if (bytes.length > this.inputBuffer.byteLength - 8) throw new Error('入力が長すぎます。');
    const control = new Int32Array(this.inputBuffer, 0, 2);
    new Uint8Array(this.inputBuffer, 8).set(bytes);
    Atomics.store(control, 1, bytes.length);
    Atomics.store(control, 0, eof ? 2 : 1);
    Atomics.notify(control, 0);
    this.waiting = false;
    this.resumeClock();
    return true;
  }
  stop(reason = '実行を停止しました。') {
    const generation = this.generation;
    this.dispose();
    ++this.generation;
    this.onEvent({ type: 'stopped', generation, text: reason });
  }
  dispose() {
    clearTimeout(this.timer);
    this.worker?.terminate();
    this.worker = null;
    this.active = false;
    this.waiting = false;
    this.inputBuffer = null;
    this.inputId = null;
  }
}
