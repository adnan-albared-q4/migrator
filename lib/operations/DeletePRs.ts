import { BaseASPXContentDeleter } from './base/BaseASPXContentDeleter';
import { SiteConfig } from '../core/types';
import { LoginManager } from '../core/LoginManager';
import chalk from 'chalk';
import { Page } from 'puppeteer';

/**
 * DeletePRs class for deleting press release content items from ASPX pages
 */
export class DeletePRs extends BaseASPXContentDeleter {
    // Section ID for press releases
    protected sectionId = 'de305d4f-2c81-4acf-975a-b859e43248c8';
    protected contentTypeName = 'Press Release';

    // Define selectors for PR-specific elements
    protected readonly selectors = {
        table: 'table.grid-list',
        rows: 'table.grid-list tr:not(.DataGridHeader):not(.DataGridPager)',
        editLinks: 'a.grid-list-action-edit',
        statusSpan: 'span[id*="lblStatus"]',
        deleteComment: 'textarea[id$="txtComments"]',
        deleteButton: 'a[id$="btnDelete"]'
        // Add any PR-specific selectors here
    };

    constructor(site: SiteConfig, loginManager?: LoginManager) {
        super(site, loginManager);
        // Default to debug mode for testing
        // this.enableDebugMode();
    }

    /**
     * Override discoverItems to handle any PR-specific logic
     */
    protected async discoverItems(page: Page) {
        // Log that we're in the PR-specific version
        console.log(chalk.blue(`Discovering press release items to delete for ${this.site.name}`));
        
        // Use the base implementation
        return super.discoverItems(page);
    }

    /**
     * Override deleteItem if needed for PR-specific deletion
     */
    protected async deleteItem(page: Page, item: any): Promise<boolean> {
        // Log that we're in the PR-specific version
        console.log(chalk.blue(`Deleting press release item: ${item.title}`));
        
        // Use the base implementation
        return super.deleteItem(page, item);
    }
} 