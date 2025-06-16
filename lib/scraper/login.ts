import { Page } from 'puppeteer';
import { ScraperSettings } from './ScraperSettings';

const SELECTORS = {
    USERNAME_INPUT: '#txtUserName',
    PASSWORD_INPUT: '#txtPassword',
    LOGIN_BUTTON: '#btnSubmit',
    MENU_LOADED: '.level3'
};

const TIMEOUT = 10000; // 10 seconds timeout

export async function login(page: Page, settings: ScraperSettings): Promise<void> {
    if (!settings.username || !settings.password) {
        throw new Error('Username and password are required for login');
    }

    try {
        // Navigate to login page
        await page.goto(settings.baseUrlToScrapeFrom.toString(), { waitUntil: 'networkidle0', timeout: TIMEOUT });

        // Fill in and submit login form
        await page.evaluate((username: string, password: string) => {
            document.querySelector<HTMLInputElement>("#txtUserName").value = username;
            document.querySelector<HTMLInputElement>("#txtPassword").value = password;
            document.querySelector<HTMLButtonElement>("#btnSubmit").click();
        }, settings.username, settings.password);

        // Wait for successful login
        await page.waitForSelector(SELECTORS.MENU_LOADED, { timeout: TIMEOUT });
        console.log('Successfully logged in');
    } catch (error) {
        console.error('Login error:', error);
        throw error;
    }
} 