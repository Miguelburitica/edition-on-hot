import { z } from 'zod';
import { err, ok, type Result } from '../../shared/domain';
import { InvalidProposalError, type ProposalDraft, type ProposedOp } from '../domain';

const target = z.string().regex(/^t\d+$/, 'must be a data-hew-target id such as "t0"');

/** Both style formats are accepted: a record (Anthropic) or property/value pairs (strict schemas). */
const styles = z.union([
  z.record(z.string(), z.string()),
  z.array(z.object({ property: z.string().min(1), value: z.string() })),
]);

const proposedOp = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('insert'),
    target,
    position: z.enum(['before', 'after', 'prepend', 'append']),
    html: z.string().min(1),
  }),
  z.object({ type: z.literal('replace'), target, html: z.string().min(1) }),
  z.object({ type: z.literal('setStyle'), target, styles }),
  z.object({ type: z.literal('setAttr'), target, name: z.string().min(1), value: z.string().nullable() }),
  z.object({ type: z.literal('setText'), target, text: z.string() }),
  z.object({ type: z.literal('remove'), target }),
  z.object({ type: z.literal('addCss'), css: z.string().min(1) }),
]);

/** Large enough for sweeping changes; the strict JSON schema leaves it out because strict modes vary on maxItems. */
export const MAX_OPS = 60;

export const applyPatchInput = z.object({
  summary: z.string().min(1).max(300).describe('One sentence describing the change for the user.'),
  ops: z.array(proposedOp).min(1).max(MAX_OPS),
});

export type ApplyPatchInput = z.infer<typeof applyPatchInput>;

export const APPLY_PATCH_TOOL_NAME = 'apply_patch';

/** Anthropic tool schema (non-strict): generated from the Zod schema, styles as a record. */
export function applyPatchJsonSchema(): { type: 'object'; [key: string]: unknown } {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(applyPatchInput) as Record<string, unknown>;
  return { ...schema, type: 'object' };
}

/**
 * Strict wire schema for OpenRouter (structured outputs, tools, and the documented shape in
 * prompted mode). Every object is closed with all keys required; no $ref, oneOf, pattern or format,
 * which strict modes commonly reject. Target ids are checked by the parser and the domain instead.
 */
export function strictApplyPatchJsonSchema(): Record<string, unknown> {
  const str = { type: 'string' };
  const op = (type: string, properties: Record<string, unknown>) => ({
    type: 'object',
    additionalProperties: false,
    required: ['type', ...Object.keys(properties)],
    properties: { type: { type: 'string', enum: [type] }, ...properties },
  });
  return {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'ops'],
    properties: {
      summary: { type: 'string', description: 'One sentence describing the change for the user.' },
      ops: {
        type: 'array',
        items: {
          anyOf: [
            op('insert', { target: str, position: { type: 'string', enum: ['before', 'after', 'prepend', 'append'] }, html: str }),
            op('replace', { target: str, html: str }),
            op('setStyle', {
              target: str,
              styles: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['property', 'value'],
                  properties: { property: str, value: str },
                },
              },
            }),
            op('setAttr', { target: str, name: str, value: { type: ['string', 'null'] } }),
            op('setText', { target: str, text: str }),
            op('remove', { target: str }),
            op('addCss', { css: str }),
          ],
        },
      },
    },
  };
}

/** Parses raw output into a draft; returns readable issues (fed back to the model) on failure. */
export function parseProposalDraft(raw: unknown): Result<ProposalDraft, InvalidProposalError> {
  const result = applyPatchInput.safeParse(raw);
  if (!result.success) {
    return err(new InvalidProposalError(result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)));
  }
  return ok({ summary: result.data.summary, ops: result.data.ops.map(toProposedOp) });
}

function toProposedOp(op: ApplyPatchInput['ops'][number]): ProposedOp {
  if (op.type !== 'setStyle' || !Array.isArray(op.styles)) return op as ProposedOp;
  return { ...op, styles: Object.fromEntries(op.styles.map((p) => [p.property, p.value])) };
}
