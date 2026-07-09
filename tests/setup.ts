// ponytail: polyfill browser globals for Node test environment
export {};

// Delegate to globalThis so Jest fake timers can intercept
(globalThis as Record<string, unknown>).window = {
    get setTimeout() { return globalThis.setTimeout; },
    get clearTimeout() { return globalThis.clearTimeout; },
    get requestAnimationFrame() { return (cb: FrameRequestCallback) => globalThis.setTimeout(cb, 16); },
    get document() { return (globalThis as Record<string, unknown>).document ?? {}; },
};

// DOM class stubs for instanceof checks in Node
class StubHTMLElement {}
class StubHTMLAnchorElement extends StubHTMLElement {}
(globalThis as Record<string, unknown>).HTMLElement = StubHTMLElement;
(globalThis as Record<string, unknown>).HTMLAnchorElement = StubHTMLAnchorElement;
