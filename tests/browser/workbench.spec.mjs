import { test, expect } from '@playwright/test';
import { emptyState } from '../../src/lib/state.mjs';

test('browser navigation, code copy, outline, search and theme', async ({ page, context }, info) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await expect(page.getByRole('heading', { level:1 })).toHaveText('开始学习');
  await page.screenshot({ path:info.outputPath('desktop-home.png'), fullPage:true });
  for (const [name, path] of [['课程大纲','handbook'],['学习记录','records']]) {
    await page.getByRole('navigation',{ name:'主导航' }).getByRole('link',{ name, exact:true }).click();
    await expect(page).toHaveURL(new RegExp('/' + path + '/$'));
    await expect(page.getByRole('heading', { level:1 })).toHaveText(name);
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

test('evidence and review persist, private notes search, backup transfers and rolls back', async ({ page, browser }, info) => {
  await page.goto('/handbook/toolchain/#practice-record');
  await page.getByLabel('掌握状态').selectOption('passed');
  await page.getByRole('button',{ name:'保存学习记录' }).click();
  await expect(page.locator('#record-status')).toContainText('请先填写');
  await page.getByLabel('练习 / 验收依据').fill('终端输出 true；在断点确认了变量值。');
  await page.getByLabel('卡点与下一次验证').fill('复习构建目录');
  await page.getByLabel('需要复习', { exact:true }).check();
  await page.getByRole('button',{ name:'保存学习记录' }).click();
  await expect(page.locator('#record-status')).toContainText('已保存');
  await page.reload();
  await expect(page.getByLabel('掌握状态')).toHaveValue('passed');
  await expect(page.getByLabel('需要复习', { exact:true })).toBeChecked();
  await page.goto('/');
  await expect(page.getByRole('link',{ name:'继续上次学习' })).toHaveAttribute('href', /toolchain/);
  await expect(page.locator('#evidence-count')).toHaveText(/^1 \/ \d+ 通过验收$/);
  await expect(page.locator('#review-queue')).toContainText('编译、链接与调试');
  await page.goto('/notes/');
  await page.locator('#note-form input[type=file]').setInputFiles({ name:'my-run.md', mimeType:'text/markdown', buffer:Buffer.from('# 我的本地实验\n\n唯一检索灯塔。') });
  await page.getByLabel('关联课程或项目').selectOption('handbook/toolchain');
  await page.getByRole('button',{ name:'保存到我的笔记' }).click();
  await expect(page.locator('#note-feedback')).toContainText('已保存');
  await page.getByRole('button',{ name:'全站搜索' }).click();
  await page.getByRole('searchbox').fill('唯一检索灯塔');
  await page.locator('#search-result').getByRole('link',{ name:/我的本地实验/ }).click();
  await expect(page.getByText('唯一检索灯塔。', { exact:true })).toBeVisible();
  await page.goto('/handbook/toolchain/');
  await expect(page.getByRole('link',{ name:'我的本地实验' })).toHaveAttribute('href', /notes\/#private-/);
  await page.goto('/records/');
  await page.getByText('学习档案', { exact:true }).click();
  await page.locator('#profile-file').setInputFiles({ name:'profile.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify({ version:1, profile:{ weeklyFocus:'独立验证一次回归' } })) });
  await expect(page.getByLabel('本周任务')).toHaveValue('独立验证一次回归');
  await page.getByRole('button',{ name:'保存学习档案' }).click();
  await page.getByText('导出学习复盘材料', { exact:true }).click();
  await page.locator('#review-options input').check();
  await page.getByRole('button',{ name:'生成复盘文本' }).click();
  await expect(page.getByLabel('复盘文本')).toHaveValue(/终端输出 true/);
  await expect(page.getByLabel('复盘文本')).not.toHaveValue(/独立验证一次回归|唯一检索灯塔/);
  await page.getByLabel('包含学习档案与阶段复盘').check();
  await page.getByRole('button',{ name:'生成复盘文本' }).click();
  await expect(page.getByLabel('复盘文本')).toHaveValue(/独立验证一次回归/);
  await page.getByText('备份与恢复', { exact:true }).click();
  const [backup] = await Promise.all([page.waitForEvent('download'), page.getByRole('button',{ name:'导出完整备份' }).click()]);
  const path = info.outputPath('study-backup-test.json');
  await backup.saveAs(path);

  const fresh = await browser.newContext({ baseURL:'http://127.0.0.1:4321' });
  try {
    const other = await fresh.newPage();
    await other.goto('/records/#backup');
    await expect(other.getByRole('button',{ name:'导出完整备份' })).toBeVisible();
    await other.locator('#backup-file').setInputFiles({ name:'wrong.json', mimeType:'application/json', buffer:Buffer.from('{"version":9}') });
    await expect(other.locator('#backup-feedback')).toContainText('不支持该备份版本');
    await other.locator('#backup-file').setInputFiles(path);
    await expect(other.locator('#import-summary')).toContainText('1 条学习记录、1 篇私人笔记');
    await expect(other.locator('#history-list')).not.toContainText('终端输出 true');
    await other.getByRole('button',{ name:'确认替换' }).click();
    await expect(other.locator('#history-list')).toContainText('终端输出 true');
    await expect(other.getByLabel('本周任务')).toHaveValue('独立验证一次回归');
    await other.locator('#backup-file').setInputFiles({ name:'blank.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(emptyState())) });
    await other.getByRole('button',{ name:'确认替换' }).click();
    await expect(other.locator('#history-list')).not.toContainText('终端输出 true');
    await other.getByRole('button',{ name:'查看替换前快照' }).click();
    await other.getByRole('button',{ name:'确认替换' }).click();
    await expect(other.locator('#history-list')).toContainText('终端输出 true');
    await other.reload();
    await expect(other.locator('#history-list')).toContainText('终端输出 true');
  } finally { await fresh.close(); }
});

test('mobile drawer, reading width and folded project solution', async ({ page }, info) => {
  await page.setViewportSize({ width:375, height:844 });
  await page.goto('/');
  await page.getByRole('button',{ name:'展开主菜单' }).click();
  const outline = page.getByRole('navigation', { name: '完整大纲' });
  await outline.getByText('现代 C++', { exact: true }).click();
  const logscan = outline.locator('.curriculum-lesson').filter({ hasText: 'CPP-12' });
  await logscan.locator('summary').click();
  await logscan.getByRole('link', { name: 'LogScan v0 实验' }).click();
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
  await expect(navigation.getByRole('link')).toHaveText(['开始学习', '课程大纲', '学习记录']);
  await page.getByRole('navigation',{ name:'上一篇与下一篇' }).getByRole('link',{ name:/下一篇/ }).click();
  await expect(page).toHaveURL(/\/handbook\/command-line-git\/$/);
  await navigation.getByRole('link',{ name:'课程大纲' }).click();
  await expect(page).toHaveURL(/\/handbook\/$/);
  await expect(page.locator('.course-stage').first()).toBeVisible();
});
