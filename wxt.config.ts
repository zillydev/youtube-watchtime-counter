import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'YouTube Watch Time Counter',
    description: 'Tracks total video duration across all open YouTube tabs',
    version: '1.0.0',
    permissions: ['tabs', 'webNavigation', 'storage', 'scripting'],
    host_permissions: ['*://www.youtube.com/*'],
    action: {},
  },
});
