import { Base } from './Base';
import { SiteConfig } from '../core/types';
import { Page } from 'puppeteer';
import chalk from 'chalk';
import { LoginManager } from '../core/LoginManager';
import { waitTillHTMLRendered, delay } from '../helpers/Puppeteer';
import readline from 'readline';
import { readFileSync } from 'fs';
import { join } from 'path';
import { levenshteinDistance } from '../utils/string';
import * as fs from 'fs';
import * as path from 'path';
import { getSafeSiteDirName } from '../helpers/siteName';


// Add type declaration for __doPostBack
declare function __doPostBack(eventTarget: string, eventArgument: string): void;

interface PersonData {
    firstName: string;
    lastName: string;
    title?: string;
    description?: string;
    suffix?: string;
    department: string;
    committeeMemberships?: Array<{
        name: string;
        role: string;
    }>;
    specialRoles?: string[];
    imagePath?: string;
    careerHighlights?: string;
}

interface MergedData {
    departments: Array<{
        name: string;
        persons: PersonData[];
    }>;
}

interface CommitteeRole {
    value: string;
    label: string;
    element: HTMLInputElement;
}

interface Committee {
    name: string;
    normalizedName: string;
    roles: CommitteeRole[];
    roleTable: string;
}

/**
 * MigratePerson Operation
 * 
 * Flow:
 * 1. Initial Setup
 *    - Load merged data from persons-merged.json
 *    - Get logged in page
 * 
 * 2. Department Processing
 *    For each department in merged data:
 *    - Navigate to person list page
 *    - Switch to department
 *    - Process each person in department
 * 
 * 3. Person Creation
 *    For each person:
 *    - Click create new button
 *    - Fill form:
 *      a. Set department (triggers page refresh)
 *      b. Set board member status if in Board of Directors
 *      c. Set committee memberships if present
 *      d. Set image paths
 *      e. Set remaining form fields
 *    - Save and verify
 * 
 * 4. Error Handling
 *    - Handle navigation errors
 *    - Handle form filling errors
 *    - Handle save errors
 *    - Continue to next person/department on failure
 * 
 * 5. Debug Mode
 *    - Prompt at each major step
 *    - Allow verification of state
 *    - Enable step-by-step execution
 */

export class MigratePerson extends Base {
    private readonly personSectionId = '08832295-eb3f-4dae-9c93-8435ba7ed7d2';
    private readonly languageId = 1;
    private isDebugMode = false;
    private rl: readline.Interface;
    private persons: PersonData[] = [];
    private committeeRoleMapping: Record<string, { roles: Record<string, string> }> | null = null;

    // Selectors for the person list page
    private readonly selectors = {
        personList: {
            table: '#_ctrl0_ctl19_UCPersons_dataGrid',
            departmentSelect: '#_ctrl0_ctl19_ddlDepartment',
            createButton: '#_ctrl0_ctl19_btnAddNew_submitButton',
            loadingIndicator: '.nui-spinner'
        },
        personForm: {
            form: '#_ctrl0_ctl19_UCPersons_editForm',
            saveButton: '#_ctrl0_ctl19_btnSave_submitButton',
            cancelButton: '#_ctrl0_ctl19_btnCancel_submitButton',
            // Basic information
            department: '#_ctrl0_ctl19_ddlDepartment',
            firstName: '#_ctrl0_ctl19_txtFirstName',
            lastName: '#_ctrl0_ctl19_txtLastName',
            suffix: '#_ctrl0_ctl19_txtSuffix',
            title: '#_ctrl0_ctl19_txtTitle',
            // Description and highlights
            description: '#_ctrl0_ctl19_txtDescription',
            careerHighlights: '#_ctrl0_ctl19_txtCareerHighlight',
            // Image upload
            image: {
                input: '#_ctrl0_ctl19_txtPhoto',
                img: '#_ctrl0_ctl19_imgPhoto'
            },
            // Committee memberships
            committeeMemberships: {
                table: '#_ctrl0_ctl19_UCPersons_editForm_ctl00',
                addButton: '#_ctrl0_ctl19_btnAddCommittee_submitButton'
            },
            boardMembership: {
                mainCheckbox: '#_ctrl0_ctl19_chkPersonBoardMember',
                moduleTitle: '[id$="ModuleTitle"]',
                boardRoles: {
                    leadIndependent: '#chkPersonBoardMemberships_0',
                    independent: '#chkPersonBoardMemberships_1',
                    financialExpert: '#chkPersonBoardMemberships_2',
                    boardChair: '#chkPersonBoardMemberships_3',
                    director: '#chkPersonBoardMemberships_4',
                    viceBoardChair: '#chkPersonBoardMemberships_5',
                    ceo: '#chkPersonBoardMemberships_6'
                }
            }
        }
    };

    constructor(site: SiteConfig, loginManager?: LoginManager) {
        super(site, loginManager);
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        this.committeeRoleMapping = null;
    }

    /**
     * Loads and flattens person data from the merged JSON file
     */
    private async loadPersonData(): Promise<void> {
        try {
            console.log(chalk.blue('\nLoading person data...'));

            const filePath = join(
                process.cwd(),
                'data',
                getSafeSiteDirName(this.site.name),
                'persons',
                'persons-merged.json'
            );
            const data: MergedData = JSON.parse(readFileSync(filePath, 'utf-8'));

            // Flatten departments array into a single array of persons
            this.persons = data.departments.flatMap(dept => dept.persons);

            console.log(chalk.green(`Loaded ${this.persons.length} persons`));
            console.log(chalk.blue('Departments:'));
            data.departments.forEach(dept => {
                console.log(chalk.blue(`- ${dept.name}: ${dept.persons.length} persons`));
            });
        } catch (error) {
            console.error(chalk.red('Error loading person data:'), error);
            throw error;
        }
    }

    /**
     * Prompts user to continue in debug mode
     */
    private async debugPrompt(message: string): Promise<void> {
        if (this.isDebugMode) {
            console.log(chalk.yellow(`\n[DEBUG] ${message}`));
            await new Promise(resolve => this.rl.question('Press Enter to continue...', resolve));
        }
    }

    /**
     * Verifies we're on the person list page
     */
    private async verifyListPage(page: Page): Promise<boolean> {
        try {
            const table = await page.$(this.selectors.personList.table);
            const departmentSelect = await page.$(this.selectors.personList.departmentSelect);
            return !!table && !!departmentSelect;
        } catch (error) {
            console.error(chalk.red('Error verifying list page:'), error);
            return false;
        }
    }

    /**
     * Verifies we're on the person edit page
     */
    private async verifyEditPage(page: Page): Promise<boolean> {
        try {
            // Wait for the module title span with "Person Edit" text
            await page.waitForFunction(
                () => {
                    const span = document.querySelector('span[id$="ModuleTitle"]');
                    return span && span.textContent === 'Person Edit';
                },
                { timeout: 10000 }
            );
            return true;
        } catch (error) {
            console.error(chalk.red('Error verifying edit page:'), error);
            return false;
        }
    }

    /**
     * Recovers from navigation errors
     */
    private async recoverFromError(page: Page): Promise<boolean> {
        try {
            console.log(chalk.yellow('Attempting to recover from error...'));

            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(5000);

            const loadingIndicator = await page.$(this.selectors.personList.loadingIndicator);
            if (loadingIndicator) {
                await page.waitForFunction(
                    (selector: string) => !document.querySelector(selector),
                    { timeout: 30000 },
                    this.selectors.personList.loadingIndicator
                );
            }

            const isListPage = await this.verifyListPage(page);
            if (isListPage) {
                console.log(chalk.green('Successfully recovered to list page'));
                return true;
            }

            console.error(chalk.red('Failed to recover to list page'));
            return false;
        } catch (error) {
            console.error(chalk.red('Error during recovery:'), error);
            return false;
        }
    }

    /**
     * Waits for page to load with retry logic
     */
    private async waitForPageLoad(page: Page, maxRetries = 3): Promise<boolean> {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(chalk.blue(`Attempting to load page (attempt ${attempt}/${maxRetries})...`));

                const url = `https://${this.site.destination}.s4.q4web.com/admin/default.aspx?LanguageId=${this.languageId}&SectionId=${this.personSectionId}`;
                await page.goto(url, {
                    waitUntil: 'domcontentloaded',
                    timeout: 60000
                });

                await page.waitForTimeout(5000);

                const loadingIndicator = await page.$(this.selectors.personList.loadingIndicator);
                if (loadingIndicator) {
                    console.log(chalk.blue('Waiting for loading indicator to disappear...'));
                    await page.waitForFunction(
                        (selector: string) => !document.querySelector(selector),
                        { timeout: 30000 },
                        this.selectors.personList.loadingIndicator
                    );
                }

                const isListPage = await this.verifyListPage(page);
                if (isListPage) {
                    console.log(chalk.green('Successfully loaded person list page'));
                    return true;
                }

                console.log(chalk.yellow('Not on list page, retrying...'));
            } catch (error) {
                console.error(chalk.red(`Error loading page (attempt ${attempt}/${maxRetries}):`), error);
                if (attempt === maxRetries) {
                    throw new Error(`Failed to load page after ${maxRetries} attempts`);
                }
                await page.waitForTimeout(5000 * attempt);
            }
        }
        return false;
    }

    private async handleBoardMembership(page: Page, person: PersonData): Promise<void> {
        try {
            // Check if person needs board membership
            const needsBoardMembership = person.specialRoles && person.specialRoles.length > 0;
            console.log(chalk.blue(`\nChecking board membership for ${person.firstName} ${person.lastName}:`));
            console.log(chalk.blue(`- Special roles: ${JSON.stringify(person.specialRoles)}`));
            console.log(chalk.blue(`- Needs board membership: ${needsBoardMembership}`));

            if (!needsBoardMembership) {
                console.log(chalk.yellow('No board membership needed, skipping...'));
                return;
            }

            // First check if checkbox is already checked
            const isChecked = await page.evaluate((selector) => {
                const checkbox = document.querySelector(selector) as HTMLInputElement;
                return checkbox?.checked;
            }, this.selectors.personForm.boardMembership.mainCheckbox);

            console.log(chalk.blue(`Current checkbox state: ${isChecked ? 'checked' : 'unchecked'}`));

            if (!isChecked) {
                // Trigger click event directly on the input element
                console.log(chalk.blue('Triggering click event on board membership checkbox...'));
                await page.evaluate((selector) => {
                    const checkbox = document.querySelector(selector) as HTMLInputElement;
                    if (checkbox) {
                        // Create and dispatch a click event
                        const clickEvent = new MouseEvent('click', {
                            bubbles: true,
                            cancelable: true,
                            view: window
                        });
                        checkbox.dispatchEvent(clickEvent);
                    }
                }, this.selectors.personForm.boardMembership.mainCheckbox);

                // Wait for page refresh and check for module title
                console.log(chalk.blue('Waiting for page refresh...'));
                await page.waitForFunction(
                    (selector: string) => {
                        const element = document.querySelector(selector);
                        return element && element.textContent === 'Person Edit';
                    },
                    { timeout: 30000 },
                    this.selectors.personForm.boardMembership.moduleTitle
                );

                // Wait longer for the page to fully load
                console.log(chalk.blue('Waiting for page to fully load...'));
                await page.waitForTimeout(5000);
            } else {
                console.log(chalk.yellow('Checkbox already checked, skipping click'));
            }

            // Wait for the board roles table to be present
            console.log(chalk.blue('Waiting for board roles table...'));
            await page.waitForSelector('#chkPersonBoardMemberships', { visible: true, timeout: 10000 });

            // Get initial state of all checkboxes
            console.log(chalk.blue('\nGetting initial checkbox states...'));
            const initialStates = await page.evaluate(() => {
                const table = document.querySelector('#chkPersonBoardMemberships');
                if (!table) return [];
                const checkboxes = Array.from(table.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
                return checkboxes.map(cb => ({
                    id: cb.id,
                    name: cb.name,
                    value: cb.value,
                    text: cb.parentElement?.textContent?.trim(),
                    checked: cb.checked,
                    disabled: cb.disabled
                }));
            });
            console.log(chalk.blue('Initial checkbox states:'));
            console.log(chalk.blue(JSON.stringify(initialStates, null, 2)));

            // Map of special roles to their corresponding checkbox values
            const roleValueMap: { [key: string]: { text: string, value: string } } = {
                'Lead Independent Director': { text: 'Lead Independant Director', value: 'LeadIndependentDirector' },
                'Independent Director': { text: 'Independant Director', value: 'IndependentDirector' },
                'Financial Expert': { text: 'Financial Expert', value: 'FinancialExpert' },
                'Board Chair': { text: 'Board Chair', value: 'Chair' },
                'Director': { text: 'Director', value: 'Director' },
                'Vice Board Chair': { text: 'Vice Board Chair', value: 'ViceBoardChair' },
                'CEO': { text: 'CEO', value: 'CEO' }
            };

            // Filter roles to only those in the person's specialRoles array
            const rolesToCheck = (person.specialRoles || [])
                .map(role => roleValueMap[role])
                .filter(role => role !== undefined);

            console.log(chalk.blue('\nRoles to check based on specialRoles:'));
            console.log(chalk.blue(JSON.stringify(rolesToCheck, null, 2)));

            // Check each role checkbox
            for (const role of rolesToCheck) {
                try {
                    console.log(chalk.blue(`\nProcessing role: ${role.text}`));

                    // Find and check the checkbox for this role
                    const result = await page.evaluate((roleInfo) => {
                        const table = document.querySelector('#chkPersonBoardMemberships');
                        if (!table) {
                            return { found: false, error: 'Table not found' };
                        }

                        // Find the checkbox by both text and value
                        const checkboxes = Array.from(table.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
                        const checkbox = checkboxes.find(cb =>
                            cb.value === roleInfo.value &&
                            cb.parentElement?.textContent?.trim() === roleInfo.text
                        );

                        if (!checkbox) {
                            return {
                                found: false,
                                error: 'Checkbox not found',
                                availableCheckboxes: checkboxes.map(cb => ({
                                    value: cb.value,
                                    text: cb.parentElement?.textContent?.trim()
                                }))
                            };
                        }

                        // Get the label containing the checkbox
                        const label = checkbox.parentElement;
                        if (!label) {
                            return { found: false, error: 'Label not found' };
                        }

                        // Check if checkbox is enabled
                        if (checkbox.disabled) {
                            return { found: true, enabled: false, error: 'Checkbox is disabled' };
                        }

                        // Click the label
                        (label as HTMLElement).click();

                        // Return the new state
                        return {
                            found: true,
                            enabled: true,
                            checked: checkbox.checked,
                            success: true
                        };
                    }, role);

                    if (result.found) {
                        if (result.enabled) {
                            console.log(chalk.green(`✓ Checked ${role.text}`));
                            // Small delay between clicks
                            await page.waitForTimeout(500);
                        } else {
                            console.log(chalk.yellow(`⚠ Skipped ${role.text} - checkbox is disabled`));
                        }
                    } else {
                        console.log(chalk.red(`✗ Failed to find ${role.text}: ${result.error}`));
                        if (result.availableCheckboxes) {
                            console.log(chalk.blue('Available checkboxes:'));
                            console.log(chalk.blue(JSON.stringify(result.availableCheckboxes, null, 2)));
                        }
                    }
                } catch (error) {
                    console.error(chalk.red(`✗ Error processing ${role.text}:`), error);
                }
            }

            // Get final state of all checkboxes
            console.log(chalk.blue('\nGetting final checkbox states...'));
            const finalStates = await page.evaluate(() => {
                const table = document.querySelector('#chkPersonBoardMemberships');
                if (!table) return [];
                const checkboxes = Array.from(table.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
                return checkboxes.map(cb => ({
                    id: cb.id,
                    name: cb.name,
                    value: cb.value,
                    text: cb.parentElement?.textContent?.trim(),
                    checked: cb.checked,
                    disabled: cb.disabled
                }));
            });
            console.log(chalk.blue('Final checkbox states:'));
            console.log(chalk.blue(JSON.stringify(finalStates, null, 2)));

            console.log(chalk.green('\nCompleted board membership setup'));
        } catch (error) {
            console.error(chalk.red('Error handling board membership:'), error);
            throw error;
        }
    }

    private normalizeCommitteeName(name: string): string {
        return name
            .toLowerCase()
            .replace(/[\-_&]+/g, ' ') // replace dashes, underscores, ampersands with spaces
            .replace(/[^a-z0-9\s]/g, '') // remove other special characters
            .replace(/\s+/g, ' ') // normalize spaces
            .replace(/\b(committee|comm)\b/g, '') // remove common words
            .trim();
    }

    /**
     * Build committee/role mapping once per script run
     */
    private async buildCommitteeRoleMapping(page: Page): Promise<void> {
        if (this.committeeRoleMapping) return; // Already built
        const mapping: Record<string, { roles: Record<string, string> }> = {};
        const committees = await page.evaluate(() => {
            const labels = document.querySelectorAll('.committee_name-label');
            return Array.from(labels).map(label => {
                const roleTable = label.nextElementSibling?.querySelector('.committee_membership-options');
                const roles = Array.from(roleTable?.querySelectorAll('input[type="radio"]') || []).map(input => ({
                    value: (input as HTMLInputElement).value,
                    label: input.nextElementSibling?.textContent?.trim() || '',
                    id: (input as HTMLInputElement).id
                }));
                const name = label.textContent?.trim() || '';
                return { name, roles };
            });
        });
        committees.forEach(committee => {
            const normalizedName = this.normalizeCommitteeName(committee.name);
            mapping[normalizedName] = { roles: {} };
            committee.roles.forEach(role => {
                const normalizedRole = this.normalizeCommitteeName(role.label);
                mapping[normalizedName].roles[normalizedRole] = role.id;
            });
        });
        this.committeeRoleMapping = mapping;
        // Log mapping once
        console.log('[INFO] Committee/role mapping built:');
        Object.entries(mapping).forEach(([comm, obj]) => {
            console.log(`  - ${comm}: ${Object.keys(obj.roles).join(', ')}`);
        });
    }

    /**
     * Set committee role using prebuilt mapping
     */
    private async setCommitteeRoleWithMapping(page: Page, committeeName: string, role: string): Promise<void> {
        if (!this.committeeRoleMapping) return;
        const normalizedCommittee = this.normalizeCommitteeName(committeeName);
        const normalizedRole = this.normalizeCommitteeName(role);
        const committee = this.committeeRoleMapping[normalizedCommittee];
        if (!committee) {
            console.log(`[WARN] Committee not found in mapping: ${committeeName}`);
            return;
        }
        const roleId = committee.roles[normalizedRole] || committee.roles[this.normalizeCommitteeName('Committee Member')];
        if (!roleId) {
            console.log(`[WARN] Role not found for committee ${committeeName}: ${role}`);
            return;
        }
        // Set the radio button
        await page.evaluate((id: string) => {
            const radio = document.getElementById(id) as HTMLInputElement;
            if (radio && !radio.checked && !radio.disabled) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, roleId);
        // Verify
        const isChecked = await page.evaluate((id: string) => {
            const radio = document.getElementById(id) as HTMLInputElement;
            return radio ? radio.checked : false;
        }, roleId);
        console.log(`[INFO] Set committee '${committeeName}' to '${role}'. Verified: ${isChecked ? 'OK' : 'FAILED'}`);
    }

    private getPersonImagePath(person: PersonData): string | null {
        try {
            // Construct the path to the local images directory
            const siteDir = getSafeSiteDirName(this.site.name);
            const deptDir = getSafeSiteDirName(person.department);
            const imagesDir = path.join(process.cwd(), 'data', siteDir, 'images', deptDir);

            console.log(chalk.blue(`\nChecking for image in: ${imagesDir}`));

            // Check if directory exists
            if (!fs.existsSync(imagesDir)) {
                console.log(chalk.yellow(`No image directory found for department: ${person.department}`));
                return null;
            }

            // Generate normalized filename prefix based on person's name
            const filenamePrefix = `${person.firstName}_${person.lastName}`
                .replace(/[^a-z0-9-]/gi, '_')
                .toLowerCase();

            console.log(chalk.blue(`Looking for image with prefix: ${filenamePrefix}`));

            // Find matching image file (regardless of extension)
            const files = fs.readdirSync(imagesDir);
            console.log(chalk.blue(`Found ${files.length} files in directory`));

            const matchingFile = files.find(file => file.toLowerCase().startsWith(filenamePrefix));

            if (!matchingFile) {
                console.log(chalk.yellow(`\nNo image found for ${person.firstName} ${person.lastName} in ${imagesDir}`));
                console.log(chalk.yellow('Available files:'));
                files.forEach(file => {
                    console.log(chalk.yellow(`- ${file}`));
                });
                return null;
            }

            // Construct CMS image path
            const cmsImagePath = `files/images/${deptDir}/${matchingFile}`;
            console.log(chalk.green(`\nFound image for ${person.firstName} ${person.lastName}:`));
            console.log(chalk.green(`- Local file: ${matchingFile}`));
            console.log(chalk.green(`- CMS path: ${cmsImagePath}`));

            return cmsImagePath;
        } catch (error) {
            console.error(chalk.red(`Error finding image for ${person.firstName} ${person.lastName}:`), error);
            return null;
        }
    }

    /**
     * Creates a new person entry 
     */
    private async createPersonEntry(page: Page, person: PersonData): Promise<boolean> {
        try {
            console.log(chalk.blue(`\n[INFO] Creating person: ${person.firstName} ${person.lastName}`));
            if (person.committeeMemberships) {
                console.log('[INFO] JSON committee memberships:', person.committeeMemberships.map(m => `${m.name}: ${m.role}`).join(', '));
            }

            // Click create new button
            await this.debugPrompt('Clicking create new button...');
            const createButton = await page.$(this.selectors.personList.createButton);
            if (!createButton) {
                throw new Error('Create button not found');
            }
            await createButton.click();
            await page.waitForTimeout(2000);

            // Verify we're on the edit page
            await this.debugPrompt('Verifying we are on the person edit page...');
            const isEditPage = await this.verifyEditPage(page);
            if (!isEditPage) {
                throw new Error('Not on person edit page after clicking Create New');
            }

            // Handle board membership first
            await this.handleBoardMembership(page, person);

            // 1. Set department first
            await this.debugPrompt('Setting department...');
            console.log(chalk.blue(`Setting department to: ${person.department}`));

            // Get all departments and their UUIDs from the dropdown
            const departments = await page.evaluate(() => {
                const select = document.querySelector('#_ctrl0_ctl19_ddlDepartment') as HTMLSelectElement;
                return Array.from(select.options).map(option => ({
                    name: option.text,
                    value: option.value
                }));
            });

            console.log(chalk.blue('Available departments:'));
            console.log(chalk.blue(JSON.stringify(departments, null, 2)));

            // Find the matching department UUID
            const targetDept = departments.find(dept => dept.name === person.department);
            if (!targetDept) {
                throw new Error(`Department "${person.department}" not found in dropdown`);
            }

            console.log(chalk.blue(`Found department UUID: ${targetDept.value}`));

            // Select the department using its UUID
            await page.evaluate((deptId) => {
                const select = document.querySelector('#_ctrl0_ctl19_ddlDepartment') as HTMLSelectElement;
                select.value = deptId;
                // Trigger change event
                const event = new Event('change', { bubbles: true });
                select.dispatchEvent(event);
            }, targetDept.value);

            // Verify the selection
            const selectedDept = await page.evaluate(() => {
                const select = document.querySelector('#_ctrl0_ctl19_ddlDepartment') as HTMLSelectElement;
                return {
                    name: select.options[select.selectedIndex].text,
                    value: select.value
                };
            });

            console.log(chalk.blue('Selected department:'));
            console.log(chalk.blue(JSON.stringify(selectedDept, null, 2)));

            // 2. Set basic information
            await this.debugPrompt('Setting basic information...');
            console.log(chalk.blue('Setting basic information fields...'));

            // Set first name (combining firstName and suffix)
            if (person.firstName) {
                const fullFirstName = person.suffix
                    ? `${person.firstName} ${person.suffix}`
                    : person.firstName;
                await page.evaluate((selector, value) => {
                    const input = document.querySelector(selector) as HTMLInputElement;
                    if (input) {
                        input.value = value;
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }, this.selectors.personForm.firstName, fullFirstName);
            }

            // Set last name
            if (person.lastName) {
                await page.evaluate((selector, value) => {
                    const input = document.querySelector(selector) as HTMLInputElement;
                    if (input) {
                        input.value = value;
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }, this.selectors.personForm.lastName, person.lastName);
            }

            // Set title if present
            if (person.title) {
                await page.evaluate((selector, value) => {
                    const input = document.querySelector(selector) as HTMLInputElement;
                    if (input) {
                        input.value = value;
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }, this.selectors.personForm.title, person.title);
            }

            // Set description if present
            if (person.description) {
                await page.evaluate((selector, value) => {
                    const input = document.querySelector(selector) as HTMLInputElement;
                    if (input) {
                        input.value = value;
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }, this.selectors.personForm.description, person.description);
            }

            // Set career highlights if present
            if (person.careerHighlights) {
                await page.evaluate((selector, value) => {
                    const input = document.querySelector(selector) as HTMLInputElement;
                    if (input) {
                        input.value = value;
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }, this.selectors.personForm.careerHighlights, person.careerHighlights);
            }

            // 3. Set image path
            await this.debugPrompt('Checking for and setting image path...');
            console.log(chalk.blue('\nLooking for image for this person...'));

            // Check for and get image path using our new method
            const imagePath = await this.getPersonImagePath(person);
            if (imagePath) {
                person.imagePath = imagePath;
            }

            // Now continue with the existing code that uses person.imagePath
            if (person.imagePath) {
                await this.debugPrompt('Setting image path...');
                console.log(chalk.blue(`Setting image path: ${person.imagePath}`));

                // Set image path (try both selector patterns)
                await page.evaluate((value, selectorOurs, selectorRef) => {
                    // Try our selector first
                    let photoInput = document.querySelector(selectorOurs);
                    
                    // If not found, try reference selector
                    if (!photoInput) {
                        photoInput = document.querySelector('#_ctrl0_ctl19_UCPhotoPath_txtImage');
                        console.log('Using reference photo selector instead');
                    }
                    
                    if (photoInput) {
                        (photoInput as HTMLInputElement).value = value;
                        (photoInput as HTMLInputElement).dispatchEvent(new Event('change', { bubbles: true }));
                        console.log(`Set main photo value to: ${value}`);
                    } else {
                        console.log('Could not find any photo input field');
                    }
                    
                    // Try our thumbnail selector
                    let thumbnailInput = document.querySelector('#_ctrl0_ctl19_txtThumbnail');
                    
                    // If not found, try reference selector
                    if (!thumbnailInput) {
                        thumbnailInput = document.querySelector('#_ctrl0_ctl19_UCThumbnailPath_txtImage');
                        console.log('Using reference thumbnail selector instead');
                    }
                    
                    if (thumbnailInput) {
                        (thumbnailInput as HTMLInputElement).value = value;
                        (thumbnailInput as HTMLInputElement).dispatchEvent(new Event('change', { bubbles: true }));
                        console.log(`Set thumbnail value to: ${value}`);
                    } else {
                        console.log('Could not find any thumbnail input field');
                    }
                }, person.imagePath, this.selectors.personForm.image.input, '#_ctrl0_ctl19_UCPhotoPath_txtImage');

                // Wait for image to load
                console.log(chalk.blue('\nWaiting for image to load...'));
                try {
                    await page.waitForFunction(
                        (selector: string) => {
                            const img = document.querySelector(selector) as HTMLImageElement;
                            return img && img.complete && img.naturalHeight !== 0;
                        },
                        { timeout: 3000 },
                        this.selectors.personForm.image.img
                    );
                    console.log(chalk.green('\nImage loaded successfully'));
                } catch (error) {
                    console.log(chalk.yellow('\nTimed out waiting for image to load, continuing anyway'));
                }

                await this.debugPrompt('Image has been set. Continue to next step?');
            } else {
                console.log(chalk.yellow('\nNo matching image found for this person'));
                await this.debugPrompt('No image found. Continue to next step?');
            }

            // 4. Set committee memberships if present
            if (person.committeeMemberships && person.committeeMemberships.length > 0) {
                // Build mapping if not already done
                await this.buildCommitteeRoleMapping(page);
                for (const membership of person.committeeMemberships) {
                    await this.setCommitteeRoleWithMapping(page, membership.name, membership.role);
                }
            }

            // 5. Save the form
            await this.debugPrompt('Saving person entry...');
            console.log(chalk.blue('Saving person entry...'));

            // Try multiple possible save button selectors
            const saveButtonSelectors = [
                '#_ctrl0_ctl19_btnSave_submitButton',
                '#_ctrl0_ctl19_ctl00_btnSave',
                '#_ctrl0_ctl19_btnSave',
                'input[type="submit"][value="Save"]',
                'input[type="button"][value="Save"]',
                'button:contains("Save")'
            ];

            let saveButtonFound = false;
            for (const selector of saveButtonSelectors) {
                try {
                    const saveButton = await page.$(selector);
                    if (saveButton) {
                        console.log(chalk.blue(`Found save button with selector: ${selector}`));
                        await saveButton.click();
                        saveButtonFound = true;
                        break;
                    }
                } catch (error) {
                    // Continue to next selector
                }
            }

            if (!saveButtonFound) {
                throw new Error('Save button not found on the page');
            }

            // Wait for save to complete and success message to appear
            console.log(chalk.blue('Waiting for save operation to complete...'));
            await page.waitForTimeout(3000); // Wait 3 seconds for processing

            try {
                // Wait for success message to appear
                console.log(chalk.blue('Looking for success message...'));
                await page.waitForSelector('.message.message-success', { timeout: 10000 });
                
                // Verify the text of the success message
                const saveSuccess = await page.evaluate(() => {
                    const successMsg = document.querySelector('.message.message-success');
                    if (successMsg) {
                        const content = successMsg.textContent?.trim() || '';
                        return content.includes('saved successfully');
                    }
                    return false;
                });

                if (saveSuccess) {
                    console.log(chalk.green('Successfully saved person entry'));
                    await this.debugPrompt('Person entry saved. Continue?');
                    console.log(chalk.blue(`[INFO] All committee assignments complete for ${person.firstName} ${person.lastName}`));
                    return true;
                } else {
                    console.log(chalk.yellow('Message found but text does not match expected success message'));
                    await this.debugPrompt('Save verification uncertain. Continue anyway?');
                    return true;
                }
            } catch (error) {
                console.log(chalk.red('Timed out waiting for success message'));
                console.log(chalk.yellow('The save may have completed anyway, continuing with next person'));
                await this.debugPrompt('Save verification failed. Continue anyway?');
                return true;
            }
        } catch (error) {
            console.error(chalk.red('Error creating person entry:'), error);
            return false;
        }
    }

    async execute(): Promise<boolean> {
        try {
            // 1. Load person data
            await this.loadPersonData();

            // 2. Get logged in page
            const page = await this.getPage();
            if (!page) {
                console.error('Failed to get logged in page');
                return false;
            }

            // 3. Navigate to person list page with retry logic
            console.log(chalk.blue('\nNavigating to person list page...'));
            const pageLoaded = await this.waitForPageLoad(page);
            if (!pageLoaded) {
                throw new Error('Failed to load person list page');
            }

            await this.debugPrompt('Navigated to person list page');

            // 4. Process each person
            for (let i = 0; i < this.persons.length; i++) {
                const person = this.persons[i];
                console.log(chalk.blue(`\nProcessing person ${i + 1}/${this.persons.length}`));

                const success = await this.createPersonEntry(page, person);
                if (!success) {
                    console.error(chalk.red(`Failed to create person ${i + 1}/${this.persons.length}`));
                    // Continue with next person
                }

                await this.debugPrompt(`Completed person ${i + 1}/${this.persons.length}`);
            }

            return true;
        } catch (error) {
            console.error('Error in MigratePerson operation:', error);
            return false;
        }
    }
}