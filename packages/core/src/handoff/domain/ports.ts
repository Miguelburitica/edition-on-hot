import type { ChangeSpec } from './change-spec';

export interface RenderedFile {
  readonly fileName: string;
  readonly mimeType: string;
  readonly content: string | Uint8Array;
}

/** Turns a change spec into a downloadable file (Markdown, an OpenSpec archive, JSON). */
export interface ChangeSpecRenderer {
  render(spec: ChangeSpec): RenderedFile;
}
