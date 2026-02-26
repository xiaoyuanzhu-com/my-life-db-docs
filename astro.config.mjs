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
					label: 'Features',
					autogenerate: { directory: 'features' },
				},
				{
					label: 'Product Design',
					autogenerate: { directory: 'product-design' },
				},
				{
					label: 'Tech Design',
					autogenerate: { directory: 'tech-design' },
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
							label: 'Apple Client',
							autogenerate: { directory: 'internal/apple-client' },
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
