import { err, ok, type Clock, type Result } from '../../shared/domain';
import { ChangeSpec, UnknownExportFormatError, type ChangeSpecInput, type ChangeSpecRenderer, type RenderedFile } from '../domain';

export const EXPORT_FORMATS = ['markdown', 'openspec', 'json'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export interface HandoffError {
  readonly code: string;
  readonly message: string;
}

/** Builds the session's change spec and renders it in the requested format. */
export class ExportChangeSpec {
  constructor(
    private readonly renderers: Readonly<Record<ExportFormat, ChangeSpecRenderer>>,
    private readonly clock: Clock,
  ) {}

  execute(input: { format: string; spec: ChangeSpecInput }): Result<RenderedFile, HandoffError> {
    const renderer = (EXPORT_FORMATS as readonly string[]).includes(input.format) ? this.renderers[input.format as ExportFormat] : undefined;
    if (!renderer) return err(toError(new UnknownExportFormatError(input.format)));
    const spec = ChangeSpec.create(input.spec, this.clock.now());
    if (!spec.ok) return err(toError(spec.error));
    return ok(renderer.render(spec.value));
  }
}

const toError = (e: { code: string; message: string }): HandoffError => ({ code: e.code, message: e.message });
