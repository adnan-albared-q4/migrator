import * as dotenv from 'dotenv';
import * as puppeteer from 'puppeteer';
import { launchPuppeteer } from '../../lib/scraper/PuppeteerHelper';
import { CMSService } from '../../lib/services/CMS';
import { waitTillHTMLRendered } from '../../lib/helpers/Puppeteer';
import { Page } from 'puppeteer';

// Load environment variables
dotenv.config();

type PageState = 'landing' | 'analystGroups' | 'list' | 'edit';

async function quickCheck(page: Page, selector: string): Promise<boolean> {
    try {
        const element = await page.$(selector);
        return !!element;
    } catch (error) {
        const err = error as Error;
        console.log(`Quick check failed for ${selector}: ${err.message}`);
        return false;
    }
}

async function detectCurrentPage(page: Page): Promise<PageState> {
    // Quick check for edit page
    const editChecks = [
        '#AnalystGroupsAnalystFormNameFieldInput',
        '#AnalystGroupsAnalystFormFirmFieldInput',
        '#AnalystGroupsAnalystFormWorkflowActionSubmit'
    ];
    let allFound = true;
    for (const selector of editChecks) {
        if (!await quickCheck(page, selector)) {
            allFound = false;
            break;
        }
    }
    if (allFound) return 'edit';

    // Quick check for list page
    if (await quickCheck(page, 'table#AnalystGroupsFormAnalystTableTable') &&
        await quickCheck(page, '#AnalystGroupsFormAnalystTableHeaderAddNew')) {
        return 'list';
    }

    // Quick check for analyst groups page - updated selectors
    if (await quickCheck(page, '#_ctrl0_ctl19_UCAnalystGroups_dataGrid') ||
        await quickCheck(page, 'table.DataGrid')) {
        return 'analystGroups';
    }

    return 'landing';
}

async function safelyGetElementText(page: Page, selector: string): Promise<string | null> {
    try {
        const element = await page.$(selector);
        if (!element) {
            console.log(`Element not found: ${selector}`);
            return null;
        }
        return await page.$eval(selector, (el: Element) => el.textContent || null);
    } catch (error) {
        console.log(`Error getting text from ${selector}`);
        return null;
    }
}

async function safelyClick(page: Page, selector: string): Promise<boolean> {
    try {
        const element = await page.$(selector);
        if (!element) {
            console.log(`Element not found for clicking: ${selector}`);
            return false;
        }
        await element.click();
        return true;
    } catch (error) {
        console.log(`Error clicking ${selector}`);
        return false;
    }
}

async function navigateToPage(page: Page, targetState: PageState, sectionId: string): Promise<boolean> {
    const currentState = await detectCurrentPage(page);
    if (currentState === targetState) return true;

    console.log(`Navigating from ${currentState} to ${targetState}...`);

    let attempts = 3;
    for (let attempt = 0; attempt < attempts; attempt++) {
        if (attempt > 0) {
            console.log(`Retrying navigation to ${targetState} (attempt ${attempt + 1}/${attempts})`);
        }

        try {
            switch (targetState) {
                case 'analystGroups':
                    if (currentState === 'landing') {
                        // Updated URL construction for analysts section
                        const url = new URL(page.url());
                        url.pathname = '/admin/content/analysts/default.aspx';
                        await page.goto(url.toString());
                        await waitTillHTMLRendered(page);
                        
                        // Additional wait and check for the analyst groups grid
                        await page.waitForTimeout(2000);
                        if (await quickCheck(page, '#_ctrl0_ctl19_UCAnalystGroups_dataGrid') ||
                            await quickCheck(page, 'table.DataGrid')) {
                            return true;
                        }
                    }
                    break;

                case 'list':
                    if (currentState === 'analystGroups') {
                        const editButtons = await page.$$('input[type="image"][id*="btnEdit"]');
                        if (editButtons.length > 0) {
                            await editButtons[0].click();
                            await waitTillHTMLRendered(page);
                            return true;
                        }
                    }
                    break;

                case 'edit':
                    if (currentState === 'list') {
                        if (!await safelyClick(page, '#AnalystGroupsFormAnalystTableHeaderAddNew')) {
                            continue;
                        }
                        await waitTillHTMLRendered(page);
                    }
                    break;
            }

            const newState = await detectCurrentPage(page);
            if (newState === targetState) {
                return true;
            }

            if (attempt === attempts - 1) {
                console.log(`Failed to navigate to ${targetState} after ${attempts} attempts`);
                return false;
            }

            await page.waitForTimeout(1000);
        } catch (error) {
            const err = error as Error;
            console.log(`Navigation error: ${err.message}`);
            if (attempt === attempts - 1) {
                throw err;
            }
        }
    }

    return false;
}

async function handleModal(page: Page, comment: string = 'aa'): Promise<boolean> {
    const modalSelectors = {
        modal: '#ConfimationModal',
        comment: '#ConfimationModalCommentTextArea',
        submit: '#ConfimationModalActionButton'
    };

    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            await page.waitForSelector(modalSelectors.modal, { visible: true, timeout: 5000 });
            await page.waitForSelector(modalSelectors.comment, { visible: true, timeout: 2000 });
            await page.type(modalSelectors.comment, comment);
            await page.waitForSelector(modalSelectors.submit, { visible: true, timeout: 2000 });
            await page.click(modalSelectors.submit);
            await page.waitForTimeout(2000);
            
            const modalStillVisible = await page.$(modalSelectors.modal);
            if (!modalStillVisible) {
                return true;
            }
        } catch (error) {
            const err = error as Error;
            console.log(`Modal interaction attempt ${attempt + 1} failed: ${err.message}`);
            await page.waitForTimeout(1000);
        }
    }

    return false;
}

async function calculateProgress(currentIndex: number, totalOperations: number): Promise<string> {
    const percentage = Math.round((currentIndex / totalOperations) * 100);
    return `(${percentage}%)`;
}

async function deleteAnalyst(page: Page, index: number, totalAnalysts: number, sectionId: string): Promise<boolean> {
    const nameSelector = `#AnalystGroupsFormAnalystTableBodyTableItemsItem${index}NameValue`;
    const analystName = await safelyGetElementText(page, nameSelector) || 'Unknown Analyst';
    const progress = await calculateProgress(index + 1, totalAnalysts);
    console.log(`Deleting analyst ${analystName}... ${progress}`);

    let attempts = 3;
    for (let attempt = 0; attempt < attempts; attempt++) {
        if (attempt > 0) {
            console.log(`Retrying deletion of analyst ${analystName} (attempt ${attempt + 1}/${attempts})`);
        }

        if (!await navigateToPage(page, 'list', sectionId)) {
            continue;
        }

        const status = await safelyGetElementText(
            page,
            `#AnalystGroupsFormAnalystTableBodyTableItemsItem${index}StatusValue`
        );
        
        if (status === null) {
            console.log('Failed to get analyst status, retrying...');
            continue;
        }

        if (status === 'For Approval' || status === 'Deleted') {
            console.log(`Skipping analyst ${analystName} - ${status}`);
            return true;
        }

        if (!await safelyClick(page, `button#AnalystGroupsFormAnalystTableBodyTableItemsItem${index}EditIcon`)) {
            continue;
        }
        await waitTillHTMLRendered(page);

        if (!await safelyClick(page, '#AnalystGroupsAnalystFormWorkflowActionDelete')) {
            continue;
        }

        if (await handleModal(page)) {
            console.log(`Successfully deleted analyst ${analystName}`);
            return true;
        }
    }

    console.log(`Failed to delete analyst ${analystName} after ${attempts} attempts`);
    return false;
}

export async function deleteAnalysts(page: Page, subdomain: string): Promise<void> {
    if (!subdomain) {
        throw new Error('Subdomain is required');
    }

    try {
        const sectionId = "c3f2f4c5-0f52-4380-9c47-ba861dba3c74";
        const siteUrl = `https://${subdomain}.s4.q4web.com`;
        
        if (!await navigateToPage(page, 'analystGroups', sectionId)) {
            throw new Error('Failed to navigate to analyst groups page');
        }
        await waitTillHTMLRendered(page);

        // Get all analyst groups
        const groups = await page.evaluate(() => {
            const rows = document.querySelectorAll('table#_ctrl0_ctl19_UCAnalystGroup_dataGrid tr');
            const groups = [];
            
            for (const row of Array.from(rows)) {
                const cells = row.querySelectorAll('td');
                if (cells.length && !row.classList.contains('DataGridHeader')) {
                    const editLink = cells[0].querySelector('a');
                    if (editLink) {
                        groups.push({
                            href: editLink.href,
                            name: cells[1].textContent?.trim() || ''
                        });
                    }
                }
            }
            return groups;
        });

        if (groups.length === 0) {
            console.log('No analyst groups found');
            return;
        }

        // Process each group
        for (const group of groups) {
            console.log(`\nProcessing group: ${group.name}`);
            
            await page.goto(group.href);
            await waitTillHTMLRendered(page);

            let deletedCount = 0;
            let totalAnalysts = 0;

            while (true) {
                // Check for existing analysts
                const hasAnalysts = await page.evaluate(() => {
                    const rows = document.querySelectorAll('tr.analyst');
                    return rows.length > 0;
                });

                if (!hasAnalysts) {
                    console.log('No more analysts to delete');
                    break;
                }

                // Get first analyst's edit button
                const editButton = await page.$('input[type="image"][id*="btnEdit"]');
                if (!editButton) {
                    console.log('No edit button found');
                    break;
                }

                await editButton.click();
                await waitTillHTMLRendered(page);

                // Click delete button
                const deleteButton = await page.$('input#_ctrl0_ctl19_btnDelete');
                if (!deleteButton) {
                    console.log('No delete button found');
                    break;
                }

                await deleteButton.click();
                await waitTillHTMLRendered(page);

                // Handle confirmation modal if present
                await handleModal(page);

                deletedCount++;
                totalAnalysts++;
                const progress = await calculateProgress(deletedCount, totalAnalysts);
                console.log(`Progress: ${progress}`);
            }

            console.log(`Completed group: ${group.name}. Deleted ${deletedCount} analysts.`);
        }

        console.log('\n✅ Analyst deletion completed successfully');

    } catch (error) {
        const err = error as Error;
        console.error('Error deleting analysts:', err.message);
        throw err;
    }
}

// Run directly if called from command line
if (require.main === module) {
    const subdomain = process.argv[2];
    if (!subdomain) {
        console.error('Usage: ts-node script.ts <subdomain>');
        process.exit(1);
    }

    (async () => {
        const { browser, page } = await launchPuppeteer();
        try {
            await deleteAnalysts(page, subdomain);
        } catch (error) {
            console.error('❌ Script failed:', (error as Error).message);
        } finally {
            await browser.close();
        }
    })().catch(error => {
        console.error('❌ Script failed:', (error as Error).message);
        process.exit(1);
    });
} 