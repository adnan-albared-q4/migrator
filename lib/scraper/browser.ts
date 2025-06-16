import * as puppeteer from 'puppeteer';
import { Browser } from 'puppeteer';

let browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
    if (!browser) {
        browser = await puppeteer.launch({
            headless: false,
            defaultViewport: null,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--start-maximized'
            ]
        });
    }
    return browser;
}

export async function closeBrowser(): Promise<void> {
    if (browser) {
        await browser.close();
        browser = null;
    }
} 