import { Base } from '../Base';
import { SiteConfig } from '../../core/types';
import { Page } from 'puppeteer';
import chalk from 'chalk';
import { LoginManager } from '../../core/LoginManager';
import { waitTillHTMLRendered } from '../../helpers/Puppeteer';

/**
 * Interface for content items to be deleted
 */
interface ContentItem {
    title: string;
    url: string;
    status: string;
}

/**
 * Base class for ASPX content deletion operations
 * Handles common functionality for deleting content items from ASPX pages
 */
export abstract class BaseASPXContentDeleter extends Base {
    // Must be implemented by child classes
    protected abstract sectionId: string;
    protected abstract contentTypeName: string;
    
    // Common selectors for ASPX content pages
    protected readonly selectors = {
        table: 'table.grid-list',
        rows: 'table.grid-list tr:not(.DataGridHeader):not(.DataGridPager)',
        editLinks: 'a.grid-list-action-edit',
        statusSpan: 'span[id*="lblStatus"]',
        deleteComment: 'textarea[id$="txtComments"]',
        deleteButton: 'a[id$="btnDelete"]'
    };

    private isDebugMode = false;

    constructor(site: SiteConfig, loginManager?: LoginManager) {
        super(site, loginManager);
    }

    /**
     * Debug step function to wait for user input
     */
    protected async debugStep(message: string): Promise<void> {
        if (!this.isDebugMode) return;

        console.log(chalk.cyan(`\n=== DEBUG STEP: ${message} ===`));
        console.log(chalk.cyan('Press Enter to continue...'));
        
        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });

        await new Promise<void>((resolve) => {
            readline.question('', () => {
                readline.close();
                resolve();
            });
        });
    }

    /**
     * Waits for the content table to be loaded
     */
    protected async waitForContent(page: Page): Promise<void> {
        await this.debugStep('Waiting for content table to load');
        console.log(chalk.blue(`[${this.contentTypeName}] Looking for table with selector: ${this.selectors.table}`));
        
        await waitTillHTMLRendered(page);
        
        try {
            await page.waitForSelector(this.selectors.table, { timeout: 10000 });
            const tableCount = await page.evaluate((selector) => {
                return document.querySelectorAll(selector).length;
            }, this.selectors.table);
            
            console.log(chalk.green(`[${this.contentTypeName}] Found ${tableCount} tables matching selector`));
        } catch (error) {
            console.log(chalk.red(`[${this.contentTypeName}] Error finding table: ${error}`));
            // Take screenshot for debugging
            try {
                await page.screenshot({ path: `debug-${this.contentTypeName}-table-error.png` });
                console.log(chalk.yellow(`Screenshot saved to debug-${this.contentTypeName}-table-error.png`));
            } catch (screenshotError) {
                console.log(chalk.red(`Failed to take screenshot: ${screenshotError}`));
            }
            throw error; // Re-throw to maintain original behavior
        }
    }

    /**
     * Discovers all content items that can be deleted
     */
    protected async discoverItems(page: Page): Promise<ContentItem[]> {
        await this.debugStep('Discovering content items to delete');
        console.log(chalk.blue(`[${this.contentTypeName}] Starting to discover items`));
        
        const items = await page.evaluate((selectors) => {
            console.log(`Evaluating page for items with selectors:`, selectors);
            const items: ContentItem[] = [];
            const rows = document.querySelectorAll(selectors.rows);
            console.log(`Found ${rows.length} total rows in the table`);
            
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const editLink = row.querySelector(selectors.editLinks) as HTMLAnchorElement;
                const statusSpan = row.querySelector(selectors.statusSpan);
                
                if (editLink && statusSpan) {
                    // Get the third cell for title (index 2)
                    const titleCell = row.cells[2];
                    const title = titleCell ? titleCell.textContent?.trim() || 'Unknown Title' : 'Unknown Title';
                    const status = statusSpan.textContent?.trim() || '';
                    
                    console.log(`Row ${i+1}: Title: "${title}", Status: "${status}"`);
                    
                    // Filter out items with "For Approval" status
                    if (!status.includes('For Approval')) {
                        items.push({
                            title,
                            url: editLink.href,
                            status
                        });
                        console.log(`Added item "${title}" to deletion queue`);
                    } else {
                        console.log(`Skipped item "${title}" due to "For Approval" status`);
                    }
                } else {
                    console.log(`Row ${i+1}: Missing edit link or status span`);
                }
            }
            
            return items;
        }, this.selectors);
        
        console.log(chalk.green(`[${this.contentTypeName}] Discovered ${items.length} items to delete`));
        // Log each item for verification
        items.forEach((item, index) => {
            console.log(chalk.cyan(`[${this.contentTypeName}] Item ${index+1}: "${item.title}" (Status: ${item.status})`));
        });
        
        return items;
    }

    /**
     * Clears any bucket selection inputs to ensure they're empty on submission
     */
    protected async clearBucketSelectionInputs(page: Page): Promise<void> {
        await this.debugStep('Clearing bucket selection inputs if present');
        
        // Find and clear all BucketSelection inputs
        await page.evaluate(() => {
            const bucketInputs = document.querySelectorAll('input[id*="BucketSelection"]');
            bucketInputs.forEach((input) => {
                (input as HTMLInputElement).value = '';
            });
            console.log(`Cleared ${bucketInputs.length} bucket selection inputs`);
        });
    }

    /**
     * Deletes a single content item
     */
    protected async deleteItem(page: Page, item: ContentItem): Promise<boolean> {
        try {
            await this.debugStep(`Navigating to edit page for: ${item.title}`);
            console.log(chalk.blue(`[${this.contentTypeName}] Navigating to: ${item.url}`));
            
            await page.goto(item.url, { waitUntil: 'domcontentloaded' });
            await waitTillHTMLRendered(page);
            
            console.log(chalk.blue(`[${this.contentTypeName}] Page loaded, current URL: ${page.url()}`));
            
            // Enter deletion comment
            await this.debugStep('Looking for comment field');
            console.log(chalk.blue(`[${this.contentTypeName}] Looking for comment field with selector: ${this.selectors.deleteComment}`));
            await page.waitForSelector(this.selectors.deleteComment, { timeout: 5000 });
            console.log(chalk.green(`[${this.contentTypeName}] Comment field found`));
            
            await this.debugStep('Entering deletion comment');
            console.log(chalk.blue(`[${this.contentTypeName}] Entering deletion comment`));
            await page.type(this.selectors.deleteComment, 'Deleted as part of content cleanup');
            console.log(chalk.green(`[${this.contentTypeName}] Comment entered successfully`));
            
            // Clear any bucket selection inputs before submitting
            await this.clearBucketSelectionInputs(page);
            
            // Click delete button
            await this.debugStep('Looking for delete button');
            console.log(chalk.blue(`[${this.contentTypeName}] Looking for delete button with selector: ${this.selectors.deleteButton}`));
            
            await page.waitForSelector(this.selectors.deleteButton, { timeout: 5000 });
            console.log(chalk.green(`[${this.contentTypeName}] Delete button found`));
            
            // Remove any existing dialog handlers and set up a new one
            await this.debugStep('Setting up dialog handler for confirmation');
            console.log(chalk.blue(`[${this.contentTypeName}] Setting up dialog handler`));
            
            // Remove all existing dialog handlers by creating a new listener
            // This is a safer approach in TypeScript than trying to access and remove existing listeners
            const dialogHandlerSet = new Set<boolean>();
            
            // Set up a new dialog handler that's more resilient
            const dialogPromise = new Promise<void>(resolve => {
                const handler = async (dialog: any) => {
                    // Only handle the dialog if we haven't already
                    if (!dialogHandlerSet.has(true)) {
                        dialogHandlerSet.add(true);
                        try {
                            await this.debugStep(`Handling confirmation dialog: ${dialog.message()}`);
                            console.log(chalk.blue(`[${this.contentTypeName}] Accepting dialog: "${dialog.message()}"`));
                            await dialog.accept();
                        } catch (error) {
                            console.log(chalk.yellow(`Error handling dialog: ${error}`));
                        }
                        // Clean up the handler after use
                        page.removeListener('dialog', handler);
                        resolve();
                    }
                };
                
                page.on('dialog', handler);
                
                // Add a timeout to ensure dialogPromise resolves even if no dialog appears
                setTimeout(() => {
                    if (!dialogHandlerSet.has(true)) {
                        console.log(chalk.yellow(`[${this.contentTypeName}] Dialog timeout - no dialog detected after 5 seconds`));
                        // Clean up the handler after timeout
                        page.removeListener('dialog', handler);
                        resolve();
                    }
                }, 5000); // 5-second timeout
            });
            
            await this.debugStep('Clicking delete button');
            console.log(chalk.blue(`[${this.contentTypeName}] Clicking delete button`));
            
            // Click the button and wait for both navigation and dialog handling
            console.log(chalk.blue(`[${this.contentTypeName}] Starting Promise.all for button click, navigation, and dialog handling`));
            await Promise.all([
                page.click(this.selectors.deleteButton).then(() => {
                    console.log(chalk.green(`[${this.contentTypeName}] Delete button clicked successfully`));
                }).catch((error) => {
                    console.log(chalk.red(`[${this.contentTypeName}] Error clicking delete button: ${error}`));
                    throw error; // Re-throw to maintain original behavior
                }),
                
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).then(() => {
                    console.log(chalk.green(`[${this.contentTypeName}] Navigation completed successfully`));
                }).catch((error) => {
                    // Navigation might fail if dialog handling changes the flow
                    // That's okay, we'll continue anyway
                    console.log(chalk.yellow(`[${this.contentTypeName}] Navigation timeout or error: ${error}`));
                }),
                
                dialogPromise.then(() => {
                    console.log(chalk.green(`[${this.contentTypeName}] Dialog handling completed (accepted or timed out)`));
                })
            ]);
            
            console.log(chalk.blue(`[${this.contentTypeName}] After deletion, current URL: ${page.url()}`));
            
            await this.debugStep('Waiting for page to reload after deletion');
            console.log(chalk.blue(`[${this.contentTypeName}] Waiting for HTML to be rendered after deletion`));
            await waitTillHTMLRendered(page);
            console.log(chalk.green(`[${this.contentTypeName}] Page rendered after deletion`));
            
            // Verify we're back at the list
            await this.debugStep('Verifying return to list page');
            console.log(chalk.blue(`[${this.contentTypeName}] Looking for table to verify we're back at list page`));
            
            try {
                await page.waitForSelector(this.selectors.table, { timeout: 10000 });
                console.log(chalk.green(`[${this.contentTypeName}] Table found, successfully returned to list page`));
            } catch (error) {
                console.log(chalk.red(`[${this.contentTypeName}] Error finding table: ${error}`));
                console.log(chalk.yellow(`[${this.contentTypeName}] Taking screenshot of current page state`));
                
                try {
                    await page.screenshot({ path: `debug-${this.contentTypeName}-after-delete.png` });
                    console.log(chalk.yellow(`Screenshot saved to debug-${this.contentTypeName}-after-delete.png`));
                } catch (screenshotError) {
                    console.log(chalk.red(`Failed to take screenshot: ${screenshotError}`));
                }
                
                console.log(chalk.yellow(`[${this.contentTypeName}] Current page HTML structure:`));
                const pageContent = await page.content();
                console.log(pageContent.substring(0, 500) + '... [truncated]');
                
                throw error;
            }
            
            return true;
        } catch (error) {
            await this.debugStep(`Error deleting item: ${error}`);
            console.log(chalk.yellow(`Error deleting ${this.contentTypeName}: ${item.title}`, error));
            return false;
        }
    }

    /**
     * Main execution method
     */
    async execute(): Promise<boolean> {
        try {
            const page = await this.getPage();
            if (!page) {
                throw new Error('Failed to initialize page');
            }

            await this.debugStep(`Starting deletion of ${this.contentTypeName} content`);
            
            // Navigate to content listing
            const listingUrl = `https://${this.site.destination}.s4.q4web.com/admin/default.aspx?LanguageId=1&SectionId=${this.sectionId}`;
            await this.debugStep(`Navigating to ${this.contentTypeName} listing page: ${listingUrl}`);
            await page.goto(listingUrl, { waitUntil: 'domcontentloaded' });
            await this.waitForContent(page);
            
            // Discover items to delete
            const itemsToDelete = await this.discoverItems(page);
            console.log(chalk.blue(`Found ${itemsToDelete.length} ${this.contentTypeName} items to delete`));
            
            if (itemsToDelete.length === 0) {
                console.log(chalk.green(`No ${this.contentTypeName} items to delete`));
                return true;
            }
            
            // Process deletion queue with progress tracking
            let successCount = 0;
            let failureCount = 0;
            
            for (let i = 0; i < itemsToDelete.length; i++) {
                const item = itemsToDelete[i];
                await this.debugStep(`Processing item ${i+1}/${itemsToDelete.length}: ${item.title}`);
                
                if (await this.deleteItem(page, item)) {
                    successCount++;
                    console.log(chalk.green(`Successfully deleted ${this.contentTypeName}: ${item.title} (${successCount}/${itemsToDelete.length})`));
                } else {
                    failureCount++;
                    console.log(chalk.red(`Failed to delete ${this.contentTypeName}: ${item.title}`));
                    
                    // Navigate back to listing page
                    await this.debugStep('Navigating back to listing page after failure');
                    await page.goto(listingUrl, { waitUntil: 'domcontentloaded' });
                    await this.waitForContent(page);
                }
            }
            
            console.log(chalk.green(`${this.contentTypeName} deletion complete. Successes: ${successCount}, Failures: ${failureCount}`));
            return true;

        } catch (error) {
            console.error(chalk.red(`Error in Delete${this.contentTypeName}:`, error));
            return false;
        }
    }

    /**
     * Enable debug mode
     */
    public enableDebugMode(): void {
        this.isDebugMode = true;
        console.log(chalk.cyan(`Debug mode enabled for ${this.contentTypeName} deletion - will pause for input at each step`));
    }
} 