import { z } from 'zod';

const target = z.string().regex(/^t\d+$/, 'must be a data-hew-target id such as "t0"');

const proposedOp = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('insert'),
    target,
    position: z.enum(['before', 'after', 'prepend', 'append']),
    html: z.string().min(1),
  }),
  z.object({ type: z.literal('replace'), target, html: z.string().min(1) }),
  z.object({ type: z.literal('setStyle'), target, styles: z.record(z.string(), z.string()) }),
  z.object({ type: z.literal('setAttr'), target, name: z.string().min(1), value: z.string().nullable() }),
  z.object({ type: z.literal('setText'), target, text: z.string() }),
  z.object({ type: z.literal('remove'), target }),
  z.object({ type: z.literal('addCss'), css: z.string().min(1) }),
]);

export const applyPatchInput = z.object({
  summary: z.string().min(1).max(300).describe('One sentence describing the change for the user.'),
  ops: z.array(proposedOp).min(1).max(30),
});

export type ApplyPatchInput = z.infer<typeof applyPatchInput>;

export const APPLY_PATCH_TOOL_NAME = 'apply_patch';

export function applyPatchJsonSchema(): { type: 'object'; [key: string]: unknown } {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(applyPatchInput) as Record<string, unknown>;
  return { ...schema, type: 'object' };
}

/** Parses tool input; returns readable issues (fed back to the model) on failure. */
export function parseApplyPatchInput(input: unknown): { ok: true; value: ApplyPatchInput } | { ok: false; issues: string[] } {
  const result = applyPatchInput.safeParse(input);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    issues: result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
  };
}
