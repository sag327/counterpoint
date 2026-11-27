// Protocol runner in a Web Worker, with a chunked main-thread fallback.
//
// createProtocolRunner({ workerUrl, WorkerClass, forceMainThread })
//   .run(world, protocol, { onProgress, signal }) -> Promise<result>
//   .mode -> 'worker' | 'main'
//   .terminate()
//
// The single-file build (scripts/build.mjs) inlines modules into a classic
// script, so this file must not use import.meta. The host passes workerUrl:
// a URL that loads this module as a module worker (for example
// new URL('./lab/worker.js', location.href) in a served build). Without one,
// or if the Worker fails to start, protocols run on the main thread in
// slices that yield to the event loop between engine steps.
//
// Message protocol (worker side, installed automatically inside a worker):
//   in:  { id, type: 'run', world, protocol } | { id, type: 'cancel' }
//   out: { id, type: 'progress', done, total } | { id, type: 'result', result } | { id, type: 'error', message }

import { runProtocol } from './protocols.js';

export function installProtocolWorker(scope) {
  const controllers = new Map();
  scope.addEventListener('message', ({ data }) => {
    if (data?.type === 'cancel') {
      controllers.get(data.id)?.abort();
      return;
    }
    if (data?.type !== 'run') return;
    const controller = new AbortController();
    controllers.set(data.id, controller);
    runProtocol(data.world, data.protocol, {
      signal: controller.signal,
      onProgress: ({ done, total }) => scope.postMessage({ id: data.id, type: 'progress', done, total }),
    }).then(
      result => scope.postMessage({ id: data.id, type: 'result', result }),
      error => scope.postMessage({ id: data.id, type: 'error', message: String(error?.message ?? error), name: error?.name ?? 'Error' }),
    ).finally(() => controllers.delete(data.id));
  });
}

const inWorker = typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope;
if (inWorker) installProtocolWorker(self);

export function supportsWorkers(WorkerClass = globalThis.Worker) {
  return typeof WorkerClass === 'function';
}

// workerType: 'module' for a served module URL; 'classic' for a bundled script
// (the single-file build loads its bundle from a Blob URL, and Chromium refuses
// module workers from Blob URLs on file:// pages).
export function createProtocolRunner({ workerUrl = null, workerType = 'module', WorkerClass = globalThis.Worker, forceMainThread = false, runOnMain = runProtocol } = {}) {
  let worker = null;
  let mode = 'main';
  let nextId = 1;
  const pending = new Map();

  function failAll(message) {
    for (const entry of pending.values()) entry.fallback(message);
    pending.clear();
  }

  if (!forceMainThread && workerUrl !== null && supportsWorkers(WorkerClass)) {
    try {
      worker = new WorkerClass(workerUrl, { type: workerType });
      mode = 'worker';
      worker.addEventListener('message', ({ data }) => {
        const entry = pending.get(data?.id);
        if (entry === undefined) return;
        if (data.type === 'progress') entry.onProgress?.({ done: data.done, total: data.total });
        else if (data.type === 'result') {
          pending.delete(data.id);
          entry.resolve(data.result);
        } else if (data.type === 'error') {
          pending.delete(data.id);
          const error = new Error(data.message);
          error.name = data.name;
          entry.reject(error);
        }
      });
      // A module worker that fails to load reports an error event: fall back for good.
      worker.addEventListener('error', event => {
        event.preventDefault?.();
        worker.terminate();
        worker = null;
        mode = 'main';
        failAll('worker failed');
      });
    } catch {
      worker = null;
      mode = 'main';
    }
  }

  function run(world, protocol, { onProgress = null, signal = null } = {}) {
    if (worker === null) return runOnMain(world, protocol, { onProgress, signal });
    return new Promise((resolve, reject) => {
      const id = nextId++;
      const fallback = () => runOnMain(world, protocol, { onProgress, signal }).then(resolve, reject);
      pending.set(id, { resolve, reject, onProgress, fallback });
      signal?.addEventListener('abort', () => {
        if (!pending.has(id)) return;
        pending.delete(id);
        worker?.postMessage({ id, type: 'cancel' });
        reject(new DOMException('Protocol cancelled', 'AbortError'));
      }, { once: true });
      worker.postMessage({ id, type: 'run', world, protocol });
    });
  }

  return {
    get mode() { return mode; },
    run,
    terminate() {
      worker?.terminate();
      worker = null;
      mode = 'main';
      for (const entry of pending.values()) entry.reject(new DOMException('Runner terminated', 'AbortError'));
      pending.clear();
    },
  };
}
