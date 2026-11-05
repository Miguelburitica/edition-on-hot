import react from '@vitejs/plugin-react';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  // A visible folder (WXT defaults to `.output`), so Finder and the Load unpacked dialog show it.
  outDir: 'dist',
  // React is added as a plain Vite plugin: WXT resolves `modules` from its own install location,
  // which pnpm's strict node_modules layout hides.
  vite: () => ({ plugins: [react()] }),
  manifest: {
    name: 'Hot Edit Web',
    description: 'Select part of any page, describe a change, and preview it live.',
    permissions: ['storage', 'sidePanel'],
    host_permissions: ['https://api.anthropic.com/*', 'https://openrouter.ai/*', 'https://opencode.ai/*'],
    // A LiteLLM proxy can live anywhere: access to its exact origin is requested when it is saved.
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    action: { default_title: 'Open Hot Edit Web' },
  },
});
