import { BaseASPXContentDeleter } from './base/BaseASPXContentDeleter';
import { SiteConfig } from '../core/types';
import { LoginManager } from '../core/LoginManager';
import chalk from 'chalk';
import { Page } from 'puppeteer';

/**
 * DeleteEvents class for deleting event content items from ASPX pages
 */
export class DeleteEvents extends BaseASPXContentDeleter {
    // Section ID for events
    protected sectionId = '044fae0a-869c-4ca8-912b-be1a292400c0';
    protected contentTypeName = 'Event';

    // Define selectors for events-specific elements
    protected readonly selectors = {
        table: 'table.grid-list',
        rows: 'table.grid-list tr:not(.DataGridHeader):not(.DataGridPager)',
        editLinks: 'a.grid-list-action-edit',
        statusSpan: 'span[id*="lblStatus"]',
        deleteComment: 'textarea[id$="txtComments"]',
        deleteButton: 'a[id$="btnDelete"]'
        // Add any events-specific selectors here
    };

    constructor(site: SiteConfig, loginManager?: LoginManager) {
        super(site, loginManager);
        // Default to debug mode for testing
        // this.enableDebugMode();
    }

    /**
     * Override discoverItems to handle any events-specific logic
     */
    protected async discoverItems(page: Page) {
        // Log that we're in the events-specific version
        console.log(chalk.blue(`Discovering event items to delete for ${this.site.name}`));
        
        // Use the base implementation
        return super.discoverItems(page);
    }

    /**
     * Override deleteItem if needed for events-specific deletion
     */
    protected async deleteItem(page: Page, item: any): Promise<boolean> {
        // Log that we're in the events-specific version
        console.log(chalk.blue(`Deleting event item: ${item.title}`));
        
        // Use the base implementation
        return super.deleteItem(page, item);
    }
} 