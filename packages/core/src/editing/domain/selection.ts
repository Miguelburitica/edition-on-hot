import type { ElementAnchor } from './element-anchor';

/** The element the user picked, plus a human label for the UI (e.g. `form#signup`). */
export class Selection {
  constructor(
    readonly anchor: ElementAnchor,
    readonly label: string,
  ) {}
}
