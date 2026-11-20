import { expect, test } from '@playwright/test';

test('sidebar stays compact with direct chapter links and detail pages show lesson topics', async ({ page }) => {
  await page.goto('/');
  const outline = page.getByRole('navigation', { name: '完整大纲' });
  await expect(outline.locator('.curriculum-subject')).toHaveCount(10);
  await expect(outline.locator('.curriculum-lesson')).toHaveCount(504);
  for (let i = 0; i < 10; i++) {
    expect(await outline.locator('.curriculum-subject').nth(i).locator('.curriculum-lesson').count()).toBeGreaterThanOrEqual(50);
  }
  const cppSubject = outline.locator('.curriculum-subject').filter({ has: page.getByText('现代 C++', { exact: true }) });
  await cppSubject.locator(':scope > summary').click();
  await expect(cppSubject.getByText('52 章', { exact: true })).toBeVisible();
  const cpp01Link = outline.getByRole('link', { name: /CPP-01\s*配置 C\+\+20 练习环境/ });
  await cpp01Link.click();
  await expect(page).toHaveURL(/\/handbook\/cpp-setup\/$/);
  await expect(outline.getByRole('link', { name: /CPP-01\s*配置 C\+\+20 练习环境/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.lesson-overview')).toContainText('识别当前终端、工作目录与源码路径');
});

test('mobile drawer includes planned chapters and the new tab icon is served', async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '展开主菜单' }).click();
  const outline = page.getByRole('navigation', { name: '完整大纲' });
  const subject = outline.locator('.curriculum-subject').filter({ hasText: '方向选修' });
  await subject.locator(':scope > summary').click();
  const lesson = subject.locator('.curriculum-lesson').filter({ hasText: 'TRK-04' });
  await expect(lesson.getByRole('link', { name: /TRK-04/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  const icon = await page.locator('link[rel=icon]').getAttribute('href');
  expect(icon).toContain('favicon.svg?v=4');
  expect(await (await page.request.get(icon)).text()).toContain('#1957a6');
  await page.screenshot({ path: info.outputPath('mobile-curriculum.png') });
});
