import { Page } from 'puppeteer';

/**
 * Safely types text into a form field
 */
export async function safelyType(page: Page, selector: string, value: string): Promise<boolean> {
    try {
        const element = await page.$(selector);
        if (element) {
            await element.click({ clickCount: 3 }); // Select all and replace
            await element.type(value, { delay: 10 });
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

/**
 * Safely clicks a button or element
 */
export async function safelyClick(page: Page, selector: string): Promise<boolean> {
    try {
        const element = await page.$(selector);
        if (element) {
            await element.click();
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

/**
 * Sets a form field value using JavaScript events
 */
export async function setFormFieldValue(page: Page, selector: string, value: string): Promise<void> {
    await page.evaluate((sel, val) => {
        const el = document.querySelector(sel) as HTMLInputElement;
        if (el) {
            el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }, selector, value);
}

/**
 * Sets multiple form field values
 */
export async function setFormFields(page: Page, fields: Array<{ selector: string; value: string }>): Promise<void> {
    for (const field of fields) {
        await setFormFieldValue(page, field.selector, field.value);
    }
}

/**
 * Triggers a form postback event
 */
export async function triggerPostback(page: Page, controlId: string): Promise<void> {
    await page.evaluate((id) => {
        setTimeout(`__doPostBack('${id}','')`, 0);
    }, controlId);
} 