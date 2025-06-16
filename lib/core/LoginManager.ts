import { SiteConfig } from './types';
import { StateManager } from './StateManager';
import puppeteer, { Browser, Page } from 'puppeteer';
import chalk from 'chalk';
import { CMSService } from '../services/CMS';
import { waitTillHTMLRendered } from '../helpers/Puppeteer';
import { BROWSER_CONFIG, setupPage } from './BrowserConfig';

export class LoginManager {
    private browser: Browser | null = null;
    private page: Page | null = null;
    private stateManager: StateManager;
    private cmsService: CMSService | null = null;
    private static readonly MAX_LOGIN_ATTEMPTS = 3;
    private loginAttempts = 0;
    public isShared = false;
    private headlessOverride?: boolean;

    constructor(private site: SiteConfig, headless?: boolean) {
        this.stateManager = StateManager.getInstance();
        this.headlessOverride = headless;
    }

    setShared(shared: boolean): void {
        this.isShared = shared;
    }

    async initialize(): Promise<boolean> {
        try {
            // Initialize browser if not exists
            if (!this.browser) {
                let launchConfig = { ...BROWSER_CONFIG };
                if (typeof this.headlessOverride === 'boolean') {
                    launchConfig.headless = this.headlessOverride;
                }
                // If headful, set window position to second monitor (right, x=1920)
                if (launchConfig.headless === false) {
                    launchConfig.args = Array.isArray(launchConfig.args) ? [...launchConfig.args] : [];
                    launchConfig.args.push('--window-position=1920,100');
                }
                this.browser = await puppeteer.launch(launchConfig);
            }

            // Create new page if not exists
            if (!this.page) {
                this.page = await this.browser.newPage();
                await setupPage(this.page);
            }

            return true;
        } catch (error) {
            console.error(chalk.red(`Failed to initialize browser for ${this.site.name}:`), error);
            this.stateManager.setError(this.site.destination, 'Browser initialization failed');
            return false;
        }
    }

    async login(): Promise<boolean> {
        if (!this.page || !this.browser) {
            const initialized = await this.initialize();
            if (!initialized) return false;
        }

        try {
            // Initialize site state first
            this.stateManager.initializeSite(this.site);
            
            this.stateManager.updateSiteLoginStatus(this.site.destination, 'logging-in');
            console.log(chalk.blue(`Logging into ${this.site.name} (${this.site.destination})...`));
            
            // Initialize CMS service
            const siteUrl = `https://${this.site.destination}.s4.q4web.com`;
            const loginUrl = new URL(`${siteUrl}/admin/login.aspx`);
            
            if (!this.page) {
                throw new Error('Page is not initialized');
            }

            this.cmsService = new CMSService({ 
                url: loginUrl, 
                page: this.page 
            });

            // Login using CMS service
            await this.cmsService.login();
            
            // Verify dashboard
            const dashboardVerified = await this.verifyDashboard();
            if (dashboardVerified) {
                this.stateManager.updateSiteLoginStatus(this.site.destination, 'logged-in');
                this.loginAttempts = 0; // Reset attempts on success
                return true;
            }

            throw new Error('Dashboard verification failed after login');

        } catch (error) {
            console.error(chalk.red(`Login failed for ${this.site.name}:`), error);
            this.loginAttempts++;
            
            if (this.loginAttempts >= LoginManager.MAX_LOGIN_ATTEMPTS) {
                this.stateManager.updateSiteLoginStatus(this.site.destination, 'login-failed');
                this.stateManager.setError(this.site.destination, `Login failed after ${LoginManager.MAX_LOGIN_ATTEMPTS} attempts`);
                return false;
            }

            // Try logging in again
            console.log(chalk.yellow(`Retrying login (attempt ${this.loginAttempts + 1}/${LoginManager.MAX_LOGIN_ATTEMPTS})...`));
            return this.login();
        }
    }

    async verifyDashboard(): Promise<boolean> {
        if (!this.page) return false;

        try {
            // Check for dashboard title with specific Dashboard span
            const isDashboard = await this.page.evaluate(() => {
                const title = document.querySelector('h1.page-title span.ModuleTitle');
                return title?.textContent === 'Dashboard';
            });

            if (isDashboard) {
                console.log(chalk.green(`Dashboard verified for ${this.site.name}`));
                return true;
            }

            console.log(chalk.yellow(`Dashboard verification failed: Could not find dashboard title`));
            return false;

        } catch (error) {
            console.error(chalk.red(`Dashboard verification failed for ${this.site.name}:`), error);
            return false;
        }
    }

    getDashboardPage(): Page | null {
        const state = this.stateManager.getSiteState(this.site.destination);
        if (state?.loginStatus !== 'logged-in' || !state.dashboardVerified) {
            return null;
        }
        return this.page;
    }

    async close(): Promise<void> {
        try {
            if (this.page) {
                await this.page.close();
                this.page = null;
            }
            if (this.browser) {
                await this.browser.close();
                this.browser = null;
            }
            this.stateManager.updateSiteLoginStatus(this.site.destination, 'logged-out');
        } catch (error) {
            console.error(chalk.red(`Error closing browser for ${this.site.name}:`), error);
        }
    }
} 