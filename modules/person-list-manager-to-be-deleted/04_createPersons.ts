import settings, { PersonData } from './_settings';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as puppeteer from 'puppeteer';
import { CMSService } from '../../lib/services/CMS';
import { waitTillHTMLRendered } from '../../lib/helpers/Puppeteer';
import { askQuestion, closeReadline } from '../../lib/helpers/ReadlineUtil';
import { CommitteeMembership } from './types';

dotenv.config();

interface PersonFile {
    persons: PersonData[];
}

interface Settings {
    companies: Company[];
    baseUrlToCreateTo: URL | null;
}

interface Company {
    name: string;
    baseUrlToScrapeFrom: string;
    baseUrlToCreateTo: string;
    sectionId: string;
}

interface DepartmentMapping {
    departments: {
        source: string[];
        destination?: string[];
        mapping?: { [key: string]: string };
    };
}

// Define selector types
interface PhotoSelectors {
    input: string[];
    img: string[];
}

interface CommitteeSelectors {
    panel: string;
    nameLabels: string;
    roleRadios: (index: number, role: string) => string;
}

interface EditPageFields {
    department: string[];
    firstName: string[];
    lastName: string[];
    title: string[];
    description: string[];
    tags: string[];
    photo: PhotoSelectors;
    thumbnail: PhotoSelectors;
}

interface EditPageSelectors {
    form: string[];
    fields: EditPageFields;
    buttons: {
        save: string[];
        saveAndSubmit: string[];
        delete: string[];
        back: string[];
        cancel: string[];
        revert: string[];
    };
    messages: {
        success: string[];
    };
    committees: CommitteeSelectors;
}

interface PersonListSelectors {
    departmentSelect: string[];
    table: string[];
    tableRows: string[];
    editLinks: string[];
    statusCells: string[];
    nameColumn: string[];
    personRow: string[];
    editLink: string[];
    createButton: string[];
}

interface Selectors {
    personList: PersonListSelectors;
    editPage: EditPageSelectors;
}

interface Department {
    id: string;
    name: string;
}

function loadPersonData(): PersonData[] {
    const filePath = path.join(__dirname, 'persons.json');
    
    if (!fs.existsSync(filePath)) {
        throw new Error('persons.json file not found. Please create it in the testpersons directory.');
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(fileContent) as PersonFile;

    // Validate the data
    if (!Array.isArray(data.persons)) {
        throw new Error('Invalid JSON format: "persons" array is required');
    }

    // Validate each person entry
    data.persons.forEach((person, index) => {
        if (!person.firstName || !person.lastName) {
            throw new Error(`Invalid person data at index ${index}: firstName and lastName are required`);
        }
    });

    return data.persons;
}

function loadSettings(): Settings {
    const settingsPath = path.join(__dirname, 'settings.json');
    if (!fs.existsSync(settingsPath)) {
        throw new Error('settings.json not found. Please create it in the testpersons directory.');
    }
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
}

async function askUserAction(siteUrl: string): Promise<'create' | 'delete' | 'both' | null> {
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        console.log(`\nSite: ${siteUrl}`);
        console.log('\nPlease choose an action:');
        console.log('1: Delete existing person lists and create new ones');
        console.log('2: Create new person lists without deleting');
        console.log('d: Delete existing person lists only');
        console.log('x: Exit');
        
        readline.question('Enter your choice: ', (answer: string) => {
            readline.close();
            switch (answer.toLowerCase()) {
                case '1':
                    return resolve('both');
                case '2':
                    return resolve('create');
                case 'd':
                    return resolve('delete');
                default:
                    return resolve(null);
            }
        });
    });
}

async function askSubdomain(): Promise<string> {
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        console.log('\nPlease enter the subdomain (e.g., "company2025snprd"):');
        readline.question('Subdomain: ', (answer: string) => {
            readline.close();
            resolve(answer.trim());
        });
    });
}

type PageState = 'landing' | 'personList' | 'edit';

const selectors: Selectors = {
    personList: {
        departmentSelect: ['#_ctrl0_ctl19_ddlDepartment'],
        table: ['#_ctrl0_ctl19_UCPersons_dataGrid'],
        tableRows: ['#_ctrl0_ctl19_UCPersons_dataGrid tr'],
        editLinks: ['.grid-list-action-icon.grid-list-action-edit'],
        statusCells: ['.ToDoListLabel'],
        nameColumn: ['.DataGridItemBorder'],
        personRow: ['#_ctrl0_ctl19_UCPersons_dataGrid tr:not(:first-child)'],
        editLink: ['.grid-list-action-icon.grid-list-action-edit'],
        createButton: ['#_ctrl0_ctl19_btnAddNew_submitButton']
    },
    editPage: {
        form: ['#aspnetForm', 'form', '.form-container', '#_ctrl0_ctl19_pnlEdit'],
        fields: {
            department: ['#_ctrl0_ctl19_ddlDepartment'],
            firstName: ['#_ctrl0_ctl19_txtFirstName'],
            lastName: ['#_ctrl0_ctl19_txtLastName'],
            title: ['#_ctrl0_ctl19_txtTitle'],
            description: ['#_ctrl0_ctl19_txtDescription'],
            tags: ['#_ctrl0_ctl19_TagSelection_txtTags'],
            photo: {
                input: ['#_ctrl0_ctl19_UCPhotoPath_txtImage'],
                img: ['#_ctrl0_ctl19_UCPhotoPath_imgImage']
            },
            thumbnail: {
                input: ['#_ctrl0_ctl19_UCThumbnailPath_txtImage'],
                img: ['#_ctrl0_ctl19_UCThumbnailPath_imgImage']
            }
        },
        buttons: {
            save: ['#_ctrl0_ctl19_ctl00_btnSave'],
            saveAndSubmit: ['#_ctrl0_ctl19_ctl00_btnSaveAndSubmit'],
            delete: ['#_ctrl0_ctl19_ctl00_btnDelete'],
            back: ['#_ctrl0_ctl19_ctl00_btnBack'],
            cancel: ['#_ctrl0_ctl19_ctl00_btnCancel'],
            revert: ['#_ctrl0_ctl19_ctl00_btnRevert']
        },
        messages: {
            success: ['.message.message-success']
        },
        committees: {
            panel: '#_ctrl0_ctl19_panelCommitteeMembershipDetails',
            nameLabels: '.committee_name-label',
            roleRadios: (index: number, role: string) => 
                `#_ctrl0_ctl19_repCommitteeMemberships_ctl00_repCommitteeColumns_ctl00_repCommitteeSet_ctl${index.toString().padStart(2, '0')}_rbCommitteeRole_${role === 'Member' ? '0' : role === 'Chair' ? '1' : role === 'ViceChair' ? '2' : '3'}`
        }
    }
};

async function quickCheck(page: puppeteer.Page, selectors: string | string[]): Promise<boolean> {
    try {
        const selectorArray = Array.isArray(selectors) ? selectors : [selectors];
        for (const selector of selectorArray) {
            const element = await page.$(selector);
            if (element) return true;
        }
        return false;
    } catch {
        return false;
    }
}

async function detectCurrentPage(page: puppeteer.Page): Promise<PageState> {
    // Check for person list page
    const hasPersonList = await quickCheck(page, selectors.personList.table);
    if (hasPersonList) return 'personList';

    // Check for edit page
    const hasEditForm = await quickCheck(page, selectors.editPage.form);
    if (hasEditForm) return 'edit';

    return 'landing';
}

async function ensureLoggedIn(page: puppeteer.Page, cms: CMSService): Promise<boolean> {
    if (page.url().includes('/login')) {
        console.log('Logging in...');
        try {
            await cms.login();
            await waitTillHTMLRendered(page);
            return true;
        } catch (error) {
            const err = error as Error;
            console.error('Login failed:', err.message);
            return false;
        }
    }
    return true;
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
                        if (!settings.baseUrlToCreateTo) {
                            throw new Error('baseUrlToCreateTo is not defined in settings');
                        }
                        const personListUrl = new URL(settings.baseUrlToCreateTo.toString());
                        personListUrl.pathname = '/admin/default.aspx';
                        personListUrl.search = `?LanguageId=1&SectionId=${sectionId}`;
                        await page.goto(personListUrl.toString());
                        await waitTillHTMLRendered(page);
                    }
                    break;

                case 'edit':
                    if (currentState === 'personList') {
                        await safelyClick(page, selectors.personList.editLinks);
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
            if (error instanceof Error) {
                console.log(`Navigation error: ${error.message}`);
            }
            if (attempt === maxAttempts - 1) throw error;
        }
    }

    console.log(`Failed to navigate to ${targetState} after ${maxAttempts} attempts`);
    return false;
}

async function switchDepartment(page: puppeteer.Page, departmentValue: string): Promise<boolean> {
    try {
        await page.select(selectors.personList.departmentSelect[0], departmentValue);
        await waitTillHTMLRendered(page);
        return true;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`Error switching department: ${errorMessage}`);
        return false;
    }
}

async function getExistingPersons(page: puppeteer.Page): Promise<{ name: string; status: string; editUrl: string }[]> {
    try {
        // Try each table selector
        let tableFound = false;
        for (const selector of selectors.personList.table) {
            try {
                await page.waitForSelector(selector);
                tableFound = true;
                break;
            } catch {
                continue;
            }
        }
        if (!tableFound) throw new Error('Could not find persons table');

        // Get all rows from the table using both old and new selectors
        const persons = await page.evaluate(() => {
            const rows = document.querySelectorAll('#_ctrl0_ctl19_UCPersons_dataGrid tr:not(:first-child)');
            const results = Array.from(rows).map(row => {
                const editLink = row.querySelector('.grid-list-action-icon.grid-list-action-edit') as HTMLAnchorElement;
                const nameCell = row.querySelector('.DataGridItemBorder');
                const statusCell = row.querySelector('.ToDoListLabel');
                
                return {
                    name: nameCell?.textContent?.trim() || '',
                    editUrl: editLink?.href || '',
                    status: statusCell?.textContent?.trim() || ''
                };
            }).filter(p => p.editUrl && p.name);

            return results;
        });

        return persons;
    } catch (error) {
        console.error('Error getting existing persons:', error);
        return [];
    }
}

async function calculateProgress(current: number, total: number): Promise<string> {
    const percentage = Math.round((current / total) * 100);
    const progressBar = `[${'='.repeat(percentage / 5)}${' '.repeat(20 - percentage / 5)}]`;
    return `${progressBar} ${percentage}% (${current}/${total})`;
}

async function safelyClick(page: puppeteer.Page, selectors: string | string[]): Promise<boolean> {
    try {
        const selectorArray = Array.isArray(selectors) ? selectors : [selectors];
        for (const selector of selectorArray) {
            const element = await page.$(selector);
            if (element) {
                await element.click();
                return true;
            }
        }
        return false;
    } catch {
        return false;
    }
}

async function selectDepartment(page: puppeteer.Page): Promise<string | null> {
    // Get list of departments by trying each selector
    let departments: Array<{ text: string; value: string }> = [];
    for (const selector of selectors.personList.departmentSelect) {
        try {
            departments = await page.evaluate((selector: string) => {
                const select = document.querySelector<HTMLSelectElement>(selector);
                if (!select) return [];
                return Array.from(select.options).map(option => ({
                    text: option.text,
                    value: option.value
                }));
            }, selector);
            if (departments.length > 0) break;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.log(`Error getting departments: ${errorMessage}`);
            continue;
        }
    }

    if (departments.length === 0) {
        console.log('Could not find department selector');
        return null;
    }

    console.log('\nAvailable departments to clean:');
    console.log('(Press Enter to clean all departments)');
    departments.forEach((dept, index) => {
        console.log(`${index + 1}: ${dept.text}`);
    });
    console.log('x: Cancel');

    const answer = await askQuestion('\nSelect department to clean (or press Enter for all): ');
    if (answer.toLowerCase() === 'x') return null;
    
    // If user just hits enter, return 'all' to indicate cleaning all departments
    if (answer.trim() === '') return 'all';

    const index = parseInt(answer) - 1;
    if (index >= 0 && index < departments.length) {
        return departments[index].value;
    }

    console.log('Invalid selection');
    return null;
}

async function deleteExistingPersons(page: puppeteer.Page, persons: { name: string; status: string; editUrl: string }[]): Promise<boolean> {
    if (persons.length === 0) return true;

    console.log(`Attempting to delete ${persons.length} persons...`);

    try {
        // Process each person individually
        for (const person of persons) {
            if (person.status.includes('For Approval')) {
                console.log(`Skipping ${person.name} - Status: ${person.status}`);
                continue;
            }

            if (person.name.toLowerCase().includes('placeholder')) {
                console.log(`Deleting ${person.name}...`);

                // Navigate to edit page using the edit URL
                await page.goto(person.editUrl);
                await waitTillHTMLRendered(page);
                await page.waitForTimeout(2000);

                // Fill in required comment
                await page.waitForSelector('#_ctrl0_ctl19_ctl00_txtComments');
                await page.type('#_ctrl0_ctl19_ctl00_txtComments', 'Removing placeholder entry');
                await page.waitForTimeout(1000);

                // Click delete button with proper workflow handling
                const deleteSuccess = await page.evaluate(async () => {
                    try {
                        const deleteBtn = document.querySelector('#_ctrl0_ctl19_ctl00_btnDelete') as HTMLElement;
                        if (deleteBtn) {
                            // Call workflowSubmit first
                            if (typeof (window as any).workflowSubmit === 'function') {
                                (window as any).workflowSubmit();
                                // Wait for workflowSubmit to complete
                                await new Promise(resolve => setTimeout(resolve, 1000));
                            }

                            // Get the onclick attribute and execute its functions
                            const onclickAttr = deleteBtn.getAttribute('onclick');
                            if (onclickAttr) {
                                // Execute each function in the onclick attribute
                                const functions = onclickAttr.split(';').map(f => f.trim()).filter(Boolean);
                                for (const func of functions) {
                                    if (func.includes('return false')) continue;
                                    try {
                                        // Remove 'return' keyword if present and evaluate
                                        const cleanFunc = func.replace('return', '').trim();
                                        eval(cleanFunc);
                                        // Small delay between function calls
                                        await new Promise(resolve => setTimeout(resolve, 500));
                                    } catch (e) {
                                        console.log(`Failed to execute ${func}:`, e);
                                    }
                                }
                            }

                            // Finally click the button
                            deleteBtn.click();
                            return true;
                        }
                        return false;
                    } catch (error) {
                        console.error('Delete button click failed:', error);
                        return false;
                    }
                });

                if (!deleteSuccess) {
                    console.log(`Failed to trigger delete for ${person.name}`);
                    continue;
                }

                // Wait for navigation and confirmation
                try {
                    // Wait for either success message or navigation
                    await Promise.race([
                        page.waitForSelector('.message.message-success', { timeout: 5000 }),
                        page.waitForNavigation({ timeout: 5000 })
                    ]);
                    
                    // Add extra wait for stability
                    await page.waitForTimeout(2000);
                    
                    console.log(`Successfully deleted ${person.name}`);
                } catch (error) {
                    console.log(`Warning: Could not confirm deletion of ${person.name}`);
                }
            } else {
                console.log(`Skipping non-placeholder person: ${person.name}`);
            }
        }

        return true;
    } catch (error) {
        console.error('Error during delete operation:', error);
        return false;
    }
}

async function deletePersons(page: puppeteer.Page, sectionId: string): Promise<void> {
    try {
        // First navigate to the Person List page using the URL
        console.log('\nNavigating to Person List page...');
        if (!settings.baseUrlToCreateTo) {
            throw new Error('baseUrlToCreateTo is not defined in settings');
        }
        const personListUrl = new URL(settings.baseUrlToCreateTo.toString());
        personListUrl.pathname = '/admin/default.aspx';
        personListUrl.search = `?LanguageId=1&SectionId=${sectionId}`;
        await page.goto(personListUrl.toString());
        await waitTillHTMLRendered(page);
        await page.waitForTimeout(2000); // Give extra time for page to load

        // Now try to find the department selector
        let departmentSelect = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            console.log(`Attempting to find department selector (attempt ${attempt + 1}/3)...`);
            for (const selector of selectors.personList.departmentSelect) {
                try {
                    await page.waitForSelector(selector, { timeout: 5000 });
                    departmentSelect = selector;
                    console.log(`Found department selector: ${selector}`);
                    break;
                } catch (error) {
                    continue;
                }
            }
            if (departmentSelect) break;
            await page.waitForTimeout(2000);
        }

        if (!departmentSelect) {
            throw new Error('Could not find department selector after multiple attempts');
        }

        // Let user select which department to clean
        const departmentValue = await selectDepartment(page);
        if (!departmentValue) {
            console.log('Operation cancelled');
            return;
        }

        if (departmentValue === 'all') {
            // Process all departments
            const departments = await page.evaluate((selector: string) => {
                const select = document.querySelector(selector) as HTMLSelectElement;
                if (!select) return [];
                return Array.from(select.options).map(option => ({
                    value: option.value,
                    text: option.textContent?.trim() || ''
                }));
            }, departmentSelect);

            for (const dept of departments) {
                console.log(`\nProcessing department: ${dept.text}`);
                
                // Switch to current department
                if (!await switchDepartment(page, dept.value)) {
                    console.log(`Failed to switch to department ${dept.text}, skipping...`);
                    continue;
                }

                // Get and delete persons in this department
                const existingPersons = await getExistingPersons(page);
                if (existingPersons.length === 0) {
                    console.log('No persons found in this department');
                    continue;
                }

                console.log(`Found ${existingPersons.length} persons in ${dept.text}`);
                if (!await deleteExistingPersons(page, existingPersons)) {
                    console.log(`Failed to delete some persons in ${dept.text}`);
                }
            }
        } else {
            // Switch to selected department
            if (!await switchDepartment(page, departmentValue)) {
                throw new Error('Failed to switch department');
            }

            // Get existing persons in the selected department
            const existingPersons = await getExistingPersons(page);
            if (existingPersons.length === 0) {
                console.log('No persons found in this department');
                return;
            }

            console.log(`Found ${existingPersons.length} persons in this department`);
            if (!await deleteExistingPersons(page, existingPersons)) {
                console.log('Failed to delete some persons');
            }
        }
    } catch (error) {
        console.error('Error during delete operation:', error);
        throw error;
    }
}

async function createNewPersons(page: puppeteer.Page, persons: PersonData[], sectionId: string): Promise<void> {
    console.log('Navigating to person list page...');
    if (!await navigateToPage(page, 'personList', sectionId)) {
        throw new Error('Failed to reach person list page');
    }

    // Get list of departments
    const departments = await page.evaluate((selector: string) => {
        const select = document.querySelector(selector) as HTMLSelectElement;
        if (!select) return [];
        return Array.from(select.options).map(option => ({
            value: option.value,
            text: option.textContent?.trim() || ''
        }));
    }, selectors.personList.departmentSelect[0]);

    // Process each department
    for (const department of departments) {
        // Filter persons for this department only
        const departmentPersons = persons.filter(p => p.department === department.text);
        
        if (departmentPersons.length === 0) {
            console.log(`\nSkipping department ${department.text} - no persons to create`);
            continue;
        }

        console.log(`\nProcessing department: ${department.text}`);
        console.log(`Found ${departmentPersons.length} persons to create in this department`);
        
        if (!await switchDepartment(page, department.value)) {
            console.log(`Failed to switch to department ${department.text}, skipping...`);
            continue;
        }

        for (let i = 0; i < departmentPersons.length; i++) {
            const person = departmentPersons[i];
            if (!await createPerson(page, person, department.value, i, departmentPersons.length, sectionId)) {
                console.log(`Failed to create person ${person.firstName} ${person.lastName}, continuing with next...`);
            }
            // Small delay between creations
            await page.waitForTimeout(500);
        }
    }
}

async function createPerson(page: puppeteer.Page, person: PersonData & { memberships?: CommitteeMembership[] }, department: string, currentIndex: number, totalPersons: number, sectionId: string): Promise<boolean> {
    const progress = await calculateProgress(currentIndex + 1, totalPersons);
    console.log(`Creating person ${person.firstName} ${person.lastName}... ${progress}`);

    try {
        // If we're not already on the edit page, click create new
        const currentPage = await detectCurrentPage(page);
        if (currentPage !== 'edit') {
            // Wait for the create button with a shorter timeout
            for (const selector of selectors.personList.createButton) {
                try {
                    await page.waitForSelector(selector, { visible: true, timeout: 3000 });
                    
                    if (!await safelyClick(page, selector)) {
                        continue;
                    }
                    
                    // Wait for form fields instead of generic page load
                    const formLoaded = await Promise.race([
                        page.waitForSelector(selectors.editPage.fields.firstName[0], { timeout: 5000 }),
                        page.waitForSelector(selectors.editPage.fields.lastName[0], { timeout: 5000 }),
                        page.waitForSelector(selectors.editPage.fields.title[0], { timeout: 5000 })
                    ]).then(() => true).catch(() => false);
                    
                    if (!formLoaded) {
                        console.log('Failed to verify form fields loaded');
                        continue;
                    }
                    
                    break;
                } catch (error) {
                    continue;
                }
            }
        }

        // Fill form fields
        const success = await fillPersonForm(page, person, department);
        if (!success) {
            console.log(`Failed to fill form for ${person.firstName} ${person.lastName}`);
            return false;
        }

        // Handle committee memberships if present
        if (person.memberships) {
            for (const membership of person.memberships) {
                await setCommitteeRole(page, membership.committeeName, membership.role);
            }
        }

        // Save the form
        await safelyClick(page, selectors.editPage.buttons.save);
        await waitTillHTMLRendered(page);

        return true;
    } catch (error) {
        if (error instanceof Error) {
            console.log(`Error creating person ${person.firstName} ${person.lastName}:`, error.message);
        }
        return false;
    }
}

async function fillField(page: puppeteer.Page, selector: string, value: string, fieldName: string): Promise<boolean> {
    try {
        return await safelyType(page, selector, value);
    } catch (error) {
        if (error instanceof Error) {
            console.log(`Error filling ${fieldName}: ${error.message}`);
        }
        return false;
    }
}

async function fillPersonForm(page: puppeteer.Page, person: PersonData & { memberships?: CommitteeMembership[] }, department: string): Promise<boolean> {
    try {
        console.log('Starting to fill person form...');

        // Set department
        const deptSelector = '#_ctrl0_ctl19_ddlDepartment';
        console.log(`Attempting to select value "${department}" in ${deptSelector}`);
        if (!await safelySelect(page, deptSelector, department)) {
            return false;
        }

        // Fill in basic fields
        const fields = [
            { selector: '#_ctrl0_ctl19_txtFirstName', value: person.firstName },
            { selector: '#_ctrl0_ctl19_txtLastName', value: person.lastName },
            { selector: '#_ctrl0_ctl19_txtTitle', value: person.title },
            { selector: '#_ctrl0_ctl19_txtDescription', value: person.description }
        ];

        for (const field of fields) {
            console.log(`Attempting to type "${field.value}" into ${field.selector}`);
            if (!await safelyType(page, field.selector, field.value)) {
                return false;
            }
        }

        // Set tags if present
        if (person.tags && person.tags.length > 0) {
            const tagString = 'committee ' + person.tags.join(' ');
            console.log(`Attempting to type "${tagString}" into #_ctrl0_ctl19_TagSelection_txtTags`);
            if (!await safelyType(page, '#_ctrl0_ctl19_TagSelection_txtTags', tagString)) {
                return false;
            }
        }

        // Handle department select2 dropdown if present
        const isSelect2 = await page.evaluate((selector: string) => {
            return !!document.querySelector(`${selector} + .select2`);
        }, deptSelector);

        if (isSelect2) {
            console.log('Detected select2 dropdown for ' + deptSelector);
            await page.evaluate((selector: string, value: string) => {
                const element = document.querySelector(selector) as HTMLSelectElement;
                if (element) {
                    element.value = value;
                    element.dispatchEvent(new Event('change'));
                }
            }, deptSelector, department);
        }

        // Set image if present
        if (person.image?.localPath) {
            console.log(`Setting image path: ${person.image.localPath}`);
            try {
                await page.evaluate((imagePath) => {
                    const photoInput = document.querySelector('#_ctrl0_ctl19_UCPhotoPath_txtImage');
                    const thumbnailInput = document.querySelector('#_ctrl0_ctl19_UCThumbnailPath_txtImage');
                    if (photoInput) {
                        (photoInput as HTMLInputElement).value = imagePath;
                    }
                    if (thumbnailInput) {
                        (thumbnailInput as HTMLInputElement).value = imagePath;
                    }
                }, person.image.localPath);
                console.log('Successfully set both image fields');
            } catch (error) {
                console.error('Error setting image fields:', error);
            }
        }

        // Handle committee memberships if present
        if (person.memberships) {
            // Get available committees on the page
            const committees = await page.evaluate(() => {
                const labels = document.querySelectorAll('.committee_name-label');
                return Array.from(labels).map(label => {
                    const text = label.textContent;
                    return text ? text.trim() : '';
                });
            });
            console.log('\nFound committees on page:', committees);

            console.log('Person memberships to set:', person.memberships);

            // Set each committee membership
            for (const membership of person.memberships) {
                // Find exact committee match
                const matchScore = (a: string, b: string) => {
                    if (a === b) return 100;
                    if (a.includes(b) || b.includes(a)) return 50;
                    return 0;
                };

                const match = committees.find(c => matchScore(c, membership.committeeName) > 50);
                if (match) {
                    console.log(`Matched "${membership.committeeName}" to "${match}" (score: 100)`);
                    console.log(`Setting ${match} to ${membership.role}`);
                    await setCommitteeRole(page, match, membership.role);
                }
            }
        }

        return true;
    } catch (error) {
        console.error('Error filling form:', error);
        return false;
    }
}

async function safelyType(page: puppeteer.Page, selector: string, value: string): Promise<boolean> {
    try {
        const element = await page.$(selector);
        if (element) {
            await element.type(value);
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

async function safelySelect(page: puppeteer.Page, selector: string, value: string): Promise<boolean> {
    try {
        await page.select(selector, value);
        return true;
    } catch {
        return false;
    }
}

async function safelySetCheckbox(page: puppeteer.Page, selector: string | string[], checked: boolean): Promise<boolean> {
    try {
        const selectorArray = Array.isArray(selector) ? selector : [selector];
        for (const sel of selectorArray) {
            const element = await page.$(sel);
            if (element) {
                await page.evaluate((el: Element, value: boolean) => {
                    if (el instanceof HTMLInputElement) {
                        el.checked = value;
                    }
                }, element, checked);
                return true;
            }
        }
        return false;
    } catch (error) {
        if (error instanceof Error) {
            console.log(`Error setting checkbox: ${error.message}`);
        }
        return false;
    }
}

async function loadDepartmentMapping(): Promise<DepartmentMapping> {
    const filePath = path.join(__dirname, 'departments.json');
    if (!fs.existsSync(filePath)) {
        throw new Error('departments.json file not found. Please run the scraping script first.');
    }
    const mapping = JSON.parse(fs.readFileSync(filePath, 'utf8')) as DepartmentMapping;
    return {
        departments: {
            source: mapping.departments.source,
            destination: mapping.departments.destination || [],
            mapping: mapping.departments.mapping || {}
        }
    };
}

async function getDepartments(page: puppeteer.Page): Promise<Department[]> {
    try {
        const departments = await page.evaluate(() => {
            const select = document.querySelector<HTMLSelectElement>('#_ctrl0_ctl19_ddlDepartment');
            if (!select) return [];
            return Array.from(select.options).map(option => ({
                id: option.value,
                name: option.textContent || ''
            }));
        });
        return departments as Department[];
    } catch (error) {
        if (error instanceof Error) {
            console.error('Error getting departments:', error.message);
        }
        return [];
    }
}

async function promptDepartmentMapping(sourceDept: string, availableDepts: string[]): Promise<string | null> {
    console.log(`\nSource department "${sourceDept}" not found in destination.`);
    console.log('\nAvailable departments in destination:');
    availableDepts.forEach((dept, index) => {
        console.log(`${index + 1}: ${dept}`);
    });
    console.log('x: Cancel operation');

    const answer = await askQuestion('\nSelect department number to map to (or x to cancel): ');
    if (answer.toLowerCase() === 'x') return null;

    const index = parseInt(answer) - 1;
    if (index >= 0 && index < availableDepts.length) {
        return availableDepts[index];
    }
    console.log('Invalid selection');
    return null;
}

async function askToContinue(message: string): Promise<void> {
    await askQuestion(message);
}

async function setCommitteeRole(page: puppeteer.Page, committeeName: string, role: string): Promise<boolean> {
    try {
        // Find the committee label
        const labels = await page.$$('.committee_name-label');
        for (const label of labels) {
            const text = await label.evaluate(el => el.textContent || '');
            if (text.includes(committeeName)) {
                // Find the corresponding radio button
                const radioButtons = await page.$$(`input[type="radio"][value="${role}"]`);
                for (const radio of radioButtons) {
                    const isVisible = await radio.evaluate(el => {
                        const style = window.getComputedStyle(el);
                        return style.display !== 'none' && style.visibility !== 'hidden';
                    });
                    if (isVisible) {
                        await radio.click();
                        return true;
                    }
                }
            }
        }
        return false;
    } catch (error) {
        if (error instanceof Error) {
            console.error('Error setting committee role:', error.message);
        }
        return false;
    }
}

export async function createPersons(subdomain: string, shouldDelete: boolean = false) {
    // Validate command line arguments
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
        const sectionId = "08832295-eb3f-4dae-9c93-8435ba7ed7d2";
        const siteUrl = `https://${subdomain}.s4.q4web.com`;
        settings.baseUrlToCreateTo = new URL(`${siteUrl}/admin/login.aspx`);

        const cms = new CMSService({ url: settings.baseUrlToCreateTo, page });
        
        // First go to login page and ensure we're logged in
        console.log('Navigating to login page...');
        await page.goto(settings.baseUrlToCreateTo.toString());
        await waitTillHTMLRendered(page);
        
        console.log('Logging in...');
        await cms.login();
        await waitTillHTMLRendered(page);
        await page.waitForTimeout(2000); // Give extra time for login to complete

        // Verify login was successful
        const isLoginPage = await page.$('#username') !== null;
        if (isLoginPage) {
            throw new Error('Login failed - still on login page');
        }

        if (shouldDelete) {
            // Handle deletion without requiring departments.json
            await deletePersons(page, sectionId);
            return;
        }

        // Load and verify the scraped data before proceeding
        const persons = loadPersonData();
        console.log(`\nLoaded ${persons.length} persons from persons.json`);
        console.log('Sample of persons to be created:');
        persons.slice(0, 3).forEach((person, i) => {
            console.log(`${i + 1}. ${person.firstName} ${person.lastName} (${person.department})`);
        });
        if (persons.length > 3) {
            console.log(`... and ${persons.length - 3} more`);
        }

        // Pause for verification
        await askToContinue('\nPress Enter to continue with person creation (or Ctrl+C to cancel)...');

        // Navigate directly to person list page using the URL
        console.log('\nNavigating to Person List page...');
        const personListUrl = new URL(siteUrl);
        personListUrl.pathname = '/admin/default.aspx';
        personListUrl.search = `?LanguageId=1&SectionId=${sectionId}`;
        await page.goto(personListUrl.toString());
        await waitTillHTMLRendered(page);
        await page.waitForTimeout(2000); // Give extra time for page to load

        // Wait for department selector with multiple attempts
        console.log('Checking destination departments...');
        let departmentSelect = null;
        for (const selector of selectors.personList.departmentSelect) {
            try {
                await page.waitForSelector(selector, { timeout: 5000 });
                departmentSelect = selector;
                break;
            } catch (error) {
                continue;
            }
        }

        if (!departmentSelect) {
            throw new Error('Failed to find department selector on Person List page');
        }

        // Get destination departments using the found selector
        const destinationDepts = await page.evaluate((selector) => {
            const select = document.querySelector(selector) as HTMLSelectElement;
            if (!select) return [];
            return Array.from(select.options).map(option => option.textContent?.trim() || '');
        }, departmentSelect);

        console.log('Found departments:', destinationDepts);

        // Load department mapping
        const deptMapping = await loadDepartmentMapping();
        deptMapping.departments.destination = destinationDepts;
        deptMapping.departments.mapping = {};

        // Check each source department
        const sourceDepts = new Set(persons.map(p => p.department));

        for (const sourceDept of sourceDepts) {
            if (!destinationDepts.includes(sourceDept)) {
                const mappedDept = await promptDepartmentMapping(sourceDept, destinationDepts);
                if (!mappedDept) {
                    console.log('\nOperation cancelled. Please create the missing department and try again.');
                    return;
                }
                deptMapping.departments.mapping[sourceDept] = mappedDept;
            } else {
                deptMapping.departments.mapping[sourceDept] = sourceDept;
            }
        }

        // Save updated mapping
        fs.writeFileSync(
            path.join(__dirname, 'departments.json'),
            JSON.stringify(deptMapping, null, 2)
        );

        // Create new persons with mapped departments
        console.log('\nCreating new persons...');
        const personsWithMappedDepts = persons.map(person => ({
            ...person,
            department: deptMapping.departments.mapping?.[person.department] || person.department
        }));
        await createNewPersons(page, personsWithMappedDepts, sectionId);
        console.log('Create operation completed.');

    } catch (error) {
        console.error('Error:', error);
        throw error;
    } finally {
        // Add a small delay before closing to see the final state
        await page.waitForTimeout(2000);
        await browser.close();
        closeReadline(); // Make sure to close readline when done
    }
}

// Run directly if called from command line
if (require.main === module) {
    const subdomain = process.argv[2];
    const shouldDelete = process.argv[3] === '--delete';
    createPersons(subdomain, shouldDelete).catch(console.error);
}