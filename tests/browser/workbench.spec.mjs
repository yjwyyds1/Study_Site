import { test, expect } from '@playwright/test';
import { emptyState } from '../../src/lib/state.mjs';

test('browser navigation, code copy, outline, search and theme', async ({ page, context }, info) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await expect(page.getByRole('heading', { level:1 })).toHaveText('开始学习');
  await page.screenshot({ path:info.outputPath('desktop-home.png'), fullPage:true });
  for (const [name, path, heading] of [['学习路线','roadmap','一步一步，走到能独立交付'],['学习记录','records','学习记录']]) {
    await page.getByRole('navigation',{ name:'主导航' }).getByRole('link',{ name, exact:true }).click();
    await expect(page).toHaveURL(new RegExp('/' + path + '/$'));
    await expect(page.getByRole('heading', { level:1 })).toContainText(heading);
  }
  await page.keyboard.press('Control+k');
  await page.getByRole('searchbox').fill('生命周期');
  await page.locator('#search-result a[href$="/handbook/lifetime/"]').click();
  await expect(page).toHaveURL(/\/handbook\/lifetime\/$/);
  const pre = page.locator('.prose pre').first();
  await expect(pre.locator('code span').first()).toBeAttached();
  await expect(pre).toContainText('#include');
  await page.getByRole('button', { name:'复制代码' }).first().click();
  await expect(page.getByRole('button',{ name:'已复制' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('#include');
  await page.getByRole('navigation',{ name:'本页目录' }).getByRole('link',{ name:'模拟一次 vector 追加' }).click();
  await page.getByRole('button',{ name:'重置：已满' }).click();
  await page.getByRole('button',{ name:'追加 20' }).click();
  await expect(page.locator('#vector-outcome')).toContainText('旧借用指向已失效');
  await page.getByRole('button',{ name:'重置：有余量' }).click();
  await page.getByRole('button',{ name:'追加 20' }).click();
  await expect(page.locator('#vector-outcome')).toContainText('引用仍有效');
  await page.getByRole('button',{ name:'切换深色模式' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.evaluate(() => window.scrollTo(0,0));
  await page.screenshot({ path:info.outputPath('desktop-reader-dark.png') });
  await page.getByRole('navigation',{ name:'上一篇与下一篇' }).getByRole('link',{ name:/下一篇/ }).click();
  await expect(page).toHaveURL(/\/handbook\/raii\/$/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(errors).toEqual([]);
});

test('simplified learned/unlearned toggles persist to sqlite db, sidebar shows check/cross, and dashboard visualizes daily progress', async ({ page, browser, baseURL }, info) => {
  await page.request.put('/api/state', { data: { state: emptyState() } });
  try {
    await page.goto('/handbook/cpp-setup/#practice-record');
    await expect(page.locator('#record-pill')).toContainText('未学习');
    const cpp01Li = page.locator('.curriculum-lesson[data-lesson-id="CPP-01"]');
    await expect(cpp01Li).toHaveAttribute('data-learned', 'false');
    await expect(cpp01Li.locator('.lesson-status-btn')).toHaveText('✕');

    await page.locator('#mark-learned').click();
    await expect(page.locator('#record-pill')).toContainText('已学习');
    await expect(page.locator('#record-status')).toContainText('SQLite 数据库');
    await expect(cpp01Li).toHaveAttribute('data-learned', 'true');
    await expect(cpp01Li.locator('.lesson-status-btn')).toHaveText('✓');

    // Clear browser localStorage and reload — progress must survive via SQLite DB!
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('#record-pill')).toContainText('已学习');
    await expect(cpp01Li).toHaveAttribute('data-learned', 'true');
    await expect(cpp01Li.locator('.lesson-status-btn')).toHaveText('✓');

    await page.goto('/');
    await expect(page.getByRole('link', { name: '继续上次学习' })).toHaveAttribute('href', /cpp-setup/);
    await expect(page.locator('#evidence-count')).toContainText('1 / 504 已学习');
    await expect(page.locator('#today-summary')).toContainText('已学完 1 节');

    await page.goto('/notes/');
    await page.locator('#note-form input[type=file]').setInputFiles({ name: 'my-run.md', mimeType: 'text/markdown', buffer: Buffer.from('# 我的本地实验\n\n唯一检索灯塔。') });
    await page.getByLabel('关联课程或项目').selectOption('handbook/cpp-setup');
    await page.getByRole('button', { name: '保存到我的笔记' }).click();
    await expect(page.locator('#note-feedback')).toContainText('已保存');
    await page.getByRole('button', { name: '全站搜索' }).click();
    await page.getByRole('searchbox').fill('唯一检索灯塔');
    await page.locator('#search-result').getByRole('link', { name: /我的本地实验/ }).click();
    await expect(page.getByText('唯一检索灯塔。', { exact: true })).toBeVisible();
    await page.goto('/handbook/cpp-setup/');
    await expect(page.getByRole('link', { name: '我的本地实验' })).toHaveAttribute('href', /notes\/#private-/);

    await page.goto('/records/');
    await expect(page.locator('#kpi-total')).toContainText('1 / 504');
    await expect(page.locator('#kpi-today')).toContainText('+1 节');
    await expect(page.locator('#kpi-db-status')).toContainText('SQLite 已同步');
    await expect(page.locator('#daily-heatmap .hm-cell')).toHaveCount(84);
    await expect(page.locator('#daily-bars .bar-col')).toHaveCount(14);
    await expect(page.locator('#daily-timeline')).toContainText('CPP-01');
    await expect(page.locator('#subject-progress-grid .subject-dash-card')).toHaveCount(10);

    await page.getByText('学习档案与周计划（可选）', { exact: true }).click();
    await page.locator('#profile-file').setInputFiles({ name: 'profile.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 1, profile: { weeklyFocus: '独立验证一次回归' } })) });
    await expect(page.getByLabel('本周任务')).toHaveValue('独立验证一次回归');
    await page.getByRole('button', { name: '保存学习档案' }).click();

    await page.getByText('备份导出与恢复', { exact: true }).click();
    const [backup] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '导出完整备份' }).click()]);
    const path = info.outputPath('study-backup-test.json');
    await backup.saveAs(path);

    const fresh = await browser.newContext({ baseURL });
    try {
      const other = await fresh.newPage();
      await other.goto('/records/#backup');
      await expect(other.getByRole('button', { name: '导出完整备份' })).toBeVisible();
      await other.locator('#backup-file').setInputFiles({ name: 'wrong.json', mimeType: 'application/json', buffer: Buffer.from('{"version":9}') });
      await expect(other.locator('#backup-feedback')).toContainText('不支持该备份版本');
      await other.locator('#backup-file').setInputFiles(path);
      await expect(other.locator('#import-summary')).toContainText('1 节课程进度');
      await other.getByRole('button', { name: '确认替换' }).click();
      await expect(other.locator('#daily-timeline')).toContainText('CPP-01');
      await expect(other.getByLabel('本周任务')).toHaveValue('独立验证一次回归');

      await other.locator('#backup-file').setInputFiles({ name: 'blank.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(emptyState())) });
      await other.getByRole('button', { name: '确认替换' }).click();
      await expect(other.locator('#kpi-total')).toContainText('0 / 504');
      await other.getByRole('button', { name: '查看替换前快照' }).click();
      await other.getByRole('button', { name: '确认替换' }).click();
      await expect(other.locator('#kpi-total')).toContainText('1 / 504');
      await other.reload();
      await expect(other.locator('#kpi-total')).toContainText('1 / 504');
    } finally { await fresh.close(); }
  } finally {
    await page.request.put('/api/state', { data: { state: emptyState() } });
  }
});

test('mobile drawer, reading width and folded project solution', async ({ page }, info) => {
  await page.setViewportSize({ width:375, height:844 });
  await page.goto('/');
  await page.getByRole('button',{ name:'展开主菜单' }).click();
  const outline = page.getByRole('navigation', { name: '完整大纲' });
  await outline.getByText('现代 C++', { exact: true }).click();
  await outline.locator('.curriculum-lesson').filter({ hasText: 'CPP-12' }).getByRole('link').click();
  await expect(page).toHaveURL(/\/labs\/logscan\/$/);
  const details = page.locator('.prose details').filter({ hasText:'完整参考实现' });
  await expect(details.locator('pre')).toBeHidden();
  await details.locator('summary').click();
  await expect(details.locator('pre')).toBeVisible();
  await expect(details.locator('pre')).toContainText('int main');
  await page.goto('/handbook/lifetime/');
  await expect(page.locator('.outline details')).not.toHaveAttribute('open', '');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  await page.screenshot({ path:info.outputPath('mobile-reader.png') });
});

test('saving another profile field in an older tab preserves a newer edit', async ({ page, context }) => {
  await page.goto('/records/#profile');
  const other = await context.newPage();
  await other.goto('/records/#profile');
  await other.getByLabel('本周任务').fill('新的本周任务');
  await other.getByRole('button', { name:'保存学习档案' }).click();
  await expect(other.locator('#profile-feedback')).toContainText('已保存');
  await page.getByLabel('方向', { exact:true }).fill('先走共用基础');
  await page.getByRole('button', { name:'保存学习档案' }).click();
  await expect(page.locator('#profile-feedback')).toContainText('已保存');
  await page.reload();
  await expect(page.getByLabel('本周任务')).toHaveValue('新的本周任务');
  await expect(page.getByLabel('方向', { exact:true })).toHaveValue('先走共用基础');
});

test('published lessons retain their next lesson and the top outline entry', async ({ page }) => {
  await page.goto('/labs/logscan/');
  const navigation = page.getByRole('navigation', { name:'主导航' });
  await expect(navigation.getByRole('link')).toHaveText(['开始学习', '学习路线', '项目实验', '笔记', '学习记录']);
  await page.getByRole('navigation',{ name:'上一篇与下一篇' }).getByRole('link',{ name:/下一篇/ }).click();
  await expect(page).toHaveURL(/\/handbook\/eng-zero-start\/$/);
  await page.getByRole('navigation',{ name:'上一篇与下一篇' }).getByRole('link',{ name:/下一篇/ }).click();
  await expect(page).toHaveURL(/\/handbook\/command-line-git\/$/);
  await navigation.getByRole('link',{ name:'学习路线' }).click();
  await expect(page).toHaveURL(/\/roadmap\/$/);
  await expect(page.locator('#route-diagram')).toBeVisible();
});

test('desktop left and right rails collapse to widen reading content and table cells stay intact', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/handbook/linux-zero-start/');
  const article = page.locator('article[data-track-article]');
  const initialBox = await article.boundingBox();

  await page.locator('[data-collapse-sidebar]').click();
  await expect(page.locator('#sidebar')).toBeHidden();
  const afterLeftCollapse = await article.boundingBox();
  expect(afterLeftCollapse.width).toBeGreaterThan(initialBox.width);

  await page.locator('#outline-collapse').click();
  await expect(page.locator('[data-outline]')).toBeHidden();
  await expect(page.locator('#outline-expand')).toBeVisible();
  const afterBothCollapse = await article.boundingBox();
  expect(afterBothCollapse.width).toBeGreaterThan(afterLeftCollapse.width);

  await page.reload();
  await expect(page.locator('#sidebar')).toBeHidden();
  await expect(page.locator('[data-outline]')).toBeHidden();

  await page.locator('#sidebar-toggle').click();
  await expect(page.locator('#sidebar')).toBeVisible();
  await page.locator('#outline-expand').click();
  await expect(page.locator('[data-outline]')).toBeVisible();

  const mkdirBox = await page.locator('.prose table code', { hasText: 'mkdir' }).first().boundingBox();
  expect(mkdirBox.height).toBeLessThan(32);
});

test('wsl copy-run button, lesson chips, 504-lesson anchor search, interactive labs, and markdown review export work', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/handbook/cpp-basics/');
  await expect(page.locator('.lesson-chip')).toHaveCount(1);
  await page.getByRole('button', { name: '复制 WSL 一键运行' }).first().click();
  await expect(page.getByRole('button', { name: '已复制 WSL 命令' })).toBeVisible();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain("cat << 'EOF' > main.cpp");
  expect(clip).toContain('g++ -std=c++20 -Wall -Wextra main.cpp -o main && ./main');

  await page.keyboard.press('Control+k');
  await page.getByRole('searchbox').fill('CPP-25');
  const hit = page.locator('#search-result a', { hasText: 'CPP-25' }).first();
  await expect(hit).toHaveAttribute('href', /\/handbook\/cpp-core-deep\/#/);
  await hit.click();
  await expect(page).toHaveURL(/\/handbook\/cpp-core-deep\/#/);

  await page.goto('/handbook/mach-zero-start/#bit-endian-lab');
  await page.getByRole('button', { name: '-1 / 255（全 1）' }).click();
  await expect(page.locator('#bit-readout')).toContainText('0xFF');
  await page.locator('#endian-big').click();
  await expect(page.locator('#endian-cells')).toContainText('0x12 (MSB)');

  await page.goto('/handbook/net-zero-start/#framing-lab');
  await page.getByRole('button', { name: '场景 1：粘包' }).click();
  await page.locator('#frame-feed').click();
  await expect(page.locator('#framing-out')).toContainText('"INFO ok"');
  await expect(page.locator('#framing-out')).toContainText('"ERR!"');

  await page.goto('/records/');
  await expect(page.getByRole('link', { name: '进入项目实验（LogScan）' })).toHaveAttribute('href', /\/labs\/$/);
  await expect(page.getByRole('link', { name: '打开笔记与博客' })).toHaveAttribute('href', /\/notes\/$/);
  await page.locator('#export-review').click();
  await expect(page.locator('#review-feedback')).toContainText('已生成 study-review-');

  await page.goto('/roadmap/');
  await page.getByRole('button', { name: /全部课程/ }).click();
  await page.getByRole('searchbox', { name: '搜索全部课程' }).fill('NET-34');
  await expect(page.locator('#route-lesson-list')).toContainText('长度前缀分帧');
  await expect(page.locator('#route-lesson-list>li')).toHaveCount(1);
});
