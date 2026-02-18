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
					label: 'Internal',
					items: [
						{
							label: 'Architecture',
							autogenerate: { directory: 'internal/architecture' },
						},
						{
							label: 'Components',
							autogenerate: { directory: 'internal/components' },
						},
						{
							label: 'API',
							autogenerate: { directory: 'internal/api' },
						},
						{
							label: 'Features',
							autogenerate: { directory: 'internal/features' },
						},
						{
							label: 'Claude Code',
							autogenerate: { directory: 'internal/claude-code' },
						},
						{
							label: 'Apple Client',
							autogenerate: { directory: 'internal/apple-client' },
						},
						{
							label: 'Product Design',
							autogenerate: { directory: 'internal/product-design' },
						},
						{
							label: 'Design',
							autogenerate: { directory: 'internal/design' },
						},
					],
				},
			],
		}),
	],
});
