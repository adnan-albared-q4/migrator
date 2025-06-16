import { BaseASPXContentDeleter } from './base/BaseASPXContentDeleter';
import { SiteConfig } from '../core/types';
import { LoginManager } from '../core/LoginManager';
import chalk from 'chalk';
import { Page } from 'puppeteer';

/**
 * DeletePresentations class for deleting presentation content items from ASPX pages
 */
export class DeletePresentations extends BaseASPXContentDeleter {
    // Section ID for presentations
    protected sectionId = 'd67c52db-ae0f-44ef-b62c-e2c8946192d6';
    protected contentTypeName = 'Presentation';

    // Define selectors for presentations-specific elements
    protected readonly selectors = {
        table: 'table.grid-list',
        rows: 'table.grid-list tr:not(.DataGridHeader):not(.DataGridPager)',
        editLinks: 'a.grid-list-action-edit',
        statusSpan: 'span[id*="lblStatus"]',
        deleteComment: 'textarea[id$="txtComments"]',
        deleteButton: 'a[id$="btnDelete"]'
        // Add any presentations-specific selectors here
    };

    constructor(site: SiteConfig, loginManager?: LoginManager) {
        super(site, loginManager);
        // Default to debug mode for testing
        // this.enableDebugMode();
    }

    /**
     * Override discoverItems to handle any presentations-specific logic
     */
    protected async discoverItems(page: Page) {
        // Log that we're in the presentations-specific version
        console.log(chalk.blue(`Discovering presentation items to delete for ${this.site.name}`));
        
        // Use the base implementation
        return super.discoverItems(page);
    }

    /**
     * Override deleteItem if needed for presentations-specific deletion
     */
    protected async deleteItem(page: Page, item: any): Promise<boolean> {
        // Log that we're in the presentations-specific version
        console.log(chalk.blue(`Deleting presentation item: ${item.title}`));
        
        // Use the base implementation
        return super.deleteItem(page, item);
    }
} 