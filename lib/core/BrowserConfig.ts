import { PuppeteerNodeLaunchOptions } from 'puppeteer';

export const BROWSER_CONFIG: PuppeteerNodeLaunchOptions = {
    headless: true,
    defaultViewport: {
        width: 1920,
        height: 1200
    },
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--window-size=1920,1200',
        '--disable-dev-shm-usage',
        '--start-maximized'
    ],
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
};

export async function setupPage(page: any) {
    // Set viewport
    await page.setViewport({
        width: 1920,
        height: 1200
    });
} 