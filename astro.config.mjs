// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mermaid from 'astro-mermaid';

// https://astro.build/config
export default defineConfig({
	integrations: [
		mermaid(),
		starlight({
			title: 'MyLifeDB Docs',
			social: [],
			sidebar: [
				{
					label: 'Get Started',
					autogenerate: { directory: 'get-started' },
				},
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
