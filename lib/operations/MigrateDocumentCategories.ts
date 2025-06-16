import { Base } from './Base';
import { SiteConfig } from '../core/types';
import { Page } from 'puppeteer';
import chalk from 'chalk';
import { LoginManager } from '../core/LoginManager';
import { waitTillHTMLRendered } from '../helpers/Puppeteer';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Interface for document category items
 */
interface DocumentCategory {
    lookupText: string;
    lookupValue: string;
}

/**
 * MigrateDocumentCategories Operation
 * 
 * Compares document categories between source and destination sites,
 * then creates any missing categories on the destination site.
 * This operation requires that the ScrapeDocumentCategories operation
 * has already been run to collect data from the source site.
 */
export class MigrateDocumentCategories extends Base {
    private readonly sectionId = '00bbf942-b2c8-4bf8-9c40-76e2cc1ff0c7';
    private readonly lookupType = 'DocumentCategory';
    private readonly languageId = 1;
    private isDebugMode = false;

    // Selectors for the document categories pages
    private readonly selectors = {
        // List page selectors
        table: 'table.grid-list',
        rows: 'table.grid-list tr:not(.DataGridHeader)',
        cellLookupText: 'td:nth-child(2)',
        cellLookupValue: 'td:nth-child(3)',
        addNewButton: 'input[id="_ctrl0_ctl19_btnAddNew_submitButton"]',
        
        // Form selectors
        lookupTypeInput: '#_ctrl0_ctl19_txtLookupType',
        lookupTextInput: '#_ctrl0_ctl19_txtLookupText',
        lookupValueInput: '#_ctrl0_ctl19_txtLookupValue',
        additionalInfoInput: '#_ctrl0_ctl19_txtAdditionalInfo',
        activeCheckbox: '#_ctrl0_ctl19_chkActive',
        commentsInput: '#_ctrl0_ctl19_ctl00_txtComments',
        saveButton: '#_ctrl0_ctl19_ctl00_btnSaveAndSubmit'
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
     * Loads document categories previously scraped from the source site
     */
    private loadSourceCategories(): DocumentCategory[] {
        try {
            const dataDir = join(process.cwd(), 'data', this.site.name);
            const filePath = join(dataDir, 'lookup_list.json');
            
            if (!existsSync(filePath)) {
                console.log(chalk.yellow(`No previously scraped data found at ${filePath}`));
                console.log(chalk.yellow('Please run the ScrapeDocumentCategories operation first'));
                return [];
            }
            
            const fileContent = readFileSync(filePath, 'utf8');
            const categories = JSON.parse(fileContent) as DocumentCategory[];
            
            console.log(chalk.green(`Loaded ${categories.length} document categories from previously scraped data`));
            return categories;
        } catch (error) {
            console.error(chalk.red('Error loading source categories:'), error);
            return [];
        }
    }

    /**
     * Navigates to the document categories page on the destination site
     */
    private async navigateToDocumentCategories(page: Page): Promise<boolean> {
        try {
            await this.debugStep('Navigating to document categories page on destination site');
            
            const url = `https://${this.site.destination}.s4.q4web.com/admin/default.aspx?LookupType=${this.lookupType}&LanguageId=${this.languageId}&SectionId=${this.sectionId}`;
            console.log(chalk.blue(`Navigating to document categories page: ${url}`));
            
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            await waitTillHTMLRendered(page);
            
            // Check if we're on the correct page by looking for the table
            try {
                await page.waitForSelector(this.selectors.table, { timeout: 10000 });
                console.log(chalk.green('Successfully loaded document categories page on destination site'));
                return true;
            } catch (error) {
                console.log(chalk.red('Could not find document categories table on destination site'));
                
                // Take a screenshot to help debug the issue
                try {
                    const screenshotPath = join(process.cwd(), 'data', this.site.name, 'debug-dest-categories-page.png');
                    await page.screenshot({ path: screenshotPath });
                    console.log(chalk.yellow(`Screenshot saved to ${screenshotPath}`));
                } catch (screenshotError) {
                    console.log(chalk.red(`Failed to save screenshot: ${screenshotError}`));
                }
                
                return false;
            }
        } catch (error) {
            console.error(chalk.red('Error navigating to document categories on destination site:'), error);
            return false;
        }
    }

    /**
     * Extracts document categories from the destination site
     */
    private async extractDestinationCategories(page: Page): Promise<DocumentCategory[]> {
        await this.debugStep('Extracting document categories from destination site');
        
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
            
            console.log(chalk.green(`Extracted ${categories.length} document categories from destination site`));
            
            // Log each category for verification if in debug mode
            if (this.isDebugMode) {
                categories.forEach((category, index) => {
                    console.log(chalk.cyan(`Destination Category ${index + 1}: ${category.lookupText} = ${category.lookupValue}`));
                });
            }
            
            return categories;
        } catch (error) {
            console.error(chalk.red('Error extracting destination categories:'), error);
            return [];
        }
    }

    /**
     * Compares source and destination categories to find missing ones
     */
    private findMissingCategories(sourceCategories: DocumentCategory[], destCategories: DocumentCategory[]): DocumentCategory[] {
        // Find categories that exist in source but not in destination
        const missingCategories = sourceCategories.filter(sourceCategory => {
            return !destCategories.some(destCategory => 
                destCategory.lookupValue === sourceCategory.lookupValue
            );
        });
        
        console.log(chalk.blue(`Found ${missingCategories.length} categories that need to be created on destination site`));
        
        // Log the missing categories in detail
        if (missingCategories.length > 0) {
            console.log(chalk.blue('\nCategories to be created:'));
            missingCategories.forEach((category, index) => {
                console.log(chalk.green(`${index + 1}. Lookup Text: "${category.lookupText}", Lookup Value: "${category.lookupValue}"`));
            });
            console.log(); // Empty line for spacing
        }
        
        return missingCategories;
    }

    /**
     * Navigates to the document categories list page
     */
    private async navigateToLookupListPage(page: Page): Promise<boolean> {
        try {
            await this.debugStep('Navigating to lookup list page');
            
            const url = `https://${this.site.destination}.s4.q4web.com/admin/default.aspx?LookupType=${this.lookupType}&LanguageId=${this.languageId}&SectionId=${this.sectionId}`;
            console.log(chalk.blue(`Navigating to lookup list page: ${url}`));
            
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            await waitTillHTMLRendered(page);
            
            // Check if we're on the correct page by looking for the table
            try {
                await page.waitForSelector(this.selectors.table, { timeout: 10000 });
                console.log(chalk.green('Successfully loaded lookup list page'));
                return true;
            } catch (error) {
                console.log(chalk.red('Could not find lookup list table'));
                return false;
            }
        } catch (error) {
            console.error(chalk.red('Error navigating to lookup list page:'), error);
            return false;
        }
    }

    /**
     * Waits for a page to settle after navigation
     */
    private async waitForPageToSettle(page: Page, expectedSelector: string, timeout = 10000): Promise<boolean> {
        try {
            await this.debugStep(`Waiting for page to settle (looking for ${expectedSelector})`);
            
            // Wait for network to be idle
            await page.waitForNavigation({ 
                waitUntil: 'networkidle0', 
                timeout: timeout 
            }).catch(err => {
                console.log(chalk.yellow(`Navigation timeout waiting for network idle: ${err.message}`));
                // We'll continue anyway and check for the selector
            });
            
            // Wait for HTML to be fully rendered
            await waitTillHTMLRendered(page);
            
            // Wait for the expected selector to appear
            await page.waitForSelector(expectedSelector, { timeout: timeout });
            
            console.log(chalk.green('Page has settled successfully'));
            return true;
        } catch (error) {
            console.log(chalk.red(`Error waiting for page to settle: ${error}`));
            return false;
        }
    }

    /**
     * Retries finding and clicking the AddNew button with increasing timeouts
     */
    private async findAndClickAddNewButton(page: Page): Promise<boolean> {
        await this.debugStep('Looking for Add New button with retry logic');
        
        const maxAttempts = 3;
        const timeouts = [5000, 10000, 15000]; // Increasing timeouts for retries
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                console.log(chalk.blue(`Attempt ${attempt + 1}/${maxAttempts} to find Add New button`));
                
                // Wait for the button with current timeout
                await page.waitForSelector(this.selectors.addNewButton, { 
                    timeout: timeouts[attempt],
                    visible: true 
                });
                
                console.log(chalk.green('Add New button found'));
                
                // Take a screenshot if in debug mode
                if (this.isDebugMode) {
                    const screenshotPath = join(process.cwd(), 'data', this.site.name, `add-new-button-found-${Date.now()}.png`);
                    await page.screenshot({ path: screenshotPath });
                    console.log(chalk.cyan(`Screenshot saved to ${screenshotPath}`));
                }
                
                // Click Add New button and wait for navigation
                console.log(chalk.blue('Clicking Add New button to create a new category'));
                
                // Use a more reliable click approach
                await Promise.all([
                    page.evaluate((selector) => {
                        const button = document.querySelector(selector) as HTMLInputElement;
                        if (button) {
                            button.click();
                            return true;
                        }
                        return false;
                    }, this.selectors.addNewButton),
                    page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 })
                ]);
                
                // Wait for the form page to fully load and settle
                const formLoaded = await this.waitForPageToSettle(page, this.selectors.lookupTypeInput, 20000);
                
                if (!formLoaded) {
                    console.log(chalk.yellow('Form page did not load properly after clicking Add New button, will retry'));
                    continue;
                }
                
                console.log(chalk.green('Successfully navigated to the edit form'));
                return true;
                
            } catch (error) {
                console.log(chalk.yellow(`Attempt ${attempt + 1} failed: ${error}`));
                
                // Take a screenshot to help debug
                try {
                    const screenshotPath = join(process.cwd(), 'data', this.site.name, `add-new-button-error-${attempt + 1}.png`);
                    await page.screenshot({ path: screenshotPath });
                    console.log(chalk.yellow(`Screenshot saved to ${screenshotPath}`));
                } catch (screenshotError) {
                    console.log(chalk.red(`Failed to save screenshot: ${screenshotError}`));
                }
                
                // On last attempt, return failure
                if (attempt === maxAttempts - 1) {
                    console.log(chalk.red('All attempts to find and click Add New button failed'));
                    return false;
                }
                
                // Refresh the page before retrying
                console.log(chalk.blue('Refreshing page before retry...'));
                await this.navigateToLookupListPage(page);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        return false;
    }

    /**
     * Creates a single category on the destination site
     */
    private async createCategory(page: Page, category: DocumentCategory): Promise<boolean> {
        try {
            await this.debugStep(`Creating category: ${category.lookupText} = ${category.lookupValue}`);
            
            // First navigate to the lookup list page
            if (!await this.navigateToLookupListPage(page)) {
                throw new Error('Failed to navigate to lookup list page');
            }
            
            // Find and click the Add New button with retry logic
            console.log(chalk.blue(`Attempting to find and click the Add New button for category: ${category.lookupValue}`));
            const success = await this.findAndClickAddNewButton(page);
            
            if (!success) {
                throw new Error('Failed to navigate to edit page using Add New button after multiple attempts');
            }
            
            // Fill the form fields
            console.log(chalk.blue(`Filling form for category: ${category.lookupValue}`));
            
            // Fill Lookup Type
            await this.debugStep('Filling Lookup Type');
            await page.type(this.selectors.lookupTypeInput, 'DocumentCategory');
            
            // Fill Lookup Text
            await this.debugStep('Filling Lookup Text');
            await page.type(this.selectors.lookupTextInput, category.lookupText);
            
            // Fill Lookup Value
            await this.debugStep('Filling Lookup Value');
            await page.type(this.selectors.lookupValueInput, category.lookupValue);
            
            // Make sure Active checkbox is checked
            await this.debugStep('Ensuring Active checkbox is checked');
            await page.evaluate((selector) => {
                const checkbox = document.querySelector(selector) as HTMLInputElement;
                if (checkbox && !checkbox.checked) {
                    checkbox.checked = true;
                }
            }, this.selectors.activeCheckbox);
            
            // Add comment
            await this.debugStep('Adding comment');
            await page.type(this.selectors.commentsInput, 'Migrated from source site');
            
            // Click save button and wait for navigation
            await this.debugStep('Clicking Save & Submit button');
            console.log(chalk.blue(`Saving category: ${category.lookupValue}`));
            
            // Click the save button and wait for navigation to complete
            await Promise.all([
                page.click(this.selectors.saveButton),
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 })
            ]);
            
            // The CMS automatically redirects to the Lookup List after saving
            // Wait for the list page to fully load
            await this.waitForPageToSettle(page, this.selectors.table, 15000);
            
            console.log(chalk.green(`Successfully created category: ${category.lookupValue}`));
            return true;
        } catch (error) {
            console.error(chalk.red(`Error creating category ${category.lookupValue}:`), error);
            return false;
        }
    }

    /**
     * Main execution method
     */
    async execute(): Promise<boolean> {
        try {
            console.log(chalk.blue(`\nMigrating document categories for ${this.site.name}`));
            
            // Step 1: Load previously scraped source categories
            const sourceCategories = this.loadSourceCategories();
            if (sourceCategories.length === 0) {
                console.log(chalk.yellow('No source categories found. Please run the scrape operation first.'));
                return false;
            }
            
            // Step 2: Get page and navigate to destination site
            const page = await this.getPage();
            if (!page) {
                throw new Error('Failed to initialize page');
            }
            
            // Step 3: Navigate to document categories page on destination site
            if (!await this.navigateToDocumentCategories(page)) {
                throw new Error('Failed to navigate to document categories page on destination site');
            }
            
            // Step 4: Extract existing categories from destination site
            const destinationCategories = await this.extractDestinationCategories(page);
            if (destinationCategories.length === 0) {
                console.log(chalk.yellow('No destination categories found. This might be expected for a new site.'));
            }
            
            // Step 5: Compare categories to find missing ones
            const missingCategories = this.findMissingCategories(sourceCategories, destinationCategories);
            if (missingCategories.length === 0) {
                console.log(chalk.green('All categories already exist on destination site. Nothing to migrate.'));
                return true;
            }
            
            // Step 6: Create missing categories
            console.log(chalk.blue(`Creating ${missingCategories.length} missing categories...`));
            
            let successCount = 0;
            let failureCount = 0;
            
            for (let i = 0; i < missingCategories.length; i++) {
                const category = missingCategories[i];
                console.log(chalk.blue(`Creating category ${i + 1}/${missingCategories.length}: ${category.lookupValue}`));
                
                if (await this.createCategory(page, category)) {
                    successCount++;
                } else {
                    failureCount++;
                }
                
                // Wait a bit longer between category creations to ensure page is settled
                if (i < missingCategories.length - 1) {
                    console.log(chalk.blue('Waiting between category creations...'));
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }
            
            // Step 7: Display summary
            console.log(chalk.green(`\nMigration complete!`));
            console.log(chalk.green(`Successfully created ${successCount} categories`));
            if (failureCount > 0) {
                console.log(chalk.yellow(`Failed to create ${failureCount} categories`));
            }
            
            return failureCount === 0;
        } catch (error) {
            console.error(chalk.red(`Error migrating document categories for ${this.site.name}:`), error);
            return false;
        }
    }
} 