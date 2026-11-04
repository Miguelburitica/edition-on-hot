import createDOMPurify, { type DOMPurify } from 'dompurify';

const FORBID_TAGS = ['script', 'style', 'iframe', 'frame', 'object', 'embed', 'base', 'link', 'meta', 'template'];

/** Turns untrusted HTML into an inert fragment: no scripts, event handlers or javascript: URLs. */
export class HtmlSanitizer {
  private readonly purify: DOMPurify;

  constructor(window: Window) {
    this.purify = createDOMPurify(window as unknown as Parameters<typeof createDOMPurify>[0]);
    this.purify.addHook('uponSanitizeAttribute', (_node, data) => {
      if (data.attrName.startsWith('data-hew')) data.keepAttr = false;
    });
  }

  toFragment(html: string): DocumentFragment {
    return this.purify.sanitize(html, {
      RETURN_DOM_FRAGMENT: true,
      FORBID_TAGS,
      ALLOW_DATA_ATTR: true,
    });
  }
}
