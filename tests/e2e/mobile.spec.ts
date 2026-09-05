import { expect, test } from "@playwright/test";

test("触控设备可以完成实验室爻变操作", async ({ page }) => {
  await page.goto("/lab/hexagram");
  await expect(
    page.getByRole("heading", { name: "组合上下卦，观察一爻如何改变全局" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "1爻" }).first().tap();
  await expect(page.getByText(/变卦 · 动 1 爻/)).toBeVisible();
  await expect(page.getByRole("button", { name: "撤销一步" })).toBeEnabled();
});

test("触控设备可以操作罗盘输入和数据设置入口", async ({ page }) => {
  await page.goto("/tools/compass");
  await page.getByLabel("手动输入角度（0°=北，顺时针）").fill("90");
  await expect(page.locator(".compass-reading h2")).toHaveText("东 · 90.0°");
  await page.goto("/settings/data");
  await expect(
    page.getByRole("button", { name: "导出 JSON 备份" }),
  ).toBeVisible();
  const widths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(widths.scrollWidth).toBeLessThanOrEqual(widths.clientWidth);
});

test("手机导航可以展开并在跳转后自动收起", async ({ page }) => {
  await page.goto("/");
  const menu = page.getByRole("button", { name: /菜单/ });
  let hasMobileMenu = true;
  try {
    await expect(menu).toBeVisible({ timeout: 5_000 });
  } catch {
    hasMobileMenu = false;
  }
  if (!hasMobileMenu) {
    test.skip();
    return;
  }
  await menu.tap();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("link", { name: "学习地图" })).toBeVisible();
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("link", { name: "学习地图" }).focus();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeFocused();
  await menu.tap();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("link", { name: "学习地图" }).tap();
  await expect(page).toHaveURL(/\/learn$/);
  await expect(page.getByRole("button", { name: /菜单/ })).toHaveAttribute("aria-expanded", "false");

  await page.goto("/lab/hexagram");
  await expect(menu).toBeVisible();
  await menu.tap();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("link", { name: "学习地图" })).toBeVisible();
  await page.getByRole("link", { name: "学习地图" }).tap();
  await expect(page).toHaveURL(/\/learn$/);
  await expect(page.getByRole("button", { name: /菜单/ })).toHaveAttribute("aria-expanded", "false");
});
