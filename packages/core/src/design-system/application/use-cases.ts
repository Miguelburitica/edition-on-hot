import { err, ok, type Clock, type IdGenerator, type Result } from '../../shared/domain';
import {
  DesignSystem,
  DesignSystemNotFoundError,
  NothingExtractedError,
  singleLine,
  usableParts,
  toTokenName,
  type ComponentPattern,
  type DesignSystemDraft,
  type DesignSystemExtractor,
  type DesignSystemRepository,
  type DesignTokenCodec,
  type Token,
} from '../domain';

export interface DesignSystemError {
  readonly code: string;
  readonly message: string;
}

export type TokenView = Token;
export type ComponentView = ComponentPattern;

export interface DesignSystemView {
  readonly id: string;
  readonly name: string;
  readonly origin: string | null;
  readonly tokens: readonly TokenView[];
  readonly components: readonly ComponentView[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DesignSystemDraftView {
  readonly name: string;
  readonly tokens: readonly TokenView[];
  readonly components: readonly ComponentView[];
}

export interface DesignSystemLibraryView {
  readonly systems: readonly DesignSystemView[];
  /** The design system active for the asked origin, if any. */
  readonly activeId: string | null;
}

const toError = (e: { code: string; message: string }): DesignSystemError => ({ code: e.code, message: e.message });

export function toDesignSystemView(system: DesignSystem): DesignSystemView {
  return {
    id: system.id,
    name: system.name,
    origin: system.origin,
    tokens: system.tokens,
    components: system.components,
    createdAt: system.createdAt.toISOString(),
    updatedAt: system.updatedAt.toISOString(),
  };
}

/** `https://shop.example.com/a?b` → `https://shop.example.com`; null for non-web pages. */
export function originOf(pageUrl: string): string | null {
  try {
    const url = new URL(pageUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

/** Runs where the page is (the content script). */
export class ExtractDesignSystem {
  constructor(private readonly extractor: DesignSystemExtractor) {}

  execute(): Result<DesignSystemDraftView, DesignSystemError> {
    const draft = this.extractor.extract();
    const parts = usableParts(draft);
    if (parts.tokens.length === 0 && parts.components.length === 0) return err(toError(new NothingExtractedError()));
    return ok({ name: draft.name, ...parts });
  }
}

interface LibraryDeps {
  readonly repo: DesignSystemRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

async function saveDraft(
  deps: LibraryDeps,
  draft: DesignSystemDraft,
  origin: string | null,
  activateFor: string | null,
): Promise<Result<DesignSystemView, DesignSystemError>> {
  const now = deps.clock.now();
  const parts = usableParts(draft);
  if (parts.tokens.length === 0 && parts.components.length === 0) return err(toError(new NothingExtractedError()));
  const created = DesignSystem.create({
    id: deps.ids.next(),
    name: singleLine(draft.name).slice(0, 80) || 'Design system',
    origin,
    tokens: parts.tokens,
    components: parts.components,
    createdAt: now,
    updatedAt: now,
  });
  if (!created.ok) return err(toError(created.error));
  await deps.repo.save(created.value);
  if (activateFor) await deps.repo.setActive(activateFor, created.value.id);
  return ok(toDesignSystemView(created.value));
}

/** Saves an extracted draft and activates it for the site it came from. */
export class SaveDesignSystem {
  constructor(private readonly deps: LibraryDeps) {}

  execute(input: { draft: DesignSystemDraftView; origin: string }): Promise<Result<DesignSystemView, DesignSystemError>> {
    return saveDraft(this.deps, input.draft, input.origin, input.origin);
  }
}

/** Imports a token file and activates it for the current site (when there is one). */
export class ImportDesignSystem {
  constructor(
    private readonly deps: LibraryDeps,
    private readonly codec: DesignTokenCodec,
  ) {}

  async execute(input: { text: string; fileName: string; origin: string | null }): Promise<Result<DesignSystemView, DesignSystemError>> {
    const fallbackName = singleLine(input.fileName.replace(/\.(tokens\.)?json$/i, '')).slice(0, 80) || 'Imported tokens';
    const draft = this.codec.decode(input.text, fallbackName);
    if (!draft.ok) return err(toError(draft.error));
    return saveDraft(this.deps, draft.value, null, input.origin);
  }
}

export class ExportDesignSystem {
  constructor(
    private readonly repo: DesignSystemRepository,
    private readonly codec: DesignTokenCodec,
  ) {}

  async execute(input: { id: string }): Promise<Result<{ fileName: string; text: string }, DesignSystemError>> {
    const system = await this.repo.get(input.id);
    if (!system) return err(toError(new DesignSystemNotFoundError()));
    return ok({ fileName: `${toTokenName(system.name) || 'design-system'}.tokens.json`, text: this.codec.encode(system) });
  }
}

export class ListDesignSystems {
  constructor(private readonly repo: DesignSystemRepository) {}

  async execute(input: { origin: string | null }): Promise<DesignSystemLibraryView> {
    const systems = (await this.repo.list()).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const activeId = input.origin ? await this.repo.activeFor(input.origin) : null;
    return {
      systems: systems.map(toDesignSystemView),
      activeId: activeId && systems.some((s) => s.id === activeId) ? activeId : null,
    };
  }
}

export class ActivateDesignSystem {
  constructor(private readonly repo: DesignSystemRepository) {}

  async execute(input: { origin: string; id: string | null }): Promise<Result<void, DesignSystemError>> {
    if (input.id !== null && !(await this.repo.get(input.id))) return err(toError(new DesignSystemNotFoundError()));
    await this.repo.setActive(input.origin, input.id);
    return ok(undefined);
  }
}

export class RenameDesignSystem {
  constructor(
    private readonly repo: DesignSystemRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: { id: string; name: string }): Promise<Result<DesignSystemView, DesignSystemError>> {
    const system = await this.repo.get(input.id);
    if (!system) return err(toError(new DesignSystemNotFoundError()));
    const renamed = system.rename(input.name, this.clock.now());
    if (!renamed.ok) return err(toError(renamed.error));
    await this.repo.save(renamed.value);
    return ok(toDesignSystemView(renamed.value));
  }
}

export class DeleteDesignSystem {
  constructor(private readonly repo: DesignSystemRepository) {}

  async execute(input: { id: string }): Promise<void> {
    await this.repo.delete(input.id);
  }
}

async function activeSystem(repo: DesignSystemRepository, pageUrl: string): Promise<DesignSystem | null> {
  const origin = originOf(pageUrl);
  if (!origin) return null;
  const id = await repo.activeFor(origin);
  return id ? repo.get(id) : null;
}

/** The text the AI context sends with change requests for this page. */
export class GetDesignGuidance {
  constructor(private readonly repo: DesignSystemRepository) {}

  async execute(input: { pageUrl: string; maxChars: number }): Promise<string | null> {
    const system = await activeSystem(this.repo, input.pageUrl);
    if (!system) return null;
    return system.guidance(input.maxChars) || null;
  }
}

/** Custom properties to define on the page so the active design system's tokens resolve. */
export class GetInjectableTokens {
  constructor(private readonly repo: DesignSystemRepository) {}

  async execute(input: { pageUrl: string }): Promise<Record<string, string> | null> {
    const system = await activeSystem(this.repo, input.pageUrl);
    if (!system) return null;
    return system.injectableVariables();
  }
}
