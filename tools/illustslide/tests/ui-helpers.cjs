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
  await (await button.isVisible() ? button : page.locator('.top [data-menu="more"]')).click();
  await page.locator(`#command-menu [data-action="${current ? 'present-current' : 'present-start'}"]`).click();
}

module.exports = { openView, revealObject, startPresentation };
