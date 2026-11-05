import type { AiError } from '@hew/core/ai/application';
import type { BudgetRequester, PatchRequester } from '@hew/core/editing/infrastructure';
import { err } from '@hew/core/shared/domain';
import type { z } from 'zod';
import {
  generatePatchMessage,
  type GeneratePatchMessage,
  type GeneratePatchReply,
  type GetContextBudgetMessage,
  type GetContextBudgetReply,
} from './messages';

export interface MessageSenderLike {
  readonly tab?: { readonly id?: number } | undefined;
  readonly id?: string | undefined;
  /** The URL of the frame that sent the message, as the browser reports it. */
  readonly url?: string | undefined;
}

export type RuntimeListener = (
  message: unknown,
  sender: MessageSenderLike,
  sendResponse: (response: unknown) => void,
) => boolean | undefined;

/**
 * Builds an onMessage listener that only answers messages matching `schema`; others are left for
 * other listeners. Uses sendResponse + `return true`, which every Chromium version supports.
 */
export function createHandler<S extends z.ZodType>(
  schema: S,
  handle: (message: z.infer<S>, sender: MessageSenderLike) => Promise<unknown>,
  extensionId?: string,
): RuntimeListener {
  return (message, sender, sendResponse) => {
    if (extensionId && sender.id !== extensionId) return false;
    const parsed = schema.safeParse(message);
    if (!parsed.success) return false;
    handle(parsed.data, sender).then(sendResponse, (error: unknown) =>
      sendResponse(err({ code: 'extension-error', message: error instanceof Error ? error.message : String(error) })),
    );
    return true;
  };
}

export type SendMessage = (message: unknown) => Promise<unknown>;

const bridgeError = (message: string): AiError => ({ code: 'extension-error', message });

/** PatchRequester for the content script: forwards the request to the background service worker. */
export function bridgedPatchRequester(send: SendMessage): PatchRequester {
  return async (request) => {
    const message: GeneratePatchMessage = generatePatchMessage.parse({ type: 'ai/generatePatch', request });
    try {
      const reply = (await send(message)) as GeneratePatchReply | undefined;
      return reply ?? err(bridgeError('The extension background did not answer. Reload the extension.'));
    } catch (error) {
      return err(bridgeError(error instanceof Error ? error.message : 'Could not reach the extension background.'));
    }
  };
}

/** BudgetRequester for the content script: asks the background for the active model's budget. */
export function bridgedBudgetRequester(send: SendMessage): BudgetRequester {
  return async () => {
    const message: GetContextBudgetMessage = { type: 'ai/getContextBudget' };
    try {
      const reply = (await send(message)) as GetContextBudgetReply | undefined;
      return reply ?? err(bridgeError('The extension background did not answer. Reload the extension.'));
    } catch (error) {
      return err(bridgeError(error instanceof Error ? error.message : 'Could not reach the extension background.'));
    }
  };
}
