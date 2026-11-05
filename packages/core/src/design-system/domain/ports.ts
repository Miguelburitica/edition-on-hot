import type { Result } from '../../shared/domain';
import type { DesignSystem, DesignSystemId } from './design-system';
import type { InvalidTokenFileError } from './errors';
import type { ComponentPattern, Token } from './token';

/** What an extraction or import produces before it becomes a saved design system. */
export interface DesignSystemDraft {
  readonly name: string;
  readonly tokens: readonly Token[];
  readonly components: readonly ComponentPattern[];
}

export interface DesignSystemRepository {
  list(): Promise<DesignSystem[]>;
  get(id: DesignSystemId): Promise<DesignSystem | null>;
  save(system: DesignSystem): Promise<void>;
  /** Removes the design system and every site binding to it. */
  delete(id: DesignSystemId): Promise<void>;
  activeFor(origin: string): Promise<DesignSystemId | null>;
  setActive(origin: string, id: DesignSystemId | null): Promise<void>;
}

/** Reads a design system off the current page (implemented against the DOM). */
export interface DesignSystemExtractor {
  extract(): DesignSystemDraft;
}

/** Converts design systems to and from a token file format (DTCG JSON). */
export interface DesignTokenCodec {
  encode(system: DesignSystem): string;
  decode(text: string, fallbackName: string): Result<DesignSystemDraft, InvalidTokenFileError>;
}
