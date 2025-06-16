import { Base } from './Base';
import { SiteConfig } from '../core/types';
import { Page } from 'puppeteer';
import chalk from 'chalk';
import { LoginManager } from '../core/LoginManager';
import { waitTillHTMLRendered } from '../helpers/Puppeteer';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { getSafeSiteDirName } from '../helpers/siteName';

/**
 * Interface for document category items
 */
interface DocumentCategory {
    lookupText: string;
    lookupValue: string;
}

/**
 * ScrapeDocumentCategories Operation
 * 
 * Scrapes document categories from the source site and saves them as JSON.
 * This is different from delete operations as it accesses the source site, not the destination.
 */
export class ScrapeDocumentCategories extends Base {
    private readonly sectionId = '00bbf942-b2c8-4bf8-9c40-76e2cc1ff0c7';
    private readonly lookupType = 'DocumentCategory';
    private readonly languageId = 1;
    private isDebugMode = false;

    // Selectors for scraping the document categories
    private readonly selectors = {
        table: 'table.grid-list',
        rows: 'table.grid-list tr:not(.DataGridHeader)',
        cellLookupText: 'td:nth-child(2)',
        cellLookupValue: 'td:nth-child(3)',
    };

    constructor(site: SiteConfig, loginManager?: LoginManager) {
        super(site, loginManager);
    }

    /**
     * Enable debug mode for detailed logging
     */
    public enableDebugMode(): void {
        this.isDebugMode = true;
        console.log(chalk.cyan('Debug mode enabled - will show detailed logging'));
    }

    /**
     * Debug step function for logging
     */
    private async debugStep(message: string): Promise<void> {
        if (!this.isDebugMode) return;
        console.log(chalk.cyan(`\n=== DEBUG: ${message} ===`));
    }

    /**
     * Navigates to the document categories page on the source site
     */
    private async navigateToDocumentCategories(page: Page): Promise<boolean> {
        try {
            await this.debugStep('Navigating to document categories page');
            
            // Use source site instead of destination for scraping
            const url = `https://${this.site.source}.s4.q4web.com/admin/default.aspx?LookupType=${this.lookupType}&LanguageId=${this.languageId}&SectionId=${this.sectionId}`;
            console.log(chalk.blue(`Navigating to document categories page: ${url}`));
            
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            await waitTillHTMLRendered(page);
            
            // Check if we're on the correct page by looking for the table
            try {
                await page.waitForSelector(this.selectors.table, { timeout: 10000 });
                console.log(chalk.green('Successfully loaded document categories page'));
                return true;
            } catch (error) {
                console.log(chalk.red('Could not find document categories table'));
                
                // Take a screenshot to help debug the issue
                try {
                    const screenshotPath = join(process.cwd(), 'data', getSafeSiteDirName(this.site.name), 'debug-categories-page.png');
                    await page.screenshot({ path: screenshotPath });
                    console.log(chalk.yellow(`Screenshot saved to ${screenshotPath}`));
                } catch (screenshotError) {
                    console.log(chalk.red(`Failed to save screenshot: ${screenshotError}`));
                }
                
                return false;
            }
        } catch (error) {
            console.error(chalk.red('Error navigating to document categories:'), error);
            return false;
        }
    }

    /**
     * Extracts document categories from the page
     */
    private async extractCategories(page: Page): Promise<DocumentCategory[]> {
        await this.debugStep('Extracting document categories');
        
        try {
            // Use page.evaluate to extract data from the DOM
            const categories = await page.evaluate((selectors) => {
                const rows = document.querySelectorAll(selectors.rows);
                const results: DocumentCategory[] = [];
                
                // Process all rows
                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    
                    // Extract text from the relevant cells
                    const lookupTextCell = row.querySelector(selectors.cellLookupText);
                    const lookupValueCell = row.querySelector(selectors.cellLookupValue);
                    
                    if (lookupTextCell && lookupValueCell) {
                        const lookupText = lookupTextCell.textContent?.trim() || '';
                        const lookupValue = lookupValueCell.textContent?.trim() || '';
                        
                        // Skip the header row which contains "Lookup Text" and "Lookup Value"
                        if (lookupText === 'Lookup Text' && lookupValue === 'Lookup Value') {
                            console.log('Skipping header row');
                            continue;
                        }
                        
                        // Only add if we have both values
                        if (lookupText && lookupValue) {
                            results.push({
                                lookupText,
                                lookupValue
                            });
                        }
                    }
                }
                
                return results;
            }, this.selectors);
            
            console.log(chalk.green(`Extracted ${categories.length} document categories`));
            
            // Log each category for verification
            if (this.isDebugMode) {
                categories.forEach((category, index) => {
                    console.log(chalk.cyan(`Category ${index + 1}: ${category.lookupText} = ${category.lookupValue}`));
                });
            }
            
            return categories;
        } catch (error) {
            console.error(chalk.red('Error extracting document categories:'), error);
            return [];
        }
    }

    /**
     * Creates the data directory for the site if it doesn't exist
     */
    private ensureDataDirectoryExists(): string {
        const dataDir = join(process.cwd(), 'data');
        const siteDir = join(dataDir, getSafeSiteDirName(this.site.name));
        
        // Create directories if they don't exist
        if (!existsSync(dataDir)) {
            mkdirSync(dataDir);
        }
        
        if (!existsSync(siteDir)) {
            mkdirSync(siteDir);
        }
        
        return siteDir;
    }

    /**
     * Saves the document categories to a JSON file
     */
    private async saveResults(categories: DocumentCategory[]): Promise<boolean> {
        await this.debugStep('Saving document categories to JSON');
        
        try {
            const siteDir = this.ensureDataDirectoryExists();
            const filePath = join(siteDir, 'lookup_list.json');
            
            // Write the data as formatted JSON
            writeFileSync(filePath, JSON.stringify(categories, null, 2), 'utf8');
            
            console.log(chalk.green(`Saved ${categories.length} document categories to ${filePath}`));
            return true;
        } catch (error) {
            console.error(chalk.red('Error saving document categories:'), error);
            return false;
        }
    }

    /**
     * Main execution method
     */
    async execute(): Promise<boolean> {
        try {
            console.log(chalk.blue(`\nScraping document categories for ${this.site.name}`));
            
            // Special handling for login to use source site instead of destination
            if (!this.loginManager) {
                // Create a temporary site config that uses the source site as both source and destination
                const tempConfig = { ...this.site, destination: this.site.source };
                this.loginManager = new LoginManager(tempConfig);
            } else {
                // If a login manager was provided, create a new one with modified config
                await this.loginManager.close(); // Close the existing one
                const tempConfig = { ...this.site, destination: this.site.source };
                this.loginManager = new LoginManager(tempConfig);
            }
            
            const page = await this.getPage();
            if (!page) {
                throw new Error('Failed to initialize page');
            }
            
            // Navigate to document categories page
            if (!await this.navigateToDocumentCategories(page)) {
                throw new Error('Failed to navigate to document categories page');
            }
            
            // Extract document categories
            const categories = await this.extractCategories(page);
            if (categories.length === 0) {
                console.log(chalk.yellow('No document categories found'));
                return false;
            }
            
            // Save results to JSON
            return await this.saveResults(categories);
        } catch (error) {
            console.error(chalk.red(`Error scraping document categories for ${this.site.name}:`), error);
            return false;
        }
    }
} 