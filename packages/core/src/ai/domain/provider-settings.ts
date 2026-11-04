import { err, ok, type Result } from '../../shared/domain';
import { InvalidApiKeyFormatError, MissingApiKeyError, UnsupportedModelError } from './errors';
import { DEFAULT_MODEL, isModelId, type ModelId } from './model';

export interface ProviderConfig {
  readonly provider: 'anthropic';
  readonly apiKey: string;
  readonly model: ModelId;
}

/** The user's bring-your-own-key settings. The key may be absent until the user saves one. */
export class ProviderSettings {
  private constructor(
    readonly apiKey: string | null,
    readonly model: ModelId,
  ) {}

  static empty(): ProviderSettings {
    return new ProviderSettings(null, DEFAULT_MODEL);
  }

  static create(props: {
    apiKey: string | null;
    model: string;
  }): Result<ProviderSettings, InvalidApiKeyFormatError | UnsupportedModelError> {
    if (!isModelId(props.model)) return err(new UnsupportedModelError(props.model));
    if (props.apiKey === null) return ok(new ProviderSettings(null, props.model));
    const key = props.apiKey.trim();
    if (key === '' || /\s/.test(key)) return err(new InvalidApiKeyFormatError());
    return ok(new ProviderSettings(key, props.model));
  }

  get hasKey(): boolean {
    return this.apiKey !== null;
  }

  /** e.g. `sk-ant-…a1b2`; never exposes more than the last four characters. */
  get maskedKey(): string | null {
    if (!this.apiKey) return null;
    return `${this.apiKey.slice(0, 7)}…${this.apiKey.slice(-4)}`;
  }

  withoutKey(): ProviderSettings {
    return new ProviderSettings(null, this.model);
  }

  toConfig(): Result<ProviderConfig, MissingApiKeyError> {
    if (!this.apiKey) return err(new MissingApiKeyError());
    return ok({ provider: 'anthropic', apiKey: this.apiKey, model: this.model });
  }
}
