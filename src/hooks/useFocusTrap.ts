import { useEffect, useRef } from 'react';

// ponytail: minimal selector for standard interactive elements without external dependencies
export const FOCUSABLE_SELECTOR = [
  'button:not([disabled]):not([tabindex="-1"])',
  '[href]:not([tabindex="-1"])',
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"]):not([disabled])',
].join(', ');

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const elements = Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  );
  return elements.filter((el) => {
    if (el.hasAttribute('disabled')) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    if (el.style && (el.style.display === 'none' || el.style.visibility === 'hidden')) return false;
    return true;
  });
}

export function getInitialFocusTarget(container: HTMLElement, focusable: HTMLElement[]): HTMLElement {
  // Prefer close button (aria-label containing "tutup" or "close") or first focusable control
  const closeBtn = focusable.find((el) => {
    const label = (el.getAttribute('aria-label') || '').toLowerCase();
    return label.includes('tutup') || label.includes('close');
  });
  return closeBtn || focusable[0] || container;
}

export function handleTabKey(e: KeyboardEvent, container: HTMLElement) {
  const focusable = getFocusableElements(container);
  if (focusable.length === 0) {
    e.preventDefault();
    container.focus();
    return;
  }

  const firstElement = focusable[0];
  const lastElement = focusable[focusable.length - 1];
  const activeEl = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
  const isInsideFocusable = activeEl ? focusable.includes(activeEl) : false;

  if (e.shiftKey) {
    // Shift + Tab: if on first focusable element or outside the focusable list, cycle to last
    if (activeEl === firstElement || !isInsideFocusable) {
      e.preventDefault();
      lastElement.focus();
    }
  } else {
    // Tab: if on last focusable element or outside the focusable list, cycle to first
    if (activeEl === lastElement || !isInsideFocusable) {
      e.preventDefault();
      firstElement.focus();
    }
  }
}

export interface FocusTrapOptions {
  onClose?: () => void;
}

export function setupFocusTrap(container: HTMLElement, options: FocusTrapOptions = {}) {
  // Capture element focused before opening the dialog
  const previousActiveElement =
    typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;

  // Move focus into the dialog (prefer close button or first focusable control)
  const focusable = getFocusableElements(container);
  const targetToFocus = getInitialFocusTarget(container, focusable);
  if (targetToFocus && typeof targetToFocus.focus === 'function') {
    targetToFocus.focus();
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (options.onClose) {
        e.preventDefault();
        e.stopPropagation();
        options.onClose();
      }
      return;
    }

    if (e.key === 'Tab') {
      handleTabKey(e, container);
    }
  };

  const targetWindow = typeof window !== 'undefined' ? window : null;
  targetWindow?.addEventListener('keydown', handleKeyDown);

  return () => {
    targetWindow?.removeEventListener('keydown', handleKeyDown);
    // Restore focus on close / unmount
    if (
      previousActiveElement &&
      previousActiveElement !== (typeof document !== 'undefined' ? document.body : null) &&
      typeof previousActiveElement.focus === 'function' &&
      (previousActiveElement.isConnected ??
        (typeof document !== 'undefined' ? document.contains(previousActiveElement) : true))
    ) {
      previousActiveElement.focus();
    }
  };
}

/**
 * Lightweight React focus-trap hook for modal dialogs and drawers.
 * Traps Tab/Shift+Tab navigation, captures and restores focus, and handles Escape.
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
  isActive: boolean,
  onClose?: () => void
) {
  const containerRef = useRef<T>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isActive || !containerRef.current) return;
    return setupFocusTrap(containerRef.current, {
      onClose: () => onCloseRef.current?.(),
    });
  }, [isActive]);

  return containerRef;
}
