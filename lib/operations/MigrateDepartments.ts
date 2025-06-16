import { Base } from './Base';
import { SiteConfig } from '../core/types';
import { Page } from 'puppeteer';
import chalk from 'chalk';
import { LoginManager } from '../core/LoginManager';
import { waitTillHTMLRendered } from '../helpers/Puppeteer';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getSafeSiteDirName } from '../helpers/siteName';

/**
 * Interface for department information
 */
interface Department {
    name: string;
    lastModifiedBy: string;
    status: string;
    editUrl: string;
}

/**
 * MigrateDepartments Operation
 * 
 * Migrates departments from source to destination site.
 * This operation requires that the ScrapePerson operation
 * has already been run to collect data from the source site.
 */
export class MigrateDepartments extends Base {
    private readonly sectionId = 'e75c9967-5a03-4708-98a9-c9f83b19786f';
    private readonly languageId = 1;

    // Selectors for the department list page
    private readonly selectors = {
        departmentTable: 'table.grid-list',
        departmentRows: 'table.grid-list tr:not(.DataGridHeader)',
        departmentName: 'td:nth-child(2)',
        lastModifiedBy: 'td:nth-child(3)',
        status: 'td:nth-child(4)',
        editLink: 'td:nth-child(1) a',
        addNewButton: '[id$="_btnAddNew_submitButton"]',
        departmentNameInput: '[id$="_txtDepartmentName"]',
        saveButton: '[id$="_btnSave"]'
    };

    constructor(site: SiteConfig, loginManager?: LoginManager) {
        super(site, loginManager);
    }

    /**
     * Loads department names from the source site's JSON file
     */
    private loadSourceDepartments(): string[] {
        try {
            const dataDir = join(process.cwd(), 'data', getSafeSiteDirName(this.site.name), 'persons');
            const filePath = join(dataDir, 'persons.json');
            
            if (!existsSync(filePath)) {
                console.log(chalk.yellow(`No previously scraped data found at ${filePath}`));
                console.log(chalk.yellow('Please run the ScrapePerson operation first'));
                return [];
            }
            
            const fileContent = readFileSync(filePath, 'utf8');
            const data = JSON.parse(fileContent);
            
            const departments = data.departments.map((dept: any) => dept.name);
            console.log(chalk.green(`Loaded ${departments.length} departments from source data`));
            return departments;
        } catch (error) {
            console.error(chalk.red('Error loading source departments:'), error);
            return [];
        }
    }

    /**
     * Finds departments that exist in source but not in destination
     */
    private findMissingDepartments(sourceDepts: string[], existingDepts: Department[]): string[] {
        const existingNames = existingDepts.map(dept => dept.name);
        const missingDepts = sourceDepts.filter(name => !existingNames.includes(name));
        
        console.log(chalk.blue(`Found ${missingDepts.length} departments that need to be created`));
        if (missingDepts.length > 0) {
            console.log(chalk.blue('\nDepartments to be created:'));
            missingDepts.forEach((dept, index) => {
                console.log(chalk.green(`${index + 1}. ${dept}`));
            });
        }
        
        return missingDepts;
    }

    /**
     * Navigates to the Department List page
     */
    private async navigateToDepartmentList(page: Page): Promise<boolean> {
        try {
            const url = `https://${this.site.destination}.s4.q4web.com/admin/default.aspx?LanguageId=${this.languageId}&SectionId=${this.sectionId}`;
            console.log(chalk.blue(`Navigating to Department List page: ${url}`));
            
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            await waitTillHTMLRendered(page);

            // Verify we're on the correct page
            const departmentTable = await page.$(this.selectors.departmentTable);
            if (!departmentTable) {
                console.log(chalk.red('Could not find department table - might not be on the correct page'));
                return false;
            }

            console.log(chalk.green('Successfully navigated to Department List page'));
            return true;
        } catch (error) {
            console.error(chalk.red('Error navigating to Department List page:'), error);
            return false;
        }
    }

    /**
     * Creates a single department
     */
    private async createDepartment(page: Page, deptName: string): Promise<boolean> {
        try {
            console.log(chalk.blue(`Creating department: ${deptName}`));
            
            // Click Add New button
            const addButton = await page.$(this.selectors.addNewButton);
            if (!addButton) {
                throw new Error('Could not find Add New button');
            }
            await addButton.click();
            await waitTillHTMLRendered(page);

            // Fill department name
            const nameInput = await page.$(this.selectors.departmentNameInput);
            if (!nameInput) {
                throw new Error('Could not find department name input');
            }
            await nameInput.type(deptName);

            // Click Save button
            const saveButton = await page.$(this.selectors.saveButton);
            if (!saveButton) {
                throw new Error('Could not find Save button');
            }
            await saveButton.click();
            await waitTillHTMLRendered(page);

            // Wait for success message
            const successText = await page.evaluate(() => {
                const elements = Array.from(document.querySelectorAll('*'));
                return elements.find(el => el.textContent?.includes('The item was saved successfully'));
            });

            if (!successText) {
                throw new Error('Could not find success message after saving');
            }

            console.log(chalk.green(`Successfully created department: ${deptName}`));
            return true;
        } catch (error) {
            console.error(chalk.red(`Error creating department ${deptName}:`), error);
            return false;
        }
    }

    /**
     * Gets existing departments from the destination site
     */
    private async getExistingDepartments(page: Page): Promise<Department[]> {
        try {
            // Extract department information from the table
            const departments = await page.evaluate((selectors) => {
                const rows = Array.from(document.querySelectorAll(selectors.departmentRows));
                const results: Department[] = [];
                
                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    const nameCell = row.querySelector(selectors.departmentName);
                    const lastModifiedCell = row.querySelector(selectors.lastModifiedBy);
                    const statusCell = row.querySelector(selectors.status);
                    const editCell = row.querySelector(selectors.editLink) as HTMLAnchorElement;
                    
                    if (nameCell && lastModifiedCell && statusCell && editCell) {
                        const name = nameCell.textContent?.trim() || '';
                        const lastModifiedBy = lastModifiedCell.textContent?.trim() || '';
                        const status = statusCell.textContent?.trim() || '';
                        const editUrl = editCell.href || '';
                        
                        // Only include active departments
                        if (name && editUrl && !status.includes('Inactive')) {
                            results.push({ name, lastModifiedBy, status, editUrl });
                        }
                    }
                }
                
                return results;
            }, this.selectors);

            console.log(chalk.green(`Found ${departments.length} active departments`));
            departments.forEach(dept => {
                console.log(chalk.blue(`- ${dept.name} (${dept.status})`));
            });

            return departments;
        } catch (error) {
            console.error(chalk.red(`Error getting existing departments: ${error}`));
            return [];
        }
    }

    public async execute(): Promise<boolean> {
        try {
            // Load source departments
            const sourceDepartments = this.loadSourceDepartments();
            if (sourceDepartments.length === 0) {
                console.log(chalk.yellow('No source departments found. Please run the scrape operation first.'));
                return false;
            }

            const page = await this.getPage();
            if (!page) {
                throw new Error('Failed to initialize page');
            }

            // Navigate to Department List page
            if (!await this.navigateToDepartmentList(page)) {
                throw new Error('Failed to navigate to Department List page');
            }

            // Get existing departments from CMS
            const existingDepartments = await this.getExistingDepartments(page);

            // Find missing departments
            const missingDepartments = this.findMissingDepartments(sourceDepartments, existingDepartments);
            if (missingDepartments.length === 0) {
                console.log(chalk.green('All departments already exist on destination site. Nothing to create.'));
                return true;
            }

            // Create missing departments
            let successCount = 0;
            let failureCount = 0;
            for (let i = 0; i < missingDepartments.length; i++) {
                const deptName = missingDepartments[i];
                console.log(chalk.blue(`Creating department ${i + 1}/${missingDepartments.length}: ${deptName}`));
                if (await this.createDepartment(page, deptName)) {
                    successCount++;
                    if (i < missingDepartments.length - 1) {
                        if (!await this.navigateToDepartmentList(page)) {
                            throw new Error('Failed to navigate back to Department List page');
                        }
                    }
                } else {
                    failureCount++;
                }
            }

            console.log(chalk.green(`\nDepartment creation complete!`));
            console.log(chalk.green(`Successfully created ${successCount} departments`));
            if (failureCount > 0) {
                console.log(chalk.yellow(`Failed to create ${failureCount} departments`));
            }

            return successCount > 0;
        } catch (error) {
            console.error(chalk.red(`Error in MigrateDepartments: ${error}`));
            return false;
        }
    }
} 