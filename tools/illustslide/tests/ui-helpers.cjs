'use strict';

async function openView(page) {
  if (await page.locator('#view-toggle').getAttribute('aria-expanded') !== 'true') await page.locator('#view-toggle').click();
}

async function revealObject(page, id) {
  const button = page.locator(`[data-pick-object="${id}"]`);
  if (!await button.isVisible()) {
    const group = page.locator('.object-group').filter({ has: button });
    await group.locator('[data-object-group-toggle]').click();
  }
  return button;
}

async function startPresentation(page, current = false) {
  const button = page.locator('#present-button');
  await button.click();
  await page.locator(`#command-menu [data-action="${current ? 'present-current' : 'present-start'}"]`).click();
}

async function setAppearance(page, { theme, size } = {}) {
  const settings = page.locator('.top #settings-button[data-menu="settings"]');
  if (await settings.getAttribute('aria-expanded') !== 'true') await settings.click();
  if (theme) await page.locator(`button[data-theme-choice="${theme}"]`).click();
  if (size) await page.locator(`button[data-ui-size="${size}"]`).click();
  await page.keyboard.press('Escape');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

module.exports = { openView, revealObject, startPresentation, setAppearance };
