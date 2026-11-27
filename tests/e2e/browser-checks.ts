import { expect, test as base } from '@playwright/test';

export { expect };
export const test = base.extend({
  page: async ({ page }, runWithPage) => {
    const problems: string[] = [];
    page.on('pageerror', error => problems.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' ||
          (message.type() === 'warning' && /hydrat|server.rendered|did not match/i.test(message.text()))) {
        problems.push(`${message.text()} (${message.location().url})`);
      }
    });
    await runWithPage(page);
    expect(problems, 'Browser errors and hydration warnings').toEqual([]);
  },
});
