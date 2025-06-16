import { Base } from './Base';
import { SiteConfig } from '../core/types';
import { Page } from 'puppeteer';
import chalk from 'chalk';
import { LoginManager } from '../core/LoginManager';
import { waitTillHTMLRendered } from '../helpers/Puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import { getSafeSiteDirName } from '../helpers/siteName';

interface Person {
    name: string;
    lastModifiedBy: string;
    status: string;
    editUrl: string;
}

interface PersonDetails {
    department: string;
    prefix?: string;
    firstName: string;
    middleName?: string;
    lastName: string;
    suffix?: string;
    title?: string;
    description?: string;
    careerHighlights?: string;
    tags: string[];
    active?: boolean;
    editUrl: string;
}

interface DepartmentData {
    name: string;
    persons: Array<{
        firstName: string;
        lastName: string;
        suffix?: string;
        title?: string;
        description?: string;
    }>;
}

export class ScrapePerson extends Base {
    private readonly sectionId = '08832295-eb3f-4dae-9c93-8435ba7ed7d2';
    private readonly languageId = '1';
    private isDebugMode = false;

    private readonly selectors = {
        departmentSelect: '#_ctrl0_ctl19_ddlDepartment',
        personRows: '#_ctrl0_ctl19_UCPersons_dataGrid tr:not(:first-child)',
        editLink: '.grid-list-action-icon.grid-list-action-edit',
        statusCell: '.ToDoListLabel',
        nameCell: '.DataGridItemBorder',
        firstName: '#_ctrl0_ctl19_txtFirstName',
        lastName: '#_ctrl0_ctl19_txtLastName',
        suffix: '#_ctrl0_ctl19_txtSuffix',
        title: '#_ctrl0_ctl19_txtTitle',
        description: '#_ctrl0_ctl19_txtDescription',
        careerHighlights: '#_ctrl0_ctl19_txtCareerHighlights',
        tags: '#_ctrl0_ctl19_TagSelection_txtTags',
        active: '#_ctrl0_ctl19_chkActive',
        photo: {
            input: '#_ctrl0_ctl19_UCPhotoPath_txtImage',
            img: '#_ctrl0_ctl19_UCPhotoPath_imgImage'
        }
    };

    public enableDebugMode(): void {
        this.isDebugMode = true;
        console.log(chalk.cyan('Debug mode enabled - will show detailed logging'));
    }

    private debugStep(message: string): void {
        if (this.isDebugMode) {
            console.log(chalk.cyan(`[DEBUG] ${message}`));
        }
    }

    /**
     * Gets all departments from the page
     */
    private async getDepartments(page: Page): Promise<Array<{ id: string; name: string }>> {
        try {
            const departments = await page.evaluate((selector: string) => {
                const element = document.querySelector(selector);
                if (!element || !(element instanceof HTMLSelectElement)) {
                    return [];
                }
                const select = element;
                return Array.from(select.options).map(option => ({
                    id: option.value,
                    name: option.textContent?.trim() || ''
                }));
            }, this.selectors.departmentSelect);

            console.log(chalk.green(`Found ${departments.length} departments`));
            return departments;
        } catch (error) {
            console.error(chalk.red(`Error getting departments: ${error}`));
            return [];
        }
    }

    /**
     * Gets all persons for a department
     */
    private async getPersonsForDepartment(page: Page, department: { id: string; name: string }): Promise<Person[]> {
        try {
            console.log(chalk.blue(`\nGetting persons for department: ${department.name}`));
            
            // Select department and wait for change to process
            await page.select(this.selectors.departmentSelect, department.id);
            await waitTillHTMLRendered(page);
            
            // Wait for table to update
            await page.waitForTimeout(1000);
            
            // Get all persons in this department, filtering out inactive ones
            const result = await page.evaluate((selectors, deptName) => {
                const rows = Array.from(document.querySelectorAll(selectors.personRows));
                const persons = [];
                const skippedInactive = [];
                for (const row of rows) {
                    const editLink = row.querySelector(selectors.editLink);
                    const nameCell = row.querySelector(selectors.nameCell);
                    const statusCell = row.querySelector(selectors.statusCell);
                    // Check for inactive class on name cell
                    if (nameCell && nameCell.classList.contains('badge-content--inactive')) {
                        skippedInactive.push(nameCell.textContent?.trim() || '[Unknown Name]');
                        continue;
                    }
                    if (editLink && nameCell) {
                        persons.push({
                            name: nameCell.textContent?.trim() || '',
                            lastModifiedBy: '',  // Not available in the table
                            status: statusCell?.textContent?.trim() || '',
                            editUrl: editLink.href || ''
                        });
                    }
                }
                return { persons, skippedInactive };
            }, this.selectors, department.name);

            if (result.skippedInactive.length > 0) {
                for (const skippedName of result.skippedInactive) {
                    console.log(chalk.yellow(`[SKIP] Inactive person in ${department.name}: ${skippedName}`));
                }
            }

            console.log(chalk.green(`Found ${result.persons.length} active persons in ${department.name}`));
            return result.persons;
        } catch (error) {
            console.error(chalk.red(`Error getting persons for department ${department.name}: ${error}`));
            return [];
        }
    }

    /**
     * Scrapes details for a person
     */
    private async scrapePersonDetails(page: Page, editUrl: string, department: string): Promise<PersonDetails | null> {
        try {
            await this.debugStep(`Navigating to edit URL: ${editUrl}`);
            await page.goto(editUrl);
            await waitTillHTMLRendered(page);

            const personDetails = await page.evaluate((selectors, deptName, url) => {
                const getValue = (selector: string) => {
                    const element = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
                    return element ? element.value : '';
                };

                const getImageInfo = () => {
                    const photoInput = document.querySelector<HTMLInputElement>(selectors.photo.input);
                    const photoImg = document.querySelector<HTMLImageElement>(selectors.photo.img);
                    
                    if (!photoInput || !photoInput.value || !photoImg || !photoImg.src) {
                        return undefined;
                    }

                    return {
                        remotePath: photoImg.src,
                        uploadPath: photoInput.value
                    };
                };

                const getTags = () => {
                    const tagsInput = document.querySelector<HTMLInputElement>(selectors.tags);
                    if (!tagsInput || !tagsInput.value) return [];
                    return tagsInput.value.split(',').map(tag => tag.trim()).filter(Boolean);
                };

                return {
                    firstName: getValue(selectors.firstName),
                    lastName: getValue(selectors.lastName),
                    suffix: getValue(selectors.suffix),
                    title: getValue(selectors.title),
                    description: getValue(selectors.description),
                    careerHighlights: getValue(selectors.careerHighlights),
                    department: deptName,
                    tags: getTags(),
                    image: getImageInfo(),
                    editUrl: url
                };
            }, this.selectors, department, editUrl);

            // Download image if it exists
            if (personDetails.image) {
                const baseDir = path.join(process.cwd(), 'data', getSafeSiteDirName(this.site.name));
                const deptDir = path.join(baseDir, 'images', getSafeSiteDirName(department));
                const fileName = `${personDetails.firstName}_${personDetails.lastName}`.replace(/[^a-z0-9-]/gi, '_').toLowerCase() + '.jpg';
                const downloadPath = path.join(deptDir, fileName);

                // Ensure department directory exists
                fs.mkdirSync(deptDir, { recursive: true });

                // Download image
                await page.goto(personDetails.image.remotePath);
                const img = await page.$('img');
                if (img) {
                    await img.screenshot({
                        path: downloadPath,
                        type: 'jpeg',
                        quality: 100
                    });
                    console.log(chalk.green(`Downloaded image for ${personDetails.firstName} ${personDetails.lastName}`));
                }
            }

            return personDetails;
        } catch (error) {
            console.error(chalk.red(`Error scraping person details: ${error}`));
            return null;
        }
    }

    /**
     * Saves person details to a JSON file
     */
    private async savePersonDetails(departments: DepartmentData[]): Promise<void> {
        try {
            // Get the base data directory using the shared method
            const baseDir = path.join(process.cwd(), 'data', getSafeSiteDirName(this.site.name));
            
            // Create persons directory
            const personsDir = path.join(baseDir, 'persons');
            fs.mkdirSync(personsDir, { recursive: true });

            // Create images directory
            const imagesDir = path.join(baseDir, 'images');
            fs.mkdirSync(imagesDir, { recursive: true });

            // Create department directories directly under images
            for (const dept of departments) {
                const deptDir = path.join(imagesDir, getSafeSiteDirName(dept.name));
                fs.mkdirSync(deptDir, { recursive: true });
            }

            // Save all departments data in a single JSON file
            const filePath = path.join(personsDir, 'persons.json');
            fs.writeFileSync(filePath, JSON.stringify({ departments }, null, 2));
            
            console.log(chalk.green(`Saved ${departments.length} departments to ${filePath}`));
        } catch (error) {
            console.error(chalk.red(`Error saving person details: ${error}`));
        }
    }

    async execute(): Promise<boolean> {
        try {
            console.log(chalk.blue(`\nScraping persons for ${this.site.name}`));
            
            // Special handling for login to use source site instead of destination
            if (!this.loginManager) {
                const tempConfig = { ...this.site, destination: this.site.source };
                this.loginManager = new LoginManager(tempConfig);
            } else {
                await this.loginManager.close();
                const tempConfig = { ...this.site, destination: this.site.source };
                this.loginManager = new LoginManager(tempConfig);
            }
            
            const page = await this.getPage();
            if (!page) {
                throw new Error('Failed to initialize page');
            }

            // Navigate to Person List page
            const url = `https://${this.site.source}.s4.q4web.com/admin/default.aspx?LanguageId=${this.languageId}&SectionId=${this.sectionId}`;
            console.log(chalk.blue(`Navigating to Person List page: ${url}`));
            
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            await waitTillHTMLRendered(page);

            // Verify we're on the correct page
            const departmentSelect = await page.$('#_ctrl0_ctl19_ddlDepartment');
            if (!departmentSelect) {
                console.log(chalk.red('Could not find department select - might not be on the correct page'));
                return false;
            }

            console.log(chalk.green('Successfully navigated to Person List page'));

            // Get all departments
            const departments = await this.getDepartments(page);
            if (departments.length === 0) {
                console.log(chalk.yellow('No departments found'));
                return false;
            }

            // First, collect all persons from all departments
            const allDepartmentPersons = new Map<string, Person[]>();
            
            for (const dept of departments) {
                console.log(chalk.blue(`\nProcessing department: ${dept.name}`));
                const persons = await this.getPersonsForDepartment(page, dept);
                
                if (persons.length > 0) {
                    console.log(chalk.green(`Found ${persons.length} active persons in ${dept.name}`));
                    allDepartmentPersons.set(dept.name, persons);
                } else {
                    console.log(chalk.yellow(`No active persons found in ${dept.name}`));
                }
            }

            // Now, scrape details for all persons in each department
            const departmentData: DepartmentData[] = [];
            
            for (const [deptName, persons] of allDepartmentPersons) {
                console.log(chalk.blue(`\nScraping details for ${persons.length} persons in ${deptName}`));
                
                const personDetails: PersonDetails[] = [];
                for (const person of persons) {
                    const details = await this.scrapePersonDetails(page, person.editUrl, deptName);
                    if (details) {
                        personDetails.push(details);
                    }
                }

                // Transform the data for this department
                if (personDetails.length > 0) {
                    const simplifiedPersons = personDetails.map(person => ({
                        firstName: person.firstName,
                        lastName: person.lastName,
                        suffix: person.suffix || undefined,
                        title: person.title,
                        description: person.careerHighlights 
                            ? `${person.description || ''}\n\n${person.careerHighlights}`
                            : person.description
                    }));

                    departmentData.push({
                        name: deptName,
                        persons: simplifiedPersons
                    });
                }
            }

            // Save all departments data
            if (departmentData.length > 0) {
                await this.savePersonDetails(departmentData);
            }

            return true;
        } catch (error) {
            console.error(chalk.red(`Error in ScrapePerson: ${error}`));
            return false;
        }
    }
} 