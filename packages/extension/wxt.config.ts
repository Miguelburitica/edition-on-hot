import react from '@vitejs/plugin-react';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  // React is added as a plain Vite plugin: WXT resolves `modules` from its own install location,
  // which pnpm's strict node_modules layout hides.
  vite: () => ({ plugins: [react()] }),
  manifest: {
    name: 'Hot Edit Web',
    description: 'Select part of any page, describe a change, and preview it live.',
    permissions: ['storage', 'sidePanel'],
    host_permissions: ['https://api.anthropic.com/*'],
    action: { default_title: 'Open Hot Edit Web' },
  },
});
