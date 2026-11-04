import type { SessionSnapshot, UseCaseError } from '@hew/core/editing/application';
import type { AiError, GeneratePatchResponse } from '@hew/core/ai/application';
import type { Result } from '@hew/core/shared/domain';
import { z } from 'zod';

/** Commands an extension page sends to the content script of a tab. */
export const editorCommand = z.discriminatedUnion('type', [
  z.object({ type: z.literal('editing/getSnapshot') }),
  z.object({ type: z.literal('editing/startPicker') }),
  z.object({ type: z.literal('editing/cancelPicker') }),
  z.object({ type: z.literal('editing/clearSelection') }),
  z.object({ type: z.literal('editing/submitPrompt'), prompt: z.string() }),
  z.object({ type: z.literal('editing/undo') }),
  z.object({ type: z.literal('editing/redo') }),
]);
export type EditorCommand = z.infer<typeof editorCommand>;

export interface EditorState {
  readonly snapshot: SessionSnapshot;
  readonly picking: boolean;
}

export type EditorResponse = Result<EditorState, UseCaseError & { readonly state?: EditorState }>;

/** Broadcast from the content script whenever its state changes. */
export interface EditorStateChanged {
  readonly type: 'editing/stateChanged';
  readonly state: EditorState;
}

export const generatePatchMessage = z.object({
  type: z.literal('ai/generatePatch'),
  request: z.object({
    prompt: z.string(),
    context: z.object({
      html: z.string(),
      ancestors: z.array(z.string()),
      styles: z.record(z.string(), z.string()),
      targetIds: z.array(z.string()),
      pageUrl: z.string(),
      pageTitle: z.string(),
    }),
  }),
});
export type GeneratePatchMessage = z.infer<typeof generatePatchMessage>;
export type GeneratePatchReply = Result<GeneratePatchResponse, AiError>;
