import { test, expect } from '@playwright/test';

test('all 504 chapters remain searchable and lead to existing section anchors', async ({ page }) => {
  test.setTimeout(120000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/roadmap/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#study-route')).toHaveAttribute('data-ready', 'true');
  const checked = await page.evaluate(async () => {
    const graph = JSON.parse(document.getElementById('route-data').textContent), byPath = new Map();
    for (const node of graph.nodes) {
      if (!node.url) throw Error(node.id + ' has no URL');
      const url = new URL(node.url, location.href);
      if (!byPath.has(url.pathname)) byPath.set(url.pathname, []);
      byPath.get(url.pathname).push({ id: node.id, anchor: decodeURIComponent(url.hash.slice(1)) });
    }
    const paths = [...byPath.entries()], failures = [];
    for (let start = 0; start < paths.length; start += 5) await Promise.all(paths.slice(start, start + 5).map(async ([path, nodes]) => {
      const response = await fetch(path);
      if (!response.ok) { failures.push(path + ' status ' + response.status); return; }
      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      for (const node of nodes) if (!doc.getElementById(node.anchor)) failures.push(node.id + ' #' + node.anchor);
    }));
    const ids = [...graph.tasks.flatMap(task => task.lessons), ...graph.supplementary];
    return { count: graph.nodes.length, failures, covered: new Set(ids).size, assignments: ids.length };
  });
  expect(checked).toEqual({ count: 504, failures: [], covered: 504, assignments: 504 });
  expect(errors).toEqual([]);
  await page.getByRole('button', { name: /全部课程/ }).click();
  await expect(page.locator('#route-lesson-list>li')).toHaveCount(504);
  await page.getByRole('searchbox', { name: '搜索全部课程' }).fill('CPP-25');
  await expect(page.locator('#route-lesson-list>li')).toHaveCount(1);
  await page.locator('#route-lesson-list>li>a').click();
  await expect(page).toHaveURL(/\/handbook\/cpp-core-deep\/#/);
});

test('route shows the next chapter, real parallel branches and task reading order', async ({ page }, info) => {
  await page.goto('/roadmap/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#route-next-title')).toContainText('CPP-01');
  await expect(page.locator('.route-task')).toHaveCount(4);
  await page.locator('[data-task="0-environment"]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('#route-lesson-list>li')).toHaveCount(9);
  await page.getByRole('button', { name: '关闭章节面板' }).click();
  await page.locator('[data-route-stage="1"]').click();
  await expect(page.locator('.route-parallel-label.is-parallel')).toContainText('这一组可并行');
  const git = await page.locator('[data-task="1-git"]').boundingBox();
  const cmake = await page.locator('[data-task="1-cmake"]').boundingBox();
  expect(Math.abs(git.x - cmake.x)).toBeLessThan(2);
  expect(await page.locator('#route-arrow-lines path').count()).toBe(2);
  await page.locator('[data-task="1-testing"]').click();
  await expect(page.locator('#route-prerequisites')).toContainText('CMake 多文件构建');
  await page.getByRole('button', { name: '关闭章节面板' }).click();
  await page.screenshot({ path: info.outputPath('route-parallel-desktop.png'), fullPage: true });
});

test('native scrolling is uncaptured, route stays still and mobile chapters remain usable', async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/roadmap/');
  await page.waitForLoadState('networkidle');
  const result = await page.evaluate(async () => {
    const pane = document.getElementById('route-diagram');
    let changes = 0;
    const observer = new MutationObserver(records => changes += records.length);
    observer.observe(pane, { attributes: true, subtree: true, childList: true });
    await new Promise(resolve => setTimeout(resolve, 250));
    let uncaptured = true;
    for (let i = 0; i < 20; i++) uncaptured = pane.dispatchEvent(new WheelEvent('wheel', { deltaY: 60, bubbles: true, cancelable: true })) && uncaptured;
    observer.disconnect();
    return { changes, uncaptured, width: document.documentElement.scrollWidth };
  });
  expect(result).toEqual({ changes: 0, uncaptured: true, width: 375 });
  await page.getByRole('button', { name: /全部课程/ }).click();
  await page.getByRole('searchbox', { name: '搜索全部课程' }).fill('TRK-50');
  await expect(page.locator('#route-lesson-list>li')).toHaveCount(1);
  await expect(page.locator('#route-lesson-list>li>a')).toHaveAttribute('href', /#.+/);
  await page.getByRole('button', { name: '关闭章节面板' }).click();
  await page.screenshot({ path: info.outputPath('route-mobile.png'), fullPage: true });
});
