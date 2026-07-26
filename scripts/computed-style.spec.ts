/**
 * computed-style 断言模板（Playwright）。
 * 目的：抓肉眼看不出的样式漂移——按钮/文本的实际 computed 值必须等于设计 token 值。
 * 用法：把本文件拷到项目 e2e 目录，按页面填 EXPECT 表，然后 `npx playwright test`。
 *
 * 填表来源：design-pages.md 里的「组件状态矩阵」「类型阶梯」解析出的目标值。
 */
import { test, expect } from '@playwright/test';

const PAGE_URL = process.env.GOAL_PAGE_URL ?? 'http://localhost:5173/';

// selector → 期望的 computed 样式（key 用 CSS 属性名，value 用解析后的最终值）
const EXPECT: Record<string, Record<string, string | RegExp>> = {
  // 例：主按钮默认态
  '[data-test="btn-primary"]': {
    'font-size': '14px',
    'font-weight': '600',
    'border-radius': '8px',
    // 颜色断言用 rgb 实测值（浏览器会把 token 解析成 rgb）
    'background-color': 'rgb(37, 99, 235)',
    'padding-top': '8px',
    'padding-left': '16px',
  },
  // 例：正文文本角色
  '[data-test="text-body"]': {
    'font-size': '16px',
    'line-height': /^25\.6px|1\.6/,
    'font-weight': '400',
  },
};

test.describe('computed-style 对齐', () => {
  for (const [selector, props] of Object.entries(EXPECT)) {
    test(`${selector} 样式应等于设计 token`, async ({ page }) => {
      await page.goto(PAGE_URL, { waitUntil: 'networkidle' });
      const el = page.locator(selector).first();
      await expect(el, `未找到元素 ${selector}`).toBeVisible();
      for (const [prop, want] of Object.entries(props)) {
        const got = await el.evaluate(
          (node, p) => getComputedStyle(node as Element).getPropertyValue(p).trim(),
          prop,
        );
        if (want instanceof RegExp) {
          expect(got, `${selector} ${prop}`).toMatch(want);
        } else {
          expect(got, `${selector} ${prop}`).toBe(want);
        }
      }
    });
  }
});
