import { BaseASPXContentDeleter } from './base/BaseASPXContentDeleter';
import { SiteConfig } from '../core/types';
import { LoginManager } from '../core/LoginManager';
import chalk from 'chalk';
import { Page } from 'puppeteer';

/**
 * DeleteFinancials class for deleting financial content items from ASPX pages
 */
export class DeleteFinancials extends BaseASPXContentDeleter {
    // Section ID for financials
    protected sectionId = 'a485c91e-b42c-4337-aa04-dce8806e2f07';
    protected contentTypeName = 'Financial';

    // Define selectors for financials-specific elements
    protected readonly selectors = {
        table: 'table.grid-list',
        rows: 'table.grid-list tr:not(.DataGridHeader):not(.DataGridPager)',
        editLinks: 'a.grid-list-action-edit',
        statusSpan: 'span[id*="lblStatus"]',
        deleteComment: 'textarea[id$="txtComments"]',
        deleteButton: 'a[id$="btnDelete"]'
        // Add any financials-specific selectors here
    };

    constructor(site: SiteConfig, loginManager?: LoginManager) {
        super(site, loginManager);
        // Default to debug mode for testing
        // this.enableDebugMode();
    }

    /**
     * Override discoverItems to handle any financials-specific logic
     */
    protected async discoverItems(page: Page) {
        // Log that we're in the financials-specific version
        console.log(chalk.blue(`Discovering financial items to delete for ${this.site.name}`));
        
        // Use the base implementation
        return super.discoverItems(page);
    }

    /**
     * Override deleteItem if needed for financials-specific deletion
     */
    protected async deleteItem(page: Page, item: any): Promise<boolean> {
        // Log that we're in the financials-specific version
        console.log(chalk.blue(`Deleting financial item: ${item.title}`));
        
        // Use the base implementation
        return super.deleteItem(page, item);
    }
} 