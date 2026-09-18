'use strict';

async function reveal(page, id) {
  const target = page.locator('#' + id);
  if (await target.isVisible()) return target;
  const more = page.locator('#toolbar-more');
  if (!await more.count()) throw new Error('#' + id + ' はツールバーにありません。');
  const summary = more.locator(':scope > summary');
  if (!await more.evaluate(element => element.open)) await summary.click();
  await target.waitFor({ state: 'visible' });
  return target;
}

async function openMenu(page, id) {
  const menu = await reveal(page, id);
  if (!await menu.evaluate(element => element.open)) await menu.locator(':scope > summary').click();
  return menu;
}

async function openSettings(page) {
  return openMenu(page, 'view-menu');
}

async function openDisplay(page) {
  return openMenu(page, 'display-menu');
}

async function setAppearance(page, { theme, textSize } = {}) {
  if (theme === undefined && textSize === undefined) return;
  await openSettings(page);
  if (theme !== undefined) await page.locator('[data-theme-value="' + theme + '"]').click();
  if (textSize !== undefined) await page.locator('#text-size').selectOption(textSize);
}

async function openAxes(page) {
  await openSettings(page);
  await page.locator('#axes-button').click();
}

async function selectWorkspace(page, value) {
  await openDisplay(page);
  await page.locator('#workspace-view').selectOption(value);
}

async function openComparisonSettings(page) {
  await openDisplay(page);
  await page.locator('#comparison-settings').click();
}

async function clickToolbarControl(page, id) {
  if (id === 'mode-2d' || id === 'mode-3d') await openDisplay(page);
  const control = await reveal(page, id);
  await control.click();
}

module.exports = { clickToolbarControl, openAxes, openComparisonSettings, openDisplay, openSettings, selectWorkspace, setAppearance };
