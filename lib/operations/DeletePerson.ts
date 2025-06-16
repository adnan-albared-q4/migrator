import { Base } from './Base';
import { SiteConfig } from '../core/types';
import { Page } from 'puppeteer';
import chalk from 'chalk';
import { waitTillHTMLRendered } from '../helpers/Puppeteer';
import { LoginManager } from '../core/LoginManager';

interface Department {
    id: string;
    name: string;
}

interface PersonEntry {
    name: string;
    department: string;
    editUrl: string;
    status: string;
    lastModifiedBy: string;
}

interface DeletionQueue {
    total: number;
    departments: {
        [key: string]: PersonEntry[];
    };
}

export class DeletePerson extends Base {
    private readonly selectors = {
        personList: {
            departmentSelect: '#_ctrl0_ctl19_ddlDepartment',
            table: '#_ctrl0_ctl19_UCPersons_dataGrid',
            personRow: '#_ctrl0_ctl19_UCPersons_dataGrid tr:not(:first-child)',
            editLink: '.grid-list-action-icon.grid-list-action-edit',
            nameColumn: '.DataGridItemBorder',
            statusCells: '.ToDoListLabel'
        },
        editPage: {
            commentsField: 'textarea[id*="_txtComments"]',
            deleteButton: 'a[id*="_btnDelete"]'
        }
    };

    private readonly SECTION_ID = "08832295-eb3f-4dae-9c93-8435ba7ed7d2";
    private deletionQueue: DeletionQueue = { total: 0, departments: {} };

    constructor(site: SiteConfig, loginManager?: LoginManager) {
        super(site, loginManager);
    }

    async execute(): Promise<boolean> {
        try {
            const page = await this.getPage();
            if (!page) {
                throw new Error('Failed to initialize page');
            }

            // Phase 1: Discovery
            await this.discoveryPhase(page);
            this.logDeletionQueue();

            // Phase 2: Deletion
            await this.deletionPhase(page);

            return true;
        } catch (error) {
            console.error(chalk.red(`Error in DeletePerson: ${error}`));
            return false;
        }
    }

    private async discoveryPhase(page: Page): Promise<void> {
        await this.navigateToPersonList(page);
        console.log(chalk.blue(`\nStarting discovery phase for ${this.site.name}...`));

        const departments = await this.getDepartments(page);
        console.log(chalk.green(`Found ${departments.length} departments`));

        for (const dept of departments) {
            console.log(chalk.blue(`\nScanning department: ${dept.name}`));
            await this.switchDepartment(page, dept.id);
            const persons = await this.getPersonsInDepartment(page, dept);
            
            if (persons.length > 0) {
                this.deletionQueue.departments[dept.name] = persons;
                this.deletionQueue.total += persons.length;
            }
            
            console.log(chalk.green(`Found ${persons.length} persons in ${dept.name}`));
        }
    }

    private async deletionPhase(page: Page): Promise<void> {
        console.log(chalk.blue('\nStarting deletion phase...'));
        let processed = 0;
        const total = this.deletionQueue.total;

        for (const [deptName, persons] of Object.entries(this.deletionQueue.departments)) {
            console.log(chalk.blue(`\nProcessing department: ${deptName}`));
            
            for (const person of persons) {
                try {
                    await this.deletePerson(page, person);
                    processed++;
                    console.log(chalk.green(`Deleted ${person.name} (${processed}/${total})`));
                } catch (error) {
                    console.error(chalk.red(`Failed to delete ${person.name}: ${error}`));
                }
            }
        }

        console.log(chalk.green(`\nDeletion phase complete. Processed ${processed}/${total} entries`));
    }

    private async deletePerson(page: Page, person: PersonEntry): Promise<void> {
        // Navigate to edit page
        await page.goto(person.editUrl);
        await waitTillHTMLRendered(page);
        
        // Fill comment field
        await page.waitForSelector(this.selectors.editPage.commentsField);
        await page.type(this.selectors.editPage.commentsField, 'Deleted as part of content cleanup');
        
        // Click delete button and wait for navigation
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle0' }),
            page.click(this.selectors.editPage.deleteButton)
        ]);
    }

    private async navigateToPersonList(page: Page): Promise<void> {
        const baseUrl = `https://${this.site.destination}.s4.q4web.com`;
        const personListUrl = new URL(baseUrl);
        personListUrl.pathname = '/admin/default.aspx';
        personListUrl.search = `?LanguageId=1&SectionId=${this.SECTION_ID}`;
        
        await page.goto(personListUrl.toString());
        await this.verifyTableLoaded(page);
    }

    private async verifyTableLoaded(page: Page): Promise<void> {
        await waitTillHTMLRendered(page);
        await page.waitForSelector(this.selectors.personList.table);
        await page.waitForTimeout(1000);
    }

    private async getDepartments(page: Page): Promise<Department[]> {
        await page.waitForSelector(this.selectors.personList.departmentSelect);
        
        return await page.evaluate((selector) => {
            const select = document.querySelector<HTMLSelectElement>(selector);
            if (!select) return [];
            
            return Array.from(select.options)
                .filter(option => option.value !== '')
                .map(option => ({
                    id: option.value,
                    name: option.textContent?.trim() || ''
                }));
        }, this.selectors.personList.departmentSelect);
    }

    private async switchDepartment(page: Page, departmentId: string): Promise<void> {
        await page.select(this.selectors.personList.departmentSelect, departmentId);
        await this.verifyTableLoaded(page);
    }

    private async getPersonsInDepartment(page: Page, dept: Department): Promise<PersonEntry[]> {
        await this.verifyTableLoaded(page);
        
        return await page.evaluate((selectors, deptName) => {
            const rows = document.querySelectorAll(selectors.personList.personRow);
            return Array.from(rows).map(row => {
                const nameCell = row.querySelector('td.DataGridItemBorder');
                if (nameCell?.classList.contains('badge-content--delete')) {
                    return null;
                }

                const editLink = row.querySelector(selectors.personList.editLink) as HTMLAnchorElement;
                const cells = row.querySelectorAll('td.DataGridItemBorder');
                const statusCell = row.querySelector(selectors.personList.statusCells);
                
                return {
                    name: cells[0]?.textContent?.trim() || '',
                    department: deptName,
                    editUrl: editLink?.href || '',
                    lastModifiedBy: cells[1]?.textContent?.trim() || '',
                    status: statusCell?.textContent?.trim() || ''
                };
            }).filter((p): p is PersonEntry => p !== null && !!p.editUrl && !!p.name);
        }, this.selectors, dept.name);
    }

    private logDeletionQueue(): void {
        console.log(chalk.yellow('\nDeletion Queue Summary:'));
        console.log(chalk.yellow(`Total entries to process: ${this.deletionQueue.total}`));
    }
}