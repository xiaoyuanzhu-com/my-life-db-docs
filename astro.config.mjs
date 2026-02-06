// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	integrations: [
		starlight({
			title: 'MyLifeDB Docs',
			social: [],
			sidebar: [
				{
					label: 'Architecture',
					autogenerate: { directory: 'architecture' },
				},
				{
					label: 'Components',
					autogenerate: { directory: 'components' },
				},
				{
					label: 'API',
					autogenerate: { directory: 'api' },
				},
				{
					label: 'Features',
					autogenerate: { directory: 'features' },
				},
				{
					label: 'Claude Code',
					autogenerate: { directory: 'claude-code' },
				},
				{
					label: 'Apple Client',
					autogenerate: { directory: 'apple-client' },
				},
				{
					label: 'Design',
					autogenerate: { directory: 'design' },
				},
			],
		}),
	],
});
