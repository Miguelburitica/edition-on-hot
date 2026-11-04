import { err, ok, type Result } from '../../shared/domain';
import { EmptyPromptError, PromptTooLongError } from './errors';

export class Prompt {
  static readonly MAX_LENGTH = 2000;

  private constructor(readonly text: string) {}

  static create(raw: string): Result<Prompt, EmptyPromptError | PromptTooLongError> {
    const text = raw.trim();
    if (text.length === 0) return err(new EmptyPromptError());
    if (text.length > Prompt.MAX_LENGTH) return err(new PromptTooLongError(Prompt.MAX_LENGTH));
    return ok(new Prompt(text));
  }
}
