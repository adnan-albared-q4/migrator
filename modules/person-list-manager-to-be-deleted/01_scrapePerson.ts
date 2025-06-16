import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as puppeteer from 'puppeteer';
import settings from './_settings';
import { PersonData } from './_settings';
import { CMSService } from '../../lib/services/CMS';
import { waitTillHTMLRendered } from '../../lib/helpers/Puppeteer';
import { askQuestion, closeReadline } from '../../lib/helpers/ReadlineUtil';

dotenv.config();

// Configuration
const SECTION_ID = "08832295-eb3f-4dae-9c93-8435ba7ed7d2";

interface PersonFile {
    persons: PersonData[];
}

interface DepartmentMapping {
    departments: {
        source: string[];
        destination?: string[];
        mapping?: { [key: string]: string };
    };
}

interface PersonLink {
    name: string;
    department: string;
    editUrl: string;
    status: string;
}

interface Department {
    id: string;
    name: string;
}

const selectors = {
    personList: {
        departmentSelect: '#_ctrl0_ctl19_ddlDepartment',
        table: '#_ctrl0_ctl19_UCPersons_dataGrid',
        tableRows: '#_ctrl0_ctl19_UCPersons_dataGrid tr',
        editLinks: '.grid-list-action-icon.grid-list-action-edit',
        statusCells: '.ToDoListLabel',
        nameColumn: '.DataGridItemBorder',
        personRow: '#_ctrl0_ctl19_UCPersons_dataGrid tr:not(:first-child)',
        editLink: '.grid-list-action-icon.grid-list-action-edit',
        createButton: '#_ctrl0_ctl19_btnAddNew_submitButton'
    },
    editPage: {
        form: '.form-container',
        fields: {
            department: '#_ctrl0_ctl19_ddlDepartment',
            firstName: '#_ctrl0_ctl19_txtFirstName',
            lastName: '#_ctrl0_ctl19_txtLastName',
            title: '#_ctrl0_ctl19_txtTitle',
            description: '#_ctrl0_ctl19_txtDescription',
            tags: '#_ctrl0_ctl19_TagSelection_txtTags',
            active: '#_ctrl0_ctl19_chkActive'
        }
    },
    personEdit: {
        firstName: '#_ctrl0_ctl19_txtFirstName',
        lastName: '#_ctrl0_ctl19_txtLastName',
        title: '#_ctrl0_ctl19_txtTitle',
        description: '#_ctrl0_ctl19_txtDescription',
        active: '#_ctrl0_ctl19_chkActive',
        tags: '#_ctrl0_ctl19_TagSelection_txtTags',
        photo: {
            input: '#_ctrl0_ctl19_UCPhotoPath_txtImage',
            img: '#_ctrl0_ctl19_UCPhotoPath_imgImage'
        },
        thumbnail: {
            input: '#_ctrl0_ctl19_UCThumbnailPath_txtImage',
            img: '#_ctrl0_ctl19_UCThumbnailPath_imgImage'
        }
    }
} as const;

type PageState = 'landing' | 'personList' | 'edit';

async function quickCheck(page: puppeteer.Page, selector: string): Promise<boolean> {
    try {
        const element = await page.$(selector);
        return !!element;
    } catch {
        return false;
    }
}

async function detectCurrentPage(page: puppeteer.Page): Promise<PageState> {
    // Check for person list page
    const hasPersonList = await quickCheck(page, selectors.personList.departmentSelect) &&
                         await quickCheck(page, selectors.personList.table);
    if (hasPersonList) return 'personList';

    // Check for edit page
    const hasEditForm = await quickCheck(page, selectors.editPage.form) &&
                       await quickCheck(page, selectors.editPage.fields.firstName);
    if (hasEditForm) return 'edit';

    return 'landing';
}

async function navigateToPage(page: puppeteer.Page, targetState: PageState, sectionId: string, maxAttempts = 3): Promise<boolean> {
    const startTime = Date.now();
    const currentState = await detectCurrentPage(page);
    if (currentState === targetState) return true;

    console.log(`Navigating from ${currentState} to ${targetState}...`);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (attempt > 0) {
            console.log(`Retrying navigation to ${targetState} (attempt ${attempt + 1}/${maxAttempts})`);
        }

        try {
            switch (targetState) {
                case 'personList':
                    if (currentState === 'landing') {
                        const baseUrl = settings.baseUrlToCreateTo;
                        if (!baseUrl) {
                            throw new Error('baseUrlToCreateTo is not defined in settings');
                        }
                        const personListUrl = new URL(baseUrl.toString());
                        personListUrl.pathname = '/admin/default.aspx';
                        personListUrl.search = `?LanguageId=1&SectionId=${sectionId}`;
                        await page.goto(personListUrl.toString());
                        await waitTillHTMLRendered(page);
                    }
                    break;

                case 'edit':
                    if (currentState === 'personList') {
                        await page.waitForSelector(selectors.personList.editLinks);
                        await page.click(selectors.personList.editLinks);
                        await waitTillHTMLRendered(page);
                    }
                    break;
            }

            const newState = await detectCurrentPage(page);
            if (newState === targetState) {
                const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                console.log(`Navigation completed in ${duration}s`);
                return true;
            }

            await page.waitForTimeout(500);
        } catch (error) {
            const err = error as Error;
            console.log(`Navigation error: ${err.message}`);
            if (attempt === maxAttempts - 1) throw err;
        }
    }

    console.log(`Failed to navigate to ${targetState} after ${maxAttempts} attempts`);
    return false;
}

async function switchDepartment(page: puppeteer.Page, departmentValue: string): Promise<boolean> {
    try {
        await page.select(selectors.personList.departmentSelect, departmentValue);
        await waitTillHTMLRendered(page);
        return true;
    } catch (error) {
        const err = error as Error;
        console.log(`Error switching department: ${err.message}`);
        return false;
    }
}

async function getDepartments(page: puppeteer.Page): Promise<Department[]> {
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
    }, selectors.personList.departmentSelect);
    return departments;
}

async function gatherAllPersonLinks(page: puppeteer.Page, sourceDepts: Department[]): Promise<PersonLink[]> {
    const allPersons: PersonLink[] = [];
    
    for (const department of sourceDepts) {
        console.log(`\nGathering links from department: ${department.name}`);
        
        // Select department and wait for change to process
        await page.select(selectors.personList.departmentSelect, department.id);
        await waitTillHTMLRendered(page);
        
        // Wait for table to update
        await page.waitForTimeout(1000); // Give time for any animations/transitions
        
        // Verify department changed correctly
        const currentDept = await page.$eval(selectors.personList.departmentSelect, (element: Element) => {
            if (!(element instanceof HTMLSelectElement)) {
                throw new Error('Element is not a select element');
            }
            return element.value;
        });
        
        if (currentDept !== department.id) {
            console.log(`Department didn't change correctly. Expected ID: ${department.id}, Got: ${currentDept}`);
            continue;
        }

        // Wait for table to be present and visible
        await page.waitForSelector(selectors.personList.table, { visible: true });
        
        // Get initial row count
        const initialRowCount = await page.$$eval(selectors.personList.personRow, (rows: Element[]) => rows.length);
        console.log(`Initial row count: ${initialRowCount}`);
        
        // Wait a bit more to ensure all rows are loaded
        await page.waitForTimeout(1000);
        
        // Get final row count and verify it's stable
        const finalRowCount = await page.$$eval(selectors.personList.personRow, (rows: Element[]) => rows.length);
        console.log(`Final row count: ${finalRowCount}`);
        
        if (finalRowCount !== initialRowCount) {
            console.log('Row count changed during loading, taking final count');
        }

        // Get all person links in this department
        const departmentPersons = await page.evaluate((selectors: any, dept: string) => {
            const rows = document.querySelectorAll(selectors.personList.personRow);
            const persons = Array.from(rows).map(row => {
                const editLink = row.querySelector(selectors.personList.editLink) as HTMLAnchorElement;
                const nameCell = row.querySelector(selectors.personList.nameColumn);
                const statusCell = row.querySelector(selectors.personList.statusCells);
                
                return {
                    name: nameCell?.textContent?.trim() || '',
                    department: dept,
                    editUrl: editLink?.href || '',
                    status: statusCell?.textContent?.trim() || ''
                };
            }).filter(p => p.editUrl && p.name); // Only keep valid entries

            return persons;
        }, selectors, department.name); // Pass the department name for display

        // Verify we got the expected number of persons
        if (departmentPersons.length !== finalRowCount) {
            console.log(`Warning: Found ${departmentPersons.length} persons but table showed ${finalRowCount} rows`);
        }

        console.log(`Found ${departmentPersons.length} persons in ${department.name}`);
        
        // Log the names for verification
        departmentPersons.forEach((person, index) => {
            console.log(`  ${index + 1}. ${person.name} (${person.status})`);
        });

        allPersons.push(...departmentPersons);
        
        // Wait a bit before switching to next department
        await page.waitForTimeout(1000);
    }

    return allPersons;
}

async function scrapePersonDetails(page: puppeteer.Page, personLink: PersonLink): Promise<PersonData | null> {
    try {
        // Navigate to person's edit page
        await page.goto(personLink.editUrl);
        await waitTillHTMLRendered(page);

        // Get person details
        const personData = await page.evaluate((selectors) => {
            const getValue = (selector: string) => {
                const element = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
                return element ? element.value : '';
            };

            const getImageInfo = () => {
                const photoInput = document.querySelector<HTMLInputElement>(selectors.personEdit.photo.input);
                const photoImg = document.querySelector<HTMLImageElement>(selectors.personEdit.photo.img);
                
                if (!photoInput || !photoInput.value || !photoImg || !photoImg.src) {
                    return undefined;
                }

                return {
                    remotePath: photoImg.src,
                    uploadPath: photoInput.value
                };
            };

            const getTags = () => {
                const tagsInput = document.querySelector<HTMLInputElement>(selectors.personEdit.tags);
                if (!tagsInput || !tagsInput.value) return [];
                return tagsInput.value.split(',').map(tag => tag.trim()).filter(Boolean);
            };

            const isActive = () => {
                const activeCheckbox = document.querySelector<HTMLInputElement>(selectors.personEdit.active);
                return activeCheckbox ? activeCheckbox.checked : false;
            };

            return {
                firstName: getValue(selectors.personEdit.firstName),
                lastName: getValue(selectors.personEdit.lastName),
                title: getValue(selectors.personEdit.title),
                description: getValue(selectors.personEdit.description),
                active: isActive(),
                department: personLink.department,
                tags: getTags(),
                image: getImageInfo()
            };
        }, selectors);

        return personData;

    } catch (error) {
        const err = error as Error;
        console.error(`Error scraping person details: ${err.message}`);
        return null;
    }
}

async function selectDepartmentsToScrape(departments: Department[]): Promise<Department[]> {
    while (true) {
        console.log('\nAvailable departments to scrape:');
        departments.forEach((dept, index) => {
            console.log(`${index + 1}: ${dept.name}`);
        });
        console.log('Enter department numbers separated by spaces (e.g., "1 3" to select first and third departments)');
        console.log('Or press Enter to select all departments');
        console.log('x: Cancel');

        const answer = await askQuestion('\nSelect departments: ');
        if (answer.toLowerCase() === 'x') return [];
        if (answer.trim() === '') return departments;

        const selectedIndices = answer.split(' ')
            .map(num => parseInt(num.trim()))
            .filter(num => !isNaN(num) && num >= 1 && num <= departments.length)
            .map(num => num - 1);

        if (selectedIndices.length === 0) {
            console.log('Invalid selection. Please enter valid department numbers.');
            continue;
        }

        // Remove duplicates
        const uniqueIndices = [...new Set(selectedIndices)];
        const selectedDepts = uniqueIndices.map(index => departments[index]);
        
        // Show selection for confirmation
        console.log('\nYou selected:');
        selectedDepts.forEach(dept => console.log(`- ${dept.name}`));
        const confirm = await askQuestion('Proceed with these departments? (y/n): ');
        
        if (confirm.toLowerCase() === 'y') {
            return selectedDepts;
        }
    }
}

export async function scrapePersons(subdomain: string) {
    if (!subdomain) {
        console.error('Usage: ts-node script.ts <subdomain>');
        return;
    }

    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--window-size=1920,1080',
            '--disable-dev-shm-usage'
        ],
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    });
    const page = await browser.newPage();

    try {
        const siteUrl = `https://${subdomain}.s4.q4web.com`;
        settings.baseUrlToCreateTo = new URL(`${siteUrl}/admin/login.aspx`);

        const cms = new CMSService({ url: settings.baseUrlToCreateTo, page });
        await cms.login();
        await waitTillHTMLRendered(page);

        // Navigate to person list to get departments
        console.log('Getting source departments...');
        if (!await navigateToPage(page, 'personList', SECTION_ID)) {
            throw new Error('Failed to reach person list page');
        }

        // Get and save source departments
        const sourceDepts = await getDepartments(page);
        console.log('Source departments:', sourceDepts.map(d => d.name));

        // Let user select which departments to scrape
        const selectedDepts = await selectDepartmentsToScrape(sourceDepts);
        if (selectedDepts.length === 0) {
            console.log('Operation cancelled');
            return;
        }

        const deptMapping: DepartmentMapping = {
            departments: {
                source: selectedDepts.map(d => d.name)
            }
        };

        fs.writeFileSync(
            path.join(__dirname, 'departments.json'),
            JSON.stringify(deptMapping, null, 2)
        );

        // First gather all person links from selected departments
        console.log('\nGathering all person links...');
        const allPersonLinks = await gatherAllPersonLinks(page, selectedDepts);
        console.log(`Found total of ${allPersonLinks.length} persons across selected departments`);

        // Now process each person's details
        const persons: PersonData[] = [];
        for (let i = 0; i < allPersonLinks.length; i++) {
            const progress = Math.round((i + 1) / allPersonLinks.length * 100);
            console.log(`\nProcessing person ${i + 1}/${allPersonLinks.length} (${progress}%)`);
            
            const personData = await scrapePersonDetails(page, allPersonLinks[i]);
            if (personData) {
                persons.push(personData);
            }
        }

        // Save scraped persons
        fs.writeFileSync(
            path.join(__dirname, 'persons.json'),
            JSON.stringify({ persons }, null, 2)
        );

        console.log(`\nSuccessfully scraped ${persons.length} persons`);

    } catch (error) {
        console.error('Error:', error);
        throw error;
    } finally {
        await page.waitForTimeout(2000);
        await browser.close();
        closeReadline(); // Make sure to close readline when done
    }
}

// Get subdomain from command line arguments if running directly
if (require.main === module) {
    const subdomain = process.argv[2];
    scrapePersons(subdomain).catch(console.error);
}