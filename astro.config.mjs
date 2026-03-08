// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mermaid from 'astro-mermaid';

// https://astro.build/config
export default defineConfig({
	site: 'https://my.xiaoyuanzhu.com',
	base: '/docs',
	trailingSlash: 'always',
	outDir: './dist/docs',
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
					items: [
						{ slug: 'features/inbox' },
						{ slug: 'features/claude-code' },
						{
							label: 'Data Collectors',
							autogenerate: { directory: 'features/data-collectors' },
						},
					],
				},
				{
					label: 'Product Design',
					autogenerate: { directory: 'product-design' },
				},
				{
					label: 'Tech Design',
					items: [
						{ slug: 'tech-design/virtual-scrolling' },
						{
							label: 'Claude Code',
							autogenerate: { directory: 'tech-design/claude-code' },
						},
					],
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
