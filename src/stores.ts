import { writable } from "svelte/store";
export const showAllCollisions = writable(false);
export const colliderTrailColorMode = writable<'same' | 'different'>('different');

function createDarkModeStore() {
  const { set, subscribe, update } = writable<"light" | "dark">("dark");

  return {
    set,
    subscribe,
    toggle: () => {
      update((_) => (_ === "dark" ? "light" : "dark"));
    },
  };
}

export const darkMode = createDarkModeStore();

// Math tools stores
export const showRuler = writable(false);
export const showProtractor = writable(false);
export const showGrid = writable(false);
export const protractorLockToRobot = writable(true);
export const gridSize = writable(12);

// Path editing tools
export const clickToPlaceMode = writable(false);
export const centerLineWarningEnabled = writable(true);
export const showCollisionPath = writable(false);
export const collisionNextSegmentOnly = writable(false);

// Collision sample rate (number of samples per segment)
// Collision sampling - fixed in code for now

// Show small corner dots for debugging miscalculations
export const showCornerDots = writable(true);
