import { expect, test, type Page } from "@playwright/test";
import { createAiDraftOutput, type AiOutputKind } from "../../core/ai/output";

test.describe("四个补全模块", () => {
  test.setTimeout(90000);

  test("正文和逐爻释义可读，乾坤附辞不挤占六爻", async ({ page }) => {
    await page.goto("/hexagrams/1");
    await expect(page.locator(".canonical-placeholder").first()).toContainText("元亨，利貞");
    await expect(page.locator(".line-text-list > div")).toHaveCount(6);
    await expect(page.locator(".line-text-list > div").first()).toContainText("潛龍勿用");
    await expect(page.locator(".hexagram-line-blocks")).toHaveCount(6);
    await expect(page.getByText(/見群龍无首/)).toBeVisible();
    await page.goto("/hexagrams/2");
    await expect(page.locator(".line-text-list > div")).toHaveCount(6);
    await expect(page.getByText(/利永貞/).last()).toBeVisible();
    await page.goto("/hexagrams/64");
    await expect(page.locator(".line-text-list > div")).toHaveCount(6);
    await expect(page.locator(".line-text-list > div").last()).toContainText("有孚于飲酒");
  });

  test("四柱与节气实际计算，换日切换和 DST 错误可见", async ({ page }) => {
    await page.goto("/tools/calendar");
    await page.getByLabel("公历本地时间").fill("1986-05-29T12:00");
    await page.getByRole("button", { name: "计算干支与节气" }).click();
    const result = page.getByLabel("干支与节气计算结果");
    await expect(result.locator(".four-pillars")).toHaveText(/年柱丙寅月柱癸巳日柱癸酉时柱戊午/);
    await expect(result.locator(".solar-term-grid > div")).toHaveCount(24);
    await page.getByLabel("公历本地时间").fill("2026-02-17T23:30");
    await page.getByRole("button", { name: "计算干支与节气" }).click();
    const day = await result.locator(".four-pillars > span").nth(2).innerText();
    await page.getByLabel("换日规则").selectOption("calendar-lichun-jie-zi-v1");
    await page.getByRole("button", { name: "计算干支与节气" }).click();
    await expect(result.locator(".four-pillars > span").nth(2)).not.toHaveText(day);
    await page.getByLabel("IANA 时区").fill("America/Los_Angeles");
    await page.getByLabel("公历本地时间").fill("2026-03-08T02:30");
    await page.getByRole("button", { name: "计算干支与节气" }).click();
    await expect(page.locator(".calendar-input-explorer .form-error")).toContainText("不存在");
    await expect(result).toHaveCount(0);
  });

  test("二十四山可点击、高亮、键盘定位并保存坐向", async ({ page }) => {
    await page.goto("/tools/compass");
    await page.getByRole("button", { name: /二十四山/ }).click();
    const sectors = page.locator(".mountain-dial [role=button]");
    await expect(sectors).toHaveCount(24);
    const jia = page.getByRole("button", { name: "甲山，75度", exact: true });
    await jia.click();
    await expect(jia).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".compass-reading")).toContainText("坐庚向甲");
    await jia.focus(); await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("button", { name: "卯山，90度", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator(".compass-reading")).toContainText("坐酉向卯");
    await page.getByRole("button", { name: "保存当前坐向" }).click();
    await expect(page.getByLabel("坐向记录", { exact: true })).toContainText("坐酉向卯");
    await page.reload();
    await expect(page.getByLabel("坐向记录", { exact: true })).toContainText("坐酉向卯");
  });

  async function setupAi(page: Page, posted: unknown[]) {
    await page.route("**/api/ai/study", async route => {
      if (route.request().method() === "GET") return route.fulfill({ json: { configured: true, model: "contract-test-model", provider: "test" } });
      const payload = route.request().postDataJSON(); posted.push(payload);
      const kind = payload.kind as AiOutputKind;
      const questions = kind === "exercise-draft" ? Array.from({ length: 3 }, (_, i) => ({ question: `测试题 ${i + 1}：阳爻如何表示？`, options: ["实线", "断线", "圆圈", "方块"], answerIndex: 0, explanation: "阳爻以连续的实线表示。", sourceIds: ["yin-yang-lines"] })) : [];
      const draft = createAiDraftOutput({ kind, text: `AI 辅助 · ${kind}：依据本次选择的材料整理，回到原文核对。`, inputScopes: payload.preview.scopes, sourceCitations: [{ sourceId: kind === "exercise-draft" ? "yin-yang-lines" : "selected-note-1", label: "本次选定材料" }] });
      await route.fulfill({ json: { draft, questions } });
    });
    await page.goto("/settings/ai");
    await page.getByLabel("允许使用 AI 辅学").check();
  }

  test("AI 出题须逐次确认，支持作答、草稿保存与撤权", async ({ page }) => {
    const posted: unknown[] = [];
    await setupAi(page, posted);
    await page.getByLabel("我选定的已校对知识").check();
    const workspace = page.getByLabel("真实 AI 辅学");
    await workspace.getByLabel("阴阳与爻", { exact: true }).check();
    await workspace.getByRole("button", { name: "预览本次实际发送内容" }).click();
    expect(posted).toHaveLength(0);
    await workspace.getByText("展开检查完整材料", { exact: true }).click();
    await expect(workspace.locator("pre")).toContainText("yin-yang-lines");
    await workspace.getByRole("button", { name: "确认发送并生成" }).click();
    await expect(page.getByLabel("AI 个性化练习").locator("article")).toHaveCount(3);
    expect(posted).toHaveLength(1);
    expect(JSON.stringify(posted)).not.toContain("note.markdown");
    await page.getByLabel("AI 个性化练习").getByRole("button", { name: "A. 实线" }).first().click();
    await expect(page.getByLabel("AI 个性化练习")).toContainText("回答正确");
    await workspace.getByText("审阅并保存完整草稿（含答案）", { exact: true }).click();
    await workspace.getByRole("button", { name: "接受草稿" }).click();
    await expect(workspace).toContainText("已保存为本地笔记");
    await page.getByRole("button", { name: "撤销 AI 授权并清除范围" }).click();
    await expect(workspace.getByRole("button", { name: "预览本次实际发送内容" })).toBeDisabled();
    await page.goto("/notes");
    await page.getByRole("link", { name: /AI 辅学笔记/ }).click();
    await expect(page.getByRole("textbox", { name: "个人笔记" })).toHaveValue(/AI 辅助/);
    await page.getByRole("textbox", { name: "个人笔记" }).fill("AI 辅助草稿：我已重新核对并补充理解。");
    await expect(page.getByText(/^已保存于/)).toBeVisible();
    await page.reload();
    await expect(page.getByRole("textbox", { name: "个人笔记" })).toHaveValue("AI 辅助草稿：我已重新核对并补充理解。");
  });

  for (const kind of ["note-draft", "viewpoint-comparison"] as const) {
    test(`AI ${kind} 仅发送选定笔记且不覆盖原文`, async ({ page }) => {
      await page.goto("/hexagrams/1");
      await page.getByRole("textbox", { name: "个人笔记" }).fill("乾的开创也需要适时潜藏。");
      await expect(page.getByText(/^已保存于/).first()).toBeVisible();
      await page.goto("/hexagrams/2");
      await page.getByRole("textbox", { name: "个人笔记" }).fill("坤强调承载与配合。");
      await expect(page.getByText(/^已保存于/).first()).toBeVisible();
      const posted: unknown[] = [];
      await setupAi(page, posted);
      await page.locator(".ai-scope-option").filter({ hasText: "我选定的笔记" }).locator("input").check();
      const workspace = page.getByLabel("真实 AI 辅学");
      await workspace.getByLabel("辅学任务").selectOption(kind);
      await workspace.getByRole("button", { name: "载入本地笔记与作答记录" }).click();
      const notes = workspace.locator("details").filter({ has: page.getByText("选定笔记（最多 10 篇）", { exact: true }) });
      await expect(notes.getByRole("checkbox")).toHaveCount(2);
      await notes.getByRole("checkbox").first().check();
      if (kind === "viewpoint-comparison") await notes.getByRole("checkbox").nth(1).check();
      await workspace.getByRole("button", { name: "预览本次实际发送内容" }).click();
      expect(posted).toHaveLength(0);
      await workspace.getByRole("button", { name: "确认发送并生成" }).click();
      await expect(workspace.getByRole("button", { name: "接受草稿" })).toBeVisible();
      const payload = posted[0] as { selectedData: Record<string, unknown[]> };
      expect(payload.selectedData["note.markdown"]).toHaveLength(kind === "note-draft" ? 1 : 2);
      await workspace.getByRole("button", { name: "接受草稿" }).click();
      await expect(workspace).toContainText("已保存为本地笔记");
      await page.goto("/hexagrams/1");
      await expect(page.getByRole("textbox", { name: "个人笔记" })).toHaveValue("乾的开创也需要适时潜藏。");
    });
  }

  test("模型未配置时不把本地演示当作生成结果", async ({ page }) => {
    await page.route("**/api/ai/study", route => route.fulfill({ json: { configured: false, model: null } }));
    await page.goto("/settings/ai");
    await page.getByLabel("允许使用 AI 辅学").check();
    await page.getByLabel("我选定的已校对知识").check();
    const workspace = page.getByLabel("真实 AI 辅学");
    await workspace.getByLabel("阴阳与爻", { exact: true }).check();
    await workspace.getByRole("button", { name: "预览本次实际发送内容" }).click();
    await expect(workspace).toContainText("模型尚未配置");
    await expect(workspace.getByRole("button", { name: "确认发送并生成" })).toBeDisabled();
    await expect(workspace.getByLabel("AI 草稿审阅工作流")).toHaveCount(0);
  });
});
