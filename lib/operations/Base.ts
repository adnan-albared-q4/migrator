import { SiteConfig } from '../core/types';
import { Page } from 'puppeteer';
import { LoginManager } from '../core/LoginManager';
import { StateManager } from '../core/StateManager';

export abstract class Base {
    protected loginManager: LoginManager;
    protected site: SiteConfig;
    private stateManager: StateManager;

    constructor(site: SiteConfig, loginManager?: LoginManager) {
        this.site = site;
        this.loginManager = loginManager || new LoginManager(site);
        this.stateManager = StateManager.getInstance();
    }

    abstract execute(): Promise<boolean>;

    protected async getPage(): Promise<Page | null> {
        // Check if we're already logged in
        const state = this.stateManager.getSiteState(this.site.destination);
        const existingPage = this.loginManager.getDashboardPage();
        
        if (state?.loginStatus === 'logged-in' && state.dashboardVerified && existingPage) {
            return existingPage;
        }

        // If not logged in or page not available, perform login
        const success = await this.loginManager.login();
        if (!success) {
            return null;
        }
        return this.loginManager.getDashboardPage();
    }

    async cleanup(): Promise<void> {
        // Only close if this operation owns the loginManager (wasn't passed in)
        if (!this.loginManager.isShared) {
            await this.loginManager.close();
        }
    }
} 