import { startContent } from '../composition/content-root';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    startContent();
  },
});
