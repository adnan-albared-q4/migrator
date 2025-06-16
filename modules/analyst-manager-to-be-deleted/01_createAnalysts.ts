import settings from './_settings';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { AnalystData } from './_settings';
import { launchPuppeteer } from '../../lib/scraper/PuppeteerHelper';
import { CMSService } from '../../lib/services/CMS';
import { waitTillHTMLRendered } from '../../lib/helpers/Puppeteer';
import * as puppeteer from 'puppeteer';

// Load environment variables
dotenv.config();

interface AnalystFile {
    analysts: AnalystData[];
}

function loadAnalystData(): AnalystData[] {
    const filePath = path.join(__dirname, 'analysts.json');
    
    if (!fs.existsSync(filePath)) {
        throw new Error(`analysts.json file not found at ${filePath}. Please create it in the analyst-manager directory.`);
    }

    try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(fileContent) as AnalystFile;

        // Validate the data
        if (!Array.isArray(data.analysts)) {
            throw new Error('Invalid JSON format: "analysts" array is required');
        }

        // Process each analyst entry
        data.analysts.forEach((analyst, index) => {
            if (!analyst.firm) {
                throw new Error(`Invalid analyst data at index ${index}: firm is required`);
            }
            // If no analyst name is provided, use the firm name
            if (!analyst.analyst) {
                analyst.analyst = analyst.firm;
            }
        });

        // Return the processed data
        return data.analysts;
    } catch (error) {
        const err = error as Error;
        throw new Error(`Failed to load analyst data: ${err.message}`);
    }
}

async function askUserAction(siteUrl: string): Promise<'create' | 'delete' | 'both' | null> {
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        console.log(`\nSite: ${siteUrl}`);
        console.log('\nPlease choose an action:');
        console.log('1: Delete existing analysts and create new ones');
        console.log('2: Create new analysts without deleting');
        console.log('d: Delete existing analysts only');
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

async function quickCheck(page: puppeteer.Page, selector: string): Promise<boolean> {
    try {
        // Quick check without waiting
        const element = await page.$(selector);
        return !!element;
    } catch (error) {
        const err = error as Error;
        console.log(`Quick check failed for ${selector}: ${err.message}`);
        return false;
    }
}

async function waitForElement(page: puppeteer.Page, selector: string, maxAttempts = 3): Promise<boolean> {
    // First try quick checks (3 rapid attempts with minimal delay)
    for (let i = 0; i < 3; i++) {
        if (await quickCheck(page, selector)) {
            return true;
        }
        await page.waitForTimeout(50); // Reduced from 100ms to 50ms
    }

    // If quick checks fail, fall back to slower attempts
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            await page.waitForSelector(selector, { timeout: 300 }); // Reduced from 500ms to 300ms
            return true;
        } catch (error) {
            if (attempt === maxAttempts - 1) {
                return false;
            }
            await page.waitForTimeout(300); // Reduced from 500ms to 300ms
        }
    }
    return false;
}

type PageState = 'landing' | 'analystGroups' | 'list' | 'edit';

async function detectCurrentPage(page: puppeteer.Page): Promise<PageState> {
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

    // Quick check for analyst groups page
    if (await quickCheck(page, 'button#AnalystGroupsTableBodyTableItemsItem0EditIcon')) {
        return 'analystGroups';
    }

    return 'landing';
}

async function safelyGetElementText(page: puppeteer.Page, selector: string): Promise<string | null> {
    // Try quick checks first
    for (let i = 0; i < 5; i++) {
        try {
            const element = await page.$(selector);
            if (element) {
                return await page.$eval(selector, (el: Element) => el.textContent || null);
            }
            await page.waitForTimeout(100);
        } catch {
            continue;
        }
    }

    // Fall back to original behavior
    try {
        const element = await page.$(selector);
        if (!element) {
            console.log(`Element not found: ${selector}, will retry after page recovery`);
            return null;
        }
        return await page.$eval(selector, (el: Element) => el.textContent || null);
    } catch (error) {
        console.log(`Error getting text from ${selector}, will retry after page recovery`);
        return null;
    }
}

async function safelyClick(page: puppeteer.Page, selector: string): Promise<boolean> {
    // Try quick checks first
    for (let i = 0; i < 5; i++) {
        try {
            const element = await page.$(selector);
            if (element) {
                await element.click();
                return true;
            }
            await page.waitForTimeout(100);
        } catch {
            continue;
        }
    }

    // Fall back to original behavior
    try {
        const element = await page.$(selector);
        if (!element) {
            console.log(`Element not found for clicking: ${selector}, will retry after page recovery`);
            return false;
        }
        await element.click();
        return true;
    } catch (error) {
        console.log(`Error clicking ${selector}, will retry after page recovery`);
        return false;
    }
}

async function safelyType(page: puppeteer.Page, selector: string, text: string): Promise<boolean> {
    // Try quick checks first
    for (let i = 0; i < 5; i++) {
        try {
            const element = await page.$(selector);
            if (element) {
                await element.type(text);
                return true;
            }
            await page.waitForTimeout(100);
        } catch {
            continue;
        }
    }

    // Fall back to original behavior
    try {
        const element = await page.$(selector);
        if (!element) {
            console.log(`Element not found for typing: ${selector}, will retry after page recovery`);
            return false;
        }
        await element.type(text);
        return true;
    } catch (error) {
        console.log(`Error typing into ${selector}, will retry after page recovery`);
        return false;
    }
}

async function navigateToPage(page: puppeteer.Page, targetState: PageState, maxAttempts = 3): Promise<boolean> {
    const startTime = Date.now();
    const currentState = await detectCurrentPage(page);
    if (currentState === targetState) return true;

    console.log(`Navigating from ${currentState} to ${targetState}...`);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (attempt > 0) {
            console.log(`Retrying navigation to ${targetState} (attempt ${attempt + 1}/${maxAttempts})`);
        }

        switch (targetState) {
            case 'analystGroups':
                if (currentState === 'landing') {
                    const baseUrl = settings.baseUrlToCreateTo;
                    if (!baseUrl) {
                        throw new Error('baseUrlToCreateTo is not defined in settings');
                    }
                    const analystGroupsUrl = new URL(baseUrl.toString());
                    analystGroupsUrl.pathname = '/admin/studio/';
                    analystGroupsUrl.hash = '#/analyst-groups';
                    await page.goto(analystGroupsUrl.toString());
                    await waitTillHTMLRendered(page);
                }
                break;

            case 'list':
                if (currentState === 'analystGroups') {
                    if (!await safelyClick(page, 'button#AnalystGroupsTableBodyTableItemsItem0EditIcon')) {
                        continue;
                    }
                    await waitTillHTMLRendered(page);
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
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`Navigation completed in ${duration}s`);
            return true;
        }

        await page.waitForTimeout(500); // Reduced from 1000ms to 500ms
    }

    console.log(`Failed to navigate to ${targetState} after ${maxAttempts} attempts`);
    return false;
}

async function handleModal(page: puppeteer.Page, comment: string = 'aa'): Promise<boolean> {
    const modalSelectors = {
        modal: '#ConfimationModal',
        comment: '#ConfimationModalCommentTextArea',
        submit: '#ConfimationModalActionButton'
    };

    // Try to interact with modal
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            // Wait for modal to be visible
            await page.waitForSelector(modalSelectors.modal, { visible: true, timeout: 5000 });
            
            // Fill in the comment
            await page.waitForSelector(modalSelectors.comment, { visible: true, timeout: 2000 });
            await page.type(modalSelectors.comment, comment);
            
            // Click the delete button
            await page.waitForSelector(modalSelectors.submit, { visible: true, timeout: 2000 });
            await page.click(modalSelectors.submit);
            
            // Wait for modal to disappear
            await page.waitForTimeout(2000);
            
            // Verify modal is gone
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

async function deleteAnalyst(page: puppeteer.Page, index: number, totalAnalysts: number, maxAttempts = 3): Promise<boolean> {
    // Get analyst name first
    const nameSelector = `#AnalystGroupsFormAnalystTableBodyTableItemsItem${index}NameValue`;
    const analystName = await safelyGetElementText(page, nameSelector) || 'Unknown Analyst';
    const progress = await calculateProgress(index + 1, totalAnalysts);
    console.log(`Deleting analyst ${analystName}... ${progress}`);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (attempt > 0) {
            console.log(`Retrying deletion of analyst ${analystName} (attempt ${attempt + 1}/${maxAttempts})`);
        }

        // Ensure we're on the list page
        if (!await navigateToPage(page, 'list')) {
            continue;
        }

        // Get analyst status
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

        // Click edit
        if (!await safelyClick(page, `button#AnalystGroupsFormAnalystTableBodyTableItemsItem${index}EditIcon`)) {
            continue;
        }
        await waitTillHTMLRendered(page);

        // Click delete
        if (!await safelyClick(page, '#AnalystGroupsAnalystFormWorkflowActionDelete')) {
            continue;
        }

        // Handle modal
        if (await handleModal(page)) {
            console.log(`Successfully deleted analyst ${analystName}`);
            return true;
        }
    }

    console.log(`Failed to delete analyst ${analystName} after ${maxAttempts} attempts`);
    return false;
}

async function fillAnalystForm(page: puppeteer.Page, analyst: AnalystData, currentIndex: number, totalAnalysts: number, maxAttempts = 3): Promise<boolean> {
    const progress = await calculateProgress(currentIndex + 1, totalAnalysts);
    console.log(`Filling form for ${analyst.analyst}... ${progress}`);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (attempt > 0) {
            console.log(`Retrying form fill for ${analyst.analyst} (attempt ${attempt + 1}/${maxAttempts})`);
        }

        // Required fields
        if (!await safelyType(page, '#AnalystGroupsAnalystFormNameFieldInput', analyst.analyst) ||
            !await safelyType(page, '#AnalystGroupsAnalystFormFirmFieldInput', analyst.firm)) {
            if (attempt < maxAttempts - 1) {
                console.log('Failed to fill required fields, retrying...');
                await navigateToPage(page, 'edit');
                continue;
            }
            return false;
        }

        // Optional fields with type-safe access
        const optionalFields: Array<{ key: keyof AnalystData, selector: string }> = [
            { key: 'title', selector: '#AnalystGroupsAnalystFormTitleFieldInput' },
            { key: 'url', selector: '#AnalystGroupsAnalystFormUrlFieldInput' },
            { key: 'email', selector: '#AnalystGroupsAnalystFormEmailFieldInput' },
            { key: 'phone', selector: '#AnalystGroupsAnalystFormPhoneFieldInput' },
            { key: 'location', selector: '#AnalystGroupsAnalystFormLocationFieldInput' },
            { key: 'targetPrice', selector: '#AnalystGroupsAnalystFormTargetPriceFieldInput' },
            { key: 'reportingDate', selector: '#AnalystGroupsAnalystFormReportingDateFieldInput' },
            { key: 'rating', selector: '#AnalystGroupsAnalystFormRatingFieldInput' }
        ];

        for (const field of optionalFields) {
            const value = analyst[field.key];
            if (value) {
                if (!await safelyType(page, field.selector, value)) {
                    console.log(`Failed to fill optional field ${field.key}, continuing...`);
                }
            }
        }

        console.log(`Successfully filled form for ${analyst.analyst}`);
        return true;
    }

    console.log(`Failed to fill form for ${analyst.analyst} after ${maxAttempts} attempts`);
    return false;
}

async function askSubdomain(): Promise<string> {
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        console.log('\nPlease enter the subdomain (e.g., "axosfinancial2025snprd"):');
        readline.question('Subdomain: ', (answer: string) => {
            readline.close();
            resolve(answer.trim());
        });
    });
}

async function main(): Promise<void> {
    // Validate environment variables
    if (!process.env.CMS_USER || !process.env.CMS_PASSWORD) {
        throw new Error('CMS_USER and CMS_PASSWORD environment variables are required');
    }

    // Load analyst data
    const analysts = loadAnalystData();
    console.log(`📊 Found ${analysts.length} analysts to process`);

    // Get subdomain
    const subdomain = await askSubdomain();
    if (!subdomain) {
        console.log('❌ No subdomain provided. Exiting...');
        process.exit(1);
    }

    // Construct site URL and update settings
    const siteUrl = `https://${subdomain}.s4.q4web.com`;
    console.log(`🌐 Site URL: ${siteUrl}`);
    settings.baseUrlToCreateTo = new URL(`${siteUrl}/admin/login.aspx`);

    // Ask user what action to take
    const action = await askUserAction(siteUrl);
    if (!action) {
        console.log('❌ No action selected. Exiting...');
        process.exit(0);
    }

    // Launch browser
    const { page } = await launchPuppeteer({
        headless: false,
        width: 1600,
        height: 900
    });

    try {
        // Navigate to login page and ensure we're logged in
        await page.goto(settings.baseUrlToCreateTo.toString());
        await ensureLogin(page);

        // Navigate to analyst groups page
        if (!await navigateToPage(page, 'analystGroups')) {
            throw new Error('Failed to navigate to analyst groups page');
        }

        // Click first analyst group
        await safelyClick(page, 'button#AnalystGroupsTableBodyTableItemsItem0EditIcon');
        await waitTillHTMLRendered(page);

        // Process analysts based on user action
        if (action === 'delete' || action === 'both') {
            console.log('\n🗑️  Deleting existing analysts...');
            let index = 0;
            while (await quickCheck(page, `#AnalystGroupsFormAnalystTableBodyTableItemsItem${index}NameValue`)) {
                await deleteAnalyst(page, index, analysts.length);
                // Don't increment index since deleting shifts the list up
            }
        }

        if (action === 'create' || action === 'both') {
            console.log('\n📝 Creating new analysts...');
            for (let i = 0; i < analysts.length; i++) {
                await fillAnalystForm(page, analysts[i], i, analysts.length);
            }
        }

        console.log('\n✨ Process complete!');
    } catch (error) {
        const err = error as Error;
        console.error('❌ An error occurred:', err.message);
        process.exit(1);
    } finally {
        await page.close();
    }
}

async function ensureLogin(page: puppeteer.Page): Promise<void> {
    if (page.url().includes('/login')) {
        console.log('🔑 Logging in...');
        try {
            const username = process.env.CMS_USER;
            const password = process.env.CMS_PASSWORD;

            if (!username || !password) {
                throw new Error('CMS_USER and CMS_PASSWORD environment variables are required');
            }

            // Wait for username field with a 30-second timeout
            await page.waitForSelector('#txtUserName', { timeout: 30000 });
            
            // Perform login
            await page.evaluate(
                (user: string, pass: string) => {
                    (document.querySelector<HTMLInputElement>("#txtUserName")!).value = user;
                    (document.querySelector<HTMLInputElement>("#txtPassword")!).value = pass;
                    (document.querySelector<HTMLButtonElement>("#btnSubmit")!).click();
                },
                username,
                password
            );

            // Wait for navigation with a 30-second timeout
            await Promise.race([
                page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }),
                waitTillHTMLRendered(page)
            ]);

            // Short delay to ensure everything is loaded
            await page.waitForTimeout(2000);
            console.log('✅ Login successful');
        } catch (error) {
            const err = error as Error;
            console.error('❌ Login failed:', err.message);
            throw err;
        }
    }
}

// Start the script
main().catch((error: Error) => {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
}); 