import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach } from "vitest";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/** A fresh React root per test (needs `// @vitest-environment happy-dom`). Read it inside tests. */
export function mountEachTest() {
  const dom = {} as { host: HTMLDivElement; root: Root };
  beforeEach(() => {
    dom.host = document.createElement("div");
    document.body.append(dom.host);
    dom.root = createRoot(dom.host);
  });
  afterEach(async () => {
    await act(async () => dom.root.unmount());
    dom.host.remove();
  });
  return dom;
}

/** A promise resolved from the test, to hold a response in flight. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
