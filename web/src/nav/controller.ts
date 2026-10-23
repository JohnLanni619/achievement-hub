import { pickNext, type Direction } from "./spatial";

/**
 * Controller / D-pad navigation for handhelds (e.g. AYN Thor) and TVs.
 *
 * - D-pad, left stick, or arrow keys move focus to the nearest item in that direction
 * - A (or Enter) activates, B goes back, LB/RB scroll a page
 *
 * Input arrives two ways: the Gamepad API, and arrow-key events that Android
 * synthesizes from D-pad presses. A device may produce both for one press,
 * so moves from the second source within a short window are dropped.
 */

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const TEXT_INPUT = "input:not([type=checkbox]):not([type=radio]):not([type=button]), textarea";

// Standard Gamepad mapping (https://w3c.github.io/gamepad/#remapping)
const BUTTON = { A: 0, B: 1, LB: 4, RB: 5, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;
const STICK_THRESHOLD = 0.5;
const REPEAT_DELAY_MS = 350;
const REPEAT_INTERVAL_MS = 110;
const DUPLICATE_WINDOW_MS = 80;

export type NavMode = "pointer" | "pad";
type Listener = (mode: NavMode) => void;

let mode: NavMode = "pointer";
const listeners = new Set<Listener>();

export function getNavMode() {
  return mode;
}

export function onNavModeChange(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setMode(next: NavMode) {
  if (mode === next) return;
  mode = next;
  document.documentElement.dataset.nav = next;
  listeners.forEach((l) => l(next));
}

function isVisible(el: HTMLElement) {
  if (el.closest("[aria-hidden=true], [inert]")) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== "hidden";
}

function focusables(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(isVisible);
}

function focusElement(el: HTMLElement) {
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
}

function hasUsableFocus(): HTMLElement | null {
  const el = document.activeElement as HTMLElement | null;
  return el && el !== document.body && el.matches(FOCUSABLE) && isVisible(el) ? el : null;
}

/** First item in the main content, so the header isn't the starting point. */
function focusFirst() {
  const inMain = [...document.querySelectorAll<HTMLElement>(`main :is(${FOCUSABLE})`)].filter(isVisible);
  const viewportTop = inMain.find((el) => el.getBoundingClientRect().bottom > 0) ?? inMain[0] ?? focusables()[0];
  if (viewportTop) focusElement(viewportTop);
}

const lastMove: Record<string, { at: number; source: string }> = {};
function isDuplicate(key: string, source: string) {
  const now = performance.now();
  const prev = lastMove[key];
  lastMove[key] = { at: now, source };
  return prev !== undefined && prev.source !== source && now - prev.at < DUPLICATE_WINDOW_MS;
}

export function move(dir: Direction, source = "api") {
  if (isDuplicate(dir, source)) return;
  setMode("pad");
  const current = hasUsableFocus();
  if (!current) return focusFirst();

  const items = focusables().filter((el) => el !== current);
  const index = pickNext(
    current.getBoundingClientRect(),
    items.map((el) => el.getBoundingClientRect()),
    dir,
  );
  if (index >= 0) {
    focusElement(items[index]);
  } else if (dir === "up" || dir === "down") {
    // Nothing further that way: scroll to reveal anything non-focusable.
    window.scrollBy({ top: (dir === "down" ? 1 : -1) * window.innerHeight * 0.5, behavior: "smooth" });
  }
}

function activate(source: string) {
  if (isDuplicate("activate", source)) return;
  setMode("pad");
  const current = hasUsableFocus();
  if (!current) return focusFirst();
  if (current.matches(TEXT_INPUT)) {
    // Re-focusing brings up the on-screen keyboard.
    current.blur();
    current.focus();
  } else if (current instanceof HTMLSelectElement) {
    current.showPicker?.();
  } else {
    current.click();
  }
}

let lastPopState = -Infinity;

function back(source: string) {
  if (isDuplicate("back", source)) return;
  setMode("pad");
  const current = hasUsableFocus();
  // B first leaves a text field (dismissing the keyboard), then navigates back.
  if (current?.matches(TEXT_INPUT)) return current.blur();
  // Android may also turn an unhandled B press into a system Back. Wait
  // briefly and skip ours if a native back navigation already happened.
  const pressedAt = performance.now();
  window.setTimeout(() => {
    if (lastPopState >= pressedAt - DUPLICATE_WINDOW_MS) return;
    if (window.location.pathname !== "/") window.history.back();
  }, DUPLICATE_WINDOW_MS * 2);
}

function scrollPage(dir: 1 | -1) {
  setMode("pad");
  window.scrollBy({ top: dir * window.innerHeight * 0.8, behavior: "smooth" });
  // Keep focus on something visible after the jump.
  window.setTimeout(() => {
    const current = hasUsableFocus();
    const rect = current?.getBoundingClientRect();
    if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) focusFirst();
  }, 400);
}

const ARROWS: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

function onKeyDown(e: KeyboardEvent) {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const dir = ARROWS[e.key];
  const target = e.target as HTMLElement;
  if (dir) {
    // Let text fields keep left/right for moving the caret.
    if (target.matches?.(TEXT_INPUT) && (dir === "left" || dir === "right")) return;
    e.preventDefault();
    move(dir, "key");
  } else if (e.key === "Enter" && isDuplicate("activate", "key")) {
    // The gamepad's A already handled this press.
    e.preventDefault();
  }
}

// Gamepad polling. Runs only while a controller is connected.
const held = new Map<string, number>(); // control -> time it should next fire
let polling = false;

function pressed(pad: Gamepad, button: number) {
  return Boolean(pad.buttons[button]?.pressed);
}

function poll() {
  const pads = navigator.getGamepads?.().filter((p): p is Gamepad => Boolean(p)) ?? [];
  if (!pads.length) {
    polling = false;
    held.clear();
    return;
  }
  const now = performance.now();
  const active = new Set<string>();
  for (const pad of pads) {
    const [x = 0, y = 0] = pad.axes;
    if (pressed(pad, BUTTON.UP) || y < -STICK_THRESHOLD) active.add("up");
    if (pressed(pad, BUTTON.DOWN) || y > STICK_THRESHOLD) active.add("down");
    if (pressed(pad, BUTTON.LEFT) || x < -STICK_THRESHOLD) active.add("left");
    if (pressed(pad, BUTTON.RIGHT) || x > STICK_THRESHOLD) active.add("right");
    if (pressed(pad, BUTTON.A)) active.add("a");
    if (pressed(pad, BUTTON.B)) active.add("b");
    if (pressed(pad, BUTTON.LB)) active.add("lb");
    if (pressed(pad, BUTTON.RB)) active.add("rb");
  }

  for (const control of held.keys()) if (!active.has(control)) held.delete(control);
  for (const control of active) {
    const next = held.get(control);
    const repeats = control in { up: 1, down: 1, left: 1, right: 1, lb: 1, rb: 1 };
    if (next === undefined) {
      held.set(control, repeats ? now + REPEAT_DELAY_MS : Infinity);
    } else if (now >= next) {
      held.set(control, now + REPEAT_INTERVAL_MS);
    } else {
      continue;
    }
    if (control === "a") activate("pad");
    else if (control === "b") back("pad");
    else if (control === "lb") scrollPage(-1);
    else if (control === "rb") scrollPage(1);
    else move(control as Direction, "pad");
  }
  requestAnimationFrame(poll);
}

function startPolling() {
  if (polling) return;
  polling = true;
  requestAnimationFrame(poll);
}

export function installControllerNavigation() {
  document.documentElement.dataset.nav = mode;
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("pointerdown", () => setMode("pointer"), { passive: true });
  window.addEventListener("popstate", () => (lastPopState = performance.now()));
  window.addEventListener("gamepadconnected", startPolling);
  // A controller that was connected before the page loaded only shows up
  // after its first button press, which fires gamepadconnected.
  if (navigator.getGamepads?.().some(Boolean)) startPolling();
  // Polling stops while the page is hidden; resume when it comes back.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && navigator.getGamepads?.().some(Boolean)) startPolling();
  });
}
