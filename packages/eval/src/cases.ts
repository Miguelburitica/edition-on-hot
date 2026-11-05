import type { ProposalDraft } from '@hew/core/ai/domain';
import {
  backgroundIsReddish,
  byText,
  flexGrow,
  hasBorder,
  hasRadius,
  inserted,
  insertedWith,
  isAfter,
  isBefore,
  isHidden,
  normalize,
  style,
  words,
  type Check,
} from './checks';

export interface EvalCase {
  readonly id: string;
  readonly fixture: 'demo';
  /** CSS selector of the element the user selects. */
  readonly select: string;
  readonly prompt: string;
  readonly checks: readonly { readonly name: string; readonly check: Check }[];
  /** A known-good answer, used by `--dry-run` to prove the case and its checks are sound. */
  readonly reference: ProposalDraft;
}

const check = (name: string, fn: Check) => ({ name, check: fn });

export const CASES: readonly EvalCase[] = [
  {
    id: 'banner-above-form',
    fixture: 'demo',
    select: '#signup',
    prompt: 'Add a red notification banner above this form saying the free trial ends soon',
    checks: [
      check('a banner mentioning the trial was added', (doc) =>
        insertedWith(doc, /trial/i) ? null : `inserted text: ${JSON.stringify(inserted(doc).map((el) => words(el)))}`,
      ),
      check('the banner is red', (doc) => {
        const banner = insertedWith(doc, /trial/i) ?? inserted(doc)[0];
        if (!banner) return 'nothing was inserted';
        return [banner, ...banner.querySelectorAll('*')].some(backgroundIsReddish) ? null : 'no red background on the banner';
      }),
      check('the banner sits above the form, outside it', (doc) => {
        const banner = insertedWith(doc, /trial/i) ?? inserted(doc)[0];
        const form = doc.querySelector('#signup')!;
        if (!banner) return 'nothing was inserted';
        if (form.contains(banner)) return 'the banner is inside the form';
        return isBefore(banner, form) ? null : 'the banner is below the form';
      }),
    ],
    reference: {
      summary: 'Adds a red trial banner above the form',
      ops: [
        { type: 'insert', target: 't0', position: 'before', html: '<div class="trial-banner">Your free trial ends soon</div>' },
        { type: 'addCss', css: '.trial-banner { background-color: #dc2626; color: #fff; padding: 8px 12px; }' },
      ],
    },
  },
  {
    id: 'red-primary-button',
    fixture: 'demo',
    select: '#signup button[type="submit"]',
    prompt: 'Make this button red',
    checks: [
      check('the sign up button has a red background', (doc) => {
        const button = doc.querySelector('#signup button[type="submit"]');
        return button && backgroundIsReddish(button) ? null : `background: ${button ? style(button, 'background-color') : 'button missing'}`;
      }),
    ],
    reference: { summary: 'Makes the button red', ops: [{ type: 'setStyle', target: 't0', styles: { 'background-color': '#dc2626' } }] },
  },
  {
    id: 'rename-heading',
    fixture: 'demo',
    select: 'section.card h2',
    prompt: 'Change this heading to "Start your free trial"',
    checks: [
      check('the heading reads "Start your free trial"', (doc) => {
        const text = normalize(doc.querySelector('section.card h2')?.textContent).replace(/^["']|["']$/g, '');
        return text === 'Start your free trial' ? null : `heading: "${text}"`;
      }),
    ],
    reference: { summary: 'Renames the heading', ops: [{ type: 'setText', target: 't0', text: 'Start your free trial' }] },
  },
  {
    id: 'hide-sales-button',
    fixture: 'demo',
    select: '#signup .actions',
    prompt: 'Hide the "Talk to sales" button',
    checks: [
      check('the sales button is gone or hidden', (doc) => {
        const button = byText(doc, '#signup button', 'Talk to sales');
        return !button || isHidden(button) ? null : 'the sales button is still visible';
      }),
      check('the sign up button is still visible', (doc) => {
        const button = byText(doc, '#signup button', 'Sign up');
        return button && !isHidden(button) ? null : 'the sign up button was removed or hidden';
      }),
    ],
    reference: { summary: 'Hides the sales button', ops: [{ type: 'setStyle', target: 't2', styles: { display: 'none' } }] },
  },
  {
    id: 'new-badge-row',
    fixture: 'demo',
    select: 'ul.list',
    prompt: 'Add a "New" badge next to Search indexer',
    checks: [
      check('the Search indexer row shows "New"', (doc) => {
        const row = byText(doc, 'ul.list li', 'Search indexer');
        return /\bNew\b/.test(words(row)) ? null : `row: "${words(row)}"`;
      }),
      check('the row keeps its status', (doc) => (byText(doc, 'ul.list li', 'Degraded') ? null : 'the "Degraded" status is gone')),
      check('other rows have no badge', (doc) => {
        const others = [...doc.querySelectorAll('ul.list li')].filter((li) => !/Search indexer/.test(li.textContent ?? ''));
        return others.some((li) => /\bNew\b/.test(words(li))) ? 'another row got the badge' : null;
      }),
    ],
    reference: { summary: 'Adds a New badge', ops: [{ type: 'insert', target: 't4', position: 'append', html: '<span class="tag">New</span>' }] },
  },
  {
    id: 'disable-submit',
    fixture: 'demo',
    select: '#signup button[type="submit"]',
    prompt: 'Disable this button',
    checks: [
      check('the sign up button is disabled', (doc) => {
        const button = doc.querySelector<HTMLButtonElement>('#signup button[type="submit"]');
        return button?.disabled || button?.getAttribute('aria-disabled') === 'true' ? null : 'the button is still enabled';
      }),
    ],
    reference: { summary: 'Disables the button', ops: [{ type: 'setAttr', target: 't0', name: 'disabled', value: '' }] },
  },
  {
    id: 'aria-label',
    fixture: 'demo',
    select: 'header.top .btn-ghost',
    prompt: 'Give this button the accessible label "Open documentation"',
    checks: [
      check('aria-label is "Open documentation"', (doc) => {
        const label = doc.querySelector('header.top .btn-ghost')?.getAttribute('aria-label');
        return normalize(label).toLowerCase() === 'open documentation' ? null : `aria-label: ${JSON.stringify(label)}`;
      }),
      check('the visible text is unchanged', (doc) =>
        normalize(doc.querySelector('header.top .btn-ghost')?.textContent) === 'Docs' ? null : 'the button text changed',
      ),
    ],
    reference: { summary: 'Adds an aria-label', ops: [{ type: 'setAttr', target: 't0', name: 'aria-label', value: 'Open documentation' }] },
  },
  {
    id: 'helper-text',
    fixture: 'demo',
    select: '#signup',
    prompt: 'Add small helper text under the email input saying we never share your email',
    checks: [
      check('helper text about not sharing the email was added', (doc) =>
        insertedWith(doc, /never share/i) ? null : `inserted text: ${JSON.stringify(inserted(doc).map((el) => words(el)))}`,
      ),
      check('the helper text sits between the email and team inputs', (doc) => {
        const hint = insertedWith(doc, /never share/i);
        const email = doc.querySelector('#email');
        const team = doc.querySelector('#team');
        if (!hint) return 'no helper text to place';
        if (!email || !team) return 'an input is missing';
        return isAfter(hint, email) && isBefore(hint, team) ? null : 'the helper text is not under the email input';
      }),
      check('the email input is still there', (doc) => (doc.querySelector('#email') ? null : 'the email input is gone')),
    ],
    reference: {
      summary: 'Adds helper text',
      ops: [{ type: 'insert', target: 't2', position: 'after', html: '<small class="hint">We never share your email.</small>' }],
    },
  },
  {
    id: 'toast',
    fixture: 'demo',
    select: 'main',
    prompt: 'Show a toast notification fixed in the bottom right corner saying "Changes saved"',
    checks: [
      check('a "Changes saved" toast was added', (doc) =>
        insertedWith(doc, /Changes saved/i) ? null : 'no inserted element says "Changes saved"',
      ),
      check('the toast is fixed-position', (doc) => {
        const toast = insertedWith(doc, /Changes saved/i);
        if (!toast) return 'no toast to check';
        return [toast, ...toast.querySelectorAll('*')].some((el) => style(el, 'position') === 'fixed') ? null : 'the toast is not position: fixed';
      }),
    ],
    reference: {
      summary: 'Adds a toast',
      ops: [
        { type: 'insert', target: 't0', position: 'append', html: '<div class="toast" role="status">Changes saved</div>' },
        { type: 'addCss', css: '.toast { position: fixed; bottom: 16px; right: 16px; }' },
      ],
    },
  },
  {
    id: 'card-padding',
    fixture: 'demo',
    select: 'section.card',
    prompt: 'Increase the padding of this card to 32px',
    checks: [
      check('the card has 32px padding', (doc) => {
        const card = doc.querySelector('section.card')!;
        const top = style(card, 'padding-top') || style(card, 'padding').split(' ')[0];
        return top === '32px' ? null : `padding-top: ${top || '(unset)'}`;
      }),
    ],
    reference: { summary: 'Increases the card padding', ops: [{ type: 'setStyle', target: 't0', styles: { padding: '32px' } }] },
  },
  {
    id: 'alternating-borders',
    fixture: 'demo',
    select: 'ul.list',
    prompt: 'Give every item a border that alternates between dark gray and light gray',
    checks: [
      check('every item has a border', (doc) => {
        const missing = [...doc.querySelectorAll('ul.list li')].filter((li) => !hasBorder(li)).length;
        return missing === 0 ? null : `${missing} item(s) without a border`;
      }),
      check('odd and even items have different border colors', (doc) => {
        const [first, second, third] = [...doc.querySelectorAll('ul.list li')].map((li) => style(li, 'border-top-color'));
        if (!first || !second) return 'border colors unreadable';
        return first !== second && first === third ? null : `colors: ${first} / ${second} / ${third}`;
      }),
    ],
    reference: {
      summary: 'Alternates item borders',
      ops: [{ type: 'addCss', css: 'li { border: 2px solid rgb(48, 54, 61); } li:nth-child(even) { border-color: rgb(208, 215, 222); }' }],
    },
  },
  {
    id: 'card-every-item',
    fixture: 'demo',
    select: 'ul.list',
    prompt: 'Turn every item of this list into a card with a subtle border and rounded corners',
    checks: [
      check('every item has a border', (doc) => {
        const missing = [...doc.querySelectorAll('ul.list li')].filter((li) => !hasBorder(li)).length;
        return missing === 0 ? null : `${missing} of 3 items without a border`;
      }),
      check('every item has rounded corners', (doc) => {
        const missing = [...doc.querySelectorAll('ul.list li')].filter((li) => !hasRadius(li)).length;
        return missing === 0 ? null : `${missing} of 3 items without rounded corners`;
      }),
    ],
    reference: {
      summary: 'Turns items into cards',
      ops: [{ type: 'addCss', css: 'li { border: 1px solid rgb(208, 215, 222); border-radius: 8px; padding: 8px 12px; margin-bottom: 8px; }' }],
    },
  },
  {
    id: 'form-fills-space',
    fixture: 'demo',
    select: 'section.card',
    prompt: 'Make this form use all the available space; its elements should grow as much as they can',
    checks: [
      check('the card spans the whole grid row', (doc) => {
        const card = doc.querySelector('section.card')!;
        const column = style(card, 'grid-column') || `${style(card, 'grid-column-start')} / ${style(card, 'grid-column-end')}`;
        return /1\s*\/\s*-1|span\s*2|1\s*\/\s*3/.test(column) ? null : `grid-column: ${column.trim() || '(unset)'}`;
      }),
      check('the action buttons grow', (doc) => {
        const buttons = [...doc.querySelectorAll('#signup .actions button')];
        const growing = buttons.filter((b) => flexGrow(b) >= 1 || style(b, 'width') === '100%').length;
        return growing === buttons.length ? null : `${growing} of ${buttons.length} buttons grow`;
      }),
    ],
    reference: {
      summary: 'Lets the form fill the row',
      ops: [
        { type: 'setStyle', target: 't0', styles: { 'grid-column': '1 / -1' } },
        { type: 'addCss', css: '.actions .btn { flex-grow: 1; }' },
      ],
    },
  },
];
