import { err } from '@hew/core/shared/domain';
import type { EditorCommand, EditorResponse, PageCommand, PageReply } from './messages';

export type SendToTab = (tabId: number, message: unknown) => Promise<unknown>;

/** Extension-page client for the editor running in a tab's content script. */
export class EditorClient {
  constructor(
    private readonly sendToTab: SendToTab,
    readonly tabId: number,
  ) {}

  async send(command: EditorCommand): Promise<EditorResponse> {
    try {
      const response = (await this.sendToTab(this.tabId, command)) as EditorResponse | undefined;
      return response ?? err(notConnected());
    } catch {
      return err(notConnected());
    }
  }

  async request<C extends PageCommand>(command: C): Promise<PageReply<C['type']>> {
    try {
      const response = (await this.sendToTab(this.tabId, command)) as PageReply<C['type']> | undefined;
      return response ?? err(notConnected());
    } catch {
      return err(notConnected());
    }
  }
}

const notConnected = () => ({
  code: 'not-connected',
  message: 'Hot Edit Web is not running on this page. Reload the page, or open a regular web page.',
});
