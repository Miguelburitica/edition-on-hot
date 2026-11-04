import { err, ok, type Result } from '../../shared/domain';
import { InvalidAnchorError } from './errors';

export interface ElementAnchorProps {
  readonly selector: string;
  readonly tag: string;
  readonly role?: string | undefined;
  readonly textFingerprint: string;
}

/** Durable description of a page element, resolvable again without holding a node reference. */
export class ElementAnchor {
  static readonly FINGERPRINT_LENGTH = 80;

  private constructor(private readonly props: ElementAnchorProps) {}

  static create(props: ElementAnchorProps): Result<ElementAnchor, InvalidAnchorError> {
    if (props.selector.trim() === '') return err(new InvalidAnchorError('Anchor selector is empty.'));
    if (!/^[a-z][a-z0-9-]*$/i.test(props.tag)) {
      return err(new InvalidAnchorError(`Invalid anchor tag "${props.tag}".`));
    }
    return ok(
      new ElementAnchor({
        selector: props.selector,
        tag: props.tag.toLowerCase(),
        role: props.role || undefined,
        textFingerprint: ElementAnchor.normalizeText(props.textFingerprint),
      }),
    );
  }

  static normalizeText(text: string): string {
    return text.replace(/\s+/g, ' ').trim().slice(0, ElementAnchor.FINGERPRINT_LENGTH);
  }

  get selector() {
    return this.props.selector;
  }
  get tag() {
    return this.props.tag;
  }
  get role() {
    return this.props.role;
  }
  get textFingerprint() {
    return this.props.textFingerprint;
  }

  equals(other: ElementAnchor): boolean {
    return (
      this.selector === other.selector &&
      this.tag === other.tag &&
      this.role === other.role &&
      this.textFingerprint === other.textFingerprint
    );
  }

  toJSON(): ElementAnchorProps {
    return { ...this.props };
  }
}
