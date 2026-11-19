import { expect, test } from '@playwright/test';

test('sidebar exposes the complete curriculum and published reading links', async ({ page }) => {
  await page.goto('/');
  const outline = page.getByRole('navigation', { name: '完整大纲' });
  await expect(outline.locator('.curriculum-subject')).toHaveCount(10);
  await expect(outline.locator('.curriculum-lesson')).toHaveCount(131);
  await outline.getByText('现代 C++', { exact: true }).click();
  await expect(outline.getByText('18 章', { exact: true })).toBeVisible();
  await outline.getByText('配置 C++20 练习环境', { exact: true }).click();
  await expect(outline.getByText(/识别当前终端、工作目录与源码路径/)).toBeVisible();
  await outline.getByRole('link', { name: '环境正文', exact: true }).click();
  await expect(page).toHaveURL(/\/handbook\/cpp-setup\/$/);
  await expect(outline.getByRole('link', { name: '环境正文', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('mobile drawer includes planned chapters and the new tab icon is served', async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '展开主菜单' }).click();
  const outline = page.getByRole('navigation', { name: '完整大纲' });
  const subject = outline.locator('.curriculum-subject').filter({ hasText: '数据结构与算法' });
  await subject.locator(':scope > summary').click();
  const lesson = subject.locator('.curriculum-lesson').filter({ hasText: 'ALG-01' });
  await lesson.locator(':scope > summary').click();
  await expect(lesson.getByText('待编写', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  const icon = await page.locator('link[rel=icon]').getAttribute('href');
  expect(icon).toContain('favicon.svg?v=4');
  expect(await (await page.request.get(icon)).text()).toContain('#1957a6');
  await page.screenshot({ path: info.outputPath('mobile-curriculum.png') });
});
