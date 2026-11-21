import { test, expect } from '@playwright/test';

test('project milestones link to the matching stage and its optional practice', async ({ page }) => {
  await page.goto('/labs/');
  const projects = page.getByRole('list', { name: 'LogScan 项目顺序' });
  await expect(projects.getByRole('listitem')).toHaveCount(5);
  const service = projects.getByRole('listitem').last();
  await expect(service.getByRole('heading')).toContainText('LogScan v3');
  await expect(service).toContainText('集成指导');
  await service.getByRole('link', { name: '查看阶段先修' }).click();
  await expect(page).toHaveURL(/\/roadmap\/#stage-4$/);
  await expect(page.locator('#route-stage-title')).toHaveText('有界 TCP 服务');

  const practice = page.getByRole('region', { name: '本阶段选练' });
  await expect(practice.getByRole('link', { name: /NET-54/ })).toBeVisible();
  await expect(practice.getByRole('link', { name: /CON-51/ })).toBeVisible();
  await practice.getByRole('link', { name: /NET-54/ }).click();
  const url = new URL(page.url());
  expect(url.pathname).toMatch(/\/handbook\/net-beej-guide\/$/);
  await expect(page.locator(`[id=${JSON.stringify(decodeURIComponent(url.hash.slice(1)))}]`)).toBeAttached();
});
