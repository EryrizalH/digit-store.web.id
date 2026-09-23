import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getFocusableElements,
  getInitialFocusTarget,
  handleTabKey,
  setupFocusTrap,
} from '../src/hooks/useFocusTrap';

class MockElement {
  id: string;
  tagName: string;
  attributes: Record<string, string> = {};
  style: Record<string, string> = {};
  isConnected = true;
  children: MockElement[] = [];
  focusSpy = vi.fn();

  constructor(tagName: string, id: string = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
  }

  setAttribute(name: string, value: string) {
    this.attributes[name.toLowerCase()] = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name.toLowerCase()] ?? null;
  }

  hasAttribute(name: string): boolean {
    return name.toLowerCase() in this.attributes;
  }

  focus() {
    this.focusSpy();
    if (globalThis.document) {
      (globalThis.document as any).activeElement = this;
    }
  }

  contains(other: any): boolean {
    if (other === this) return true;
    for (const child of this.children) {
      if (child.contains(other)) return true;
    }
    return false;
  }

  querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    const check = (el: MockElement) => {
      // ponytail: minimal selector matching for unit testing focus trap targets
      const tag = el.tagName.toLowerCase();
      const isButton = tag === 'button';
      const isInput = tag === 'input';
      const hasHref = el.hasAttribute('href');
      const hasTabIndex = el.hasAttribute('tabindex');

      if (isButton || isInput || hasHref || hasTabIndex) {
        results.push(el);
      }
      for (const child of el.children) {
        check(child);
      }
    };

    for (const child of this.children) {
      check(child);
    }
    return results;
  }
}

describe('Focus Trap Pattern (FINDING-010)', () => {
  let originalWindow: any;
  let originalDocument: any;
  let windowListeners: Record<string, ((e: any) => void)[]> = {};

  beforeEach(() => {
    originalWindow = globalThis.window;
    originalDocument = globalThis.document;
    windowListeners = {};

    const mockBody = new MockElement('body', 'body');
    const mockDoc = {
      body: mockBody,
      activeElement: mockBody,
      contains: (el: any) => Boolean(el?.isConnected),
    };

    const mockWin = {
      addEventListener: vi.fn((event: string, handler: (e: any) => void) => {
        windowListeners[event] = windowListeners[event] || [];
        windowListeners[event].push(handler);
      }),
      removeEventListener: vi.fn((event: string, handler: (e: any) => void) => {
        if (!windowListeners[event]) return;
        windowListeners[event] = windowListeners[event].filter((h) => h !== handler);
      }),
    };

    (globalThis as any).window = mockWin;
    (globalThis as any).document = mockDoc;
  });

  afterEach(() => {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
  });

  it('identifies focusable elements and excludes disabled or hidden controls', () => {
    const container = new MockElement('div', 'dialog-root');
    const closeBtn = new MockElement('button', 'close-btn');
    closeBtn.setAttribute('aria-label', 'Tutup dialog');

    const inputEmail = new MockElement('input', 'email');
    const disabledBtn = new MockElement('button', 'disabled-btn');
    disabledBtn.setAttribute('disabled', '');

    const hiddenInput = new MockElement('input', 'hidden-input');
    hiddenInput.setAttribute('aria-hidden', 'true');

    container.children = [closeBtn, inputEmail, disabledBtn, hiddenInput];

    const focusable = getFocusableElements(container as any);
    expect(focusable.map((el) => (el as any).id)).toEqual(['close-btn', 'email']);
  });

  it('prefers close button with aria-label containing "tutup" or "close"', () => {
    const container = new MockElement('div', 'dialog-root');
    const submitBtn = new MockElement('button', 'submit-btn');
    const closeBtn = new MockElement('button', 'close-btn');
    closeBtn.setAttribute('aria-label', 'Tutup keranjang belanja');

    container.children = [submitBtn, closeBtn];
    const focusable = [submitBtn, closeBtn] as any[];

    const target = getInitialFocusTarget(container as any, focusable);
    expect((target as any).id).toBe('close-btn');
  });

  it('falls back to first focusable element when no close button is present', () => {
    const container = new MockElement('div', 'dialog-root');
    const firstInput = new MockElement('input', 'first-input');
    const secondInput = new MockElement('input', 'second-input');

    container.children = [firstInput, secondInput];
    const focusable = [firstInput, secondInput] as any[];

    const target = getInitialFocusTarget(container as any, focusable);
    expect((target as any).id).toBe('first-input');
  });

  it('cycles Tab forward from last element to first element', () => {
    const container = new MockElement('div', 'dialog-root');
    const firstBtn = new MockElement('button', 'first-btn');
    const lastBtn = new MockElement('button', 'last-btn');
    container.children = [firstBtn, lastBtn];

    // Simulate active element is currently the last element
    (globalThis.document as any).activeElement = lastBtn;

    const preventDefaultSpy = vi.fn();
    const event = {
      key: 'Tab',
      shiftKey: false,
      preventDefault: preventDefaultSpy,
    } as any;

    handleTabKey(event, container as any);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(firstBtn.focusSpy).toHaveBeenCalled();
    expect((globalThis.document as any).activeElement).toBe(firstBtn);
  });

  it('cycles Shift+Tab backward from first element to last element', () => {
    const container = new MockElement('div', 'dialog-root');
    const firstBtn = new MockElement('button', 'first-btn');
    const lastBtn = new MockElement('button', 'last-btn');
    container.children = [firstBtn, lastBtn];

    // Simulate active element is currently the first element
    (globalThis.document as any).activeElement = firstBtn;

    const preventDefaultSpy = vi.fn();
    const event = {
      key: 'Tab',
      shiftKey: true,
      preventDefault: preventDefaultSpy,
    } as any;

    handleTabKey(event, container as any);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(lastBtn.focusSpy).toHaveBeenCalled();
    expect((globalThis.document as any).activeElement).toBe(lastBtn);
  });

  it('captures previous active element on open and restores it on teardown', () => {
    const triggerBtn = new MockElement('button', 'open-modal-trigger');
    (globalThis.document as any).activeElement = triggerBtn;

    const container = new MockElement('div', 'dialog-root');
    const closeBtn = new MockElement('button', 'close-btn');
    closeBtn.setAttribute('aria-label', 'Tutup dialog autentikasi');
    container.children = [closeBtn];

    const onClose = vi.fn();
    const teardown = setupFocusTrap(container as any, { onClose });

    // Focus should have moved to close button upon setup
    expect(closeBtn.focusSpy).toHaveBeenCalled();
    expect((globalThis.document as any).activeElement).toBe(closeBtn);

    // Call teardown (simulate dialog close/unmount)
    teardown();

    // Trigger button should have focus restored
    expect(triggerBtn.focusSpy).toHaveBeenCalled();
    expect((globalThis.document as any).activeElement).toBe(triggerBtn);
  });

  it('handles Escape key by invoking onClose callback', () => {
    const container = new MockElement('div', 'dialog-root');
    const closeBtn = new MockElement('button', 'close-btn');
    closeBtn.setAttribute('aria-label', 'Tutup dialog');
    container.children = [closeBtn];

    const onClose = vi.fn();
    setupFocusTrap(container as any, { onClose });

    const escapeHandlers = windowListeners['keydown'] || [];
    expect(escapeHandlers.length).toBeGreaterThan(0);

    const preventDefaultSpy = vi.fn();
    const stopPropagationSpy = vi.fn();
    escapeHandlers[0]({
      key: 'Escape',
      preventDefault: preventDefaultSpy,
      stopPropagation: stopPropagationSpy,
    });

    expect(onClose).toHaveBeenCalled();
    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(stopPropagationSpy).toHaveBeenCalled();
  });
});
