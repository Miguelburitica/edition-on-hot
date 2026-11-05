import type { ChangeLog, SessionSnapshot, UseCaseError } from '@hew/core/editing/application';
import type { DesignSystemDraftView } from '@hew/core/design-system/application';
import type { AiError, ContextBudget, GeneratePatchResponse } from '@hew/core/ai/application';
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
  z.object({ type: z.literal('editing/goToVersion'), version: z.number().int().min(0) }),
]);
export type EditorCommand = z.infer<typeof editorCommand>;

export interface PageInfo {
  readonly url: string;
  readonly title: string;
}

export interface EditorState {
  readonly snapshot: SessionSnapshot;
  readonly picking: boolean;
  readonly page: PageInfo;
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

export const getContextBudgetMessage = z.object({ type: z.literal('ai/getContextBudget') });
export type GetContextBudgetMessage = z.infer<typeof getContextBudgetMessage>;
export type GetContextBudgetReply = Result<ContextBudget, AiError>;

/** Page-level commands an extension page sends to a tab's content script, besides editing. */
export const pageCommand = z.discriminatedUnion('type', [
  z.object({ type: z.literal('editing/exportChanges') }),
  z.object({ type: z.literal('designSystem/extract') }),
  z.object({
    type: z.literal('designSystem/inject'),
    // Re-checked by the injector; bounded here so a page message cannot flood the stylesheet.
    variables: z
      .record(z.string().regex(/^--[a-zA-Z0-9_-]+$/), z.string().max(200))
      .refine((v) => Object.keys(v).length <= 400)
      .nullable(),
  }),
]);
export type PageCommand = z.infer<typeof pageCommand>;

export interface PageReplies {
  'editing/exportChanges': { readonly page: PageInfo; readonly log: ChangeLog };
  'designSystem/extract': { readonly page: PageInfo; readonly draft: DesignSystemDraftView };
  'designSystem/inject': { readonly injected: number };
}
export type PageReply<T extends PageCommand['type']> = Result<PageReplies[T], UseCaseError>;
