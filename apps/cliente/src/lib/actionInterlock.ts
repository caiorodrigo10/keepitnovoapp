export interface ActionInterlock {
  acquire(): boolean;
  release(): void;
  isLocked(): boolean;
}

export function createActionInterlock(): ActionInterlock {
  let locked = false;
  return {
    acquire() {
      if (locked) {
        return false;
      }
      locked = true;
      return true;
    },
    release() {
      locked = false;
    },
    isLocked() {
      return locked;
    },
  };
}
