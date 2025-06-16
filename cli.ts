import { SiteConfig } from './lib/core/types';
import { LoginManager } from './lib/core/LoginManager';
import { StateManager } from './lib/core/StateManager';
import { DeletePerson } from './lib/operations/DeletePerson';
import { DeleteFAQ } from './lib/operations/DeleteFAQ';
import { DeleteAnalyst } from './lib/operations/DeleteAnalyst';
import { DeleteDownloads } from './lib/operations/DeleteDownloads';
import { DeleteFinancials } from './lib/operations/DeleteFinancials';
import { DeletePresentations } from './lib/operations/DeletePresentations';
import { DeleteEvents } from './lib/operations/DeleteEvents';
import { DeletePRs } from './lib/operations/DeletePRs';
import { DeleteAll } from './lib/operations/DeleteAll';
import { ScrapeDocumentCategories } from './lib/operations/ScrapeDocumentCategories';
import { MigrateDocumentCategories } from './lib/operations/MigrateDocumentCategories';
import { ScrapeFAQ } from './lib/operations/ScrapeFAQ';
import { Base } from './lib/operations/Base';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as dotenv from 'dotenv';
import { MigrateFAQ } from './lib/operations/MigrateFAQ';
import { VerifyFAQs } from './lib/operations/VerifyFAQs';
import { getSafeSiteDirName } from './lib/helpers/siteName';
import MigrateAnalysts from './lib/operations/MigrateAnalysts';
import { cleanAnalystCommitteeJson } from './lib/operations/CleanAnalystCommitteeJson';
import { ScrapePerson } from './lib/operations/ScrapePerson';
import { MigratePerson } from './lib/operations/MigratePerson';
import { MigrateImages } from './lib/operations/MigrateImages';
import { MigrateDepartments } from './lib/operations/MigrateDepartments';
import { MigrateCommittees } from './lib/operations/MigrateCommittees';
import { MergePersonData } from './lib/operations/MergePersonData';
import { DeleteCommittee } from './lib/operations/DeleteCommittee';
import { MigrateAllPersons } from './lib/operations/MigrateAllPersons';
import SetupAnalystsCommitteeJson from './lib/operations/SetupAnalystsCommitteeJson';
import { UpdatePressReleaseLinks } from './lib/operations/UpdatePressReleaseLinks';

// Load environment variables
dotenv.config();

interface Sites {
    sites: SiteConfig[];
}

// Group operations by category
const OPERATION_CATEGORIES = {
    'delete': 'Delete Operations',
    'scrape': 'Scrape Operations',
    'migrate': 'Migration Operations',
    'misc': 'Miscellaneous Operations'
} as const;

// Available operations
const DELETE_OPERATIONS = {
    'delete-all': 'Delete all entries (comprehensive cleanup)',
    'delete-persons': 'Delete all person entries',
    'delete-faqs': 'Delete all FAQ entries',
    'delete-analysts': 'Delete all analyst entries',
    'delete-committees': 'Delete all committee entries',
    'delete-downloads': 'Delete all download list entries',
    'delete-financials': 'Delete all financial entries',
    'delete-presentations': 'Delete all presentation entries',
    'delete-events': 'Delete all event entries',
    'delete-prs': 'Delete all press release entries'
} as const;

// Scrape operations
const SCRAPE_OPERATIONS = {
    'scrape-document-categories': 'Scrape document categories from source site',
    'scrape-faqs': 'Scrape FAQs',
    'scrape-persons': 'Scrape person details from source site'
} as const;

// Migration operations
const MIGRATE_OPERATIONS = {
    'migrate-document-categories': 'Migrate document categories from source to destination site',
    'migrate-faqs': 'Migrate FAQs from source to destination site',
    'migrate-analysts': 'Migrate analysts (fields and entries) from JSON to destination site',
    'migrate-persons': 'Migrate persons from source to destination site',
    'migrate-images': 'Migrate images and create department folders',
    'migrate-departments': 'Migrate departments from source to destination site',
    'migrate-committees': 'Migrate committees from LLM data to destination site',
    'migrate-all-persons': 'Bulk migrate all person data and dependencies (committees, departments, images, and persons)'
} as const;

// Misc operations
const MISC_OPERATIONS = {
    'verify-faqs': 'Verify FAQ data across all sites',
    'setup-analysts-committee-json': 'Setup Analysts & Committee JSON (manual, for LLM extraction)',
    'clean-analyst-committee-json': 'Clean up analyst-committee-llm.json (remove html, instructions, examples, llmComplete)',
    'merge-person-data': 'Merge person data with committee information',
    'update-pr-links': 'Update links in press release entries'
} as const;

// Combined operations for operation class mapping
const OPERATIONS = {
    ...DELETE_OPERATIONS,
    ...SCRAPE_OPERATIONS,
    ...MIGRATE_OPERATIONS,
    ...MISC_OPERATIONS
} as const;

type OperationType = keyof typeof OPERATIONS;

// Define ClassOperationType for class-based operations only
const CLASS_BASED_OPERATIONS = {
    'delete-all': DeleteAll,
    'delete-persons': DeletePerson,
    'delete-faqs': DeleteFAQ,
    'delete-analysts': DeleteAnalyst,
    'delete-committees': DeleteCommittee,
    'delete-downloads': DeleteDownloads,
    'delete-financials': DeleteFinancials,
    'delete-presentations': DeletePresentations,
    'delete-events': DeleteEvents,
    'delete-prs': DeletePRs,
    'scrape-document-categories': ScrapeDocumentCategories,
    'migrate-document-categories': MigrateDocumentCategories,
    'scrape-faqs': ScrapeFAQ,
    'migrate-faqs': MigrateFAQ,
    'verify-faqs': VerifyFAQs,
    'migrate-analysts': MigrateAnalysts,
    'scrape-persons': ScrapePerson,
    'migrate-persons': MigratePerson,
    'migrate-images': MigrateImages,
    'migrate-departments': MigrateDepartments,
    'migrate-committees': MigrateCommittees,
    'migrate-all-persons': MigrateAllPersons,
    'merge-person-data': MergePersonData,
    'update-pr-links': UpdatePressReleaseLinks
} as const;
type ClassOperationType = keyof typeof CLASS_BASED_OPERATIONS;

const OPERATION_CLASSES: Record<ClassOperationType, new (site: SiteConfig, loginManager?: LoginManager) => Base> = CLASS_BASED_OPERATIONS;

const MISC_OPERATION_CLASSES = {
    'merge-person-data': MergePersonData
} as const;

async function loadSites(): Promise<Sites> {
    try {
        const sitesPath = join(__dirname, 'sites.json');
        const sitesContent = readFileSync(sitesPath, 'utf8');
        return JSON.parse(sitesContent);
    } catch (error) {
        console.error(chalk.red('Error loading sites.json:'), error);
        process.exit(1);
    }
}

async function selectSites(sites: SiteConfig[]): Promise<SiteConfig[]> {
    console.log('\n' + chalk.blue('Content Migration Tool - Site Selection\n'));
    
    // Display site list for reference
    sites.forEach((site: SiteConfig, index) => {
        console.log(`${index + 1}. ${chalk.green(site.name)} (${site.destination})`);
    });
    console.log(); // Empty line for spacing

    // Interactive multi-select using checkbox
    const { selectedSiteIndices } = await inquirer.prompt([
        {
            type: 'checkbox',
            name: 'selectedSiteIndices',
            message: 'Select sites:\n',
            choices: sites.map((site, index) => ({
                name: `${index + 1}. ${site.name} (${site.destination})`,
                value: index
            })),
            validate: (selected: number[]) => {
                if (selected.length === 0) {
                    return 'Please select at least one site';
                }
                return true;
            }
        }
    ]);
    
    const selectedSites = selectedSiteIndices.map((index: number) => sites[index]);

    // Show selection summary with spacing
    console.log('\n' + chalk.blue('Selected Sites:'));
    selectedSites.forEach((site: SiteConfig) => {
        console.log(chalk.green(`• ${site.name}`));
    });
    console.log(); // Empty line for spacing

    return selectedSites;
}

async function selectCategory(): Promise<string> {
    console.log(chalk.blue('\nOperation Categories:'));
    
    const { category } = await inquirer.prompt([
        {
            type: 'list',
            name: 'category',
            message: 'Select an operation category:',
            choices: [
                { name: `${OPERATION_CATEGORIES['delete']} (content deletion)`, value: 'delete' },
                { name: `${OPERATION_CATEGORIES['scrape']} (extract data from sites)`, value: 'scrape' },
                { name: `${OPERATION_CATEGORIES['migrate']} (transfer content between sites)`, value: 'migrate' },
                { name: `${OPERATION_CATEGORIES['misc']} (miscellaneous operations)`, value: 'misc' },
                // Add more operation categories here as needed
            ]
        }
    ]);

    return category;
}

async function selectDeleteOperation(): Promise<OperationType | 'back'> {
    console.log(chalk.blue('\nDelete Operations:'));
    
    const { operation } = await inquirer.prompt([
        {
            type: 'list',
            name: 'operation',
            message: 'Select a delete operation:',
            choices: [
                ...Object.entries(DELETE_OPERATIONS).map(([key, description]) => ({
                    name: `${description}`,
                    value: key
                })),
                new inquirer.Separator(),
                { name: '↩️  Back to category selection', value: 'back' }
            ]
        }
    ]);

    return operation as OperationType | 'back';
}

async function selectScrapeOperation(): Promise<OperationType | 'back'> {
    console.log(chalk.blue('\nScrape Operations:'));
    
    const { operation } = await inquirer.prompt([
        {
            type: 'list',
            name: 'operation',
            message: 'Select a scrape operation:',
            choices: [
                ...Object.entries(SCRAPE_OPERATIONS).map(([key, description]) => ({
                    name: `${description}`,
                    value: key
                })),
                new inquirer.Separator(),
                { name: '↩️  Back to category selection', value: 'back' }
            ]
        }
    ]);

    return operation as OperationType | 'back';
}

async function selectMigrateOperation(): Promise<OperationType | 'back'> {
    console.log(chalk.blue('\nMigration Operations:'));
    
    const { operation } = await inquirer.prompt([
        {
            type: 'list',
            name: 'operation',
            message: 'Select a migration operation:',
            choices: [
                ...Object.entries(MIGRATE_OPERATIONS).map(([key, description]) => ({
                    name: `${description}`,
                    value: key
                })),
                new inquirer.Separator(),
                { name: '↩️  Back to category selection', value: 'back' }
            ]
        }
    ]);

    return operation as OperationType | 'back';
}

async function selectMiscOperation(): Promise<OperationType | 'back'> {
    console.log(chalk.blue('\nMiscellaneous Operations:'));
    
    const { operation } = await inquirer.prompt([
        {
            type: 'list',
            name: 'operation',
            message: 'Select a miscellaneous operation:',
            choices: [
                ...Object.entries(MISC_OPERATIONS).map(([key, description]) => ({
                    name: `${description}`,
                    value: key
                })),
                new inquirer.Separator(),
                { name: '↩️  Back to category selection', value: 'back' }
            ]
        }
    ]);

    return operation as OperationType | 'back';
}

async function selectOperation(): Promise<OperationType> {
    console.log(chalk.blue('\nAvailable Operations:'));
    
    // Loop until a valid operation is selected (not 'back')
    while (true) {
        // First, select a category
        const category = await selectCategory();
        
        let operation: OperationType | 'back';
        
        // If it's the delete category, show the delete operations submenu
        if (category === 'delete') {
            operation = await selectDeleteOperation();
            if (operation === 'back') {
                console.log(chalk.blue('Returning to category selection...'));
                continue; // Go back to category selection
            }
            console.log('\n' + chalk.blue('Operation Summary:'));
            console.log(chalk.green(`• ${OPERATIONS[operation]}\n`));
            return operation;
        }
        
        // If it's the scrape category, show the scrape operations submenu
        if (category === 'scrape') {
            operation = await selectScrapeOperation();
            if (operation === 'back') {
                console.log(chalk.blue('Returning to category selection...'));
                continue; // Go back to category selection
            }
            console.log('\n' + chalk.blue('Operation Summary:'));
            console.log(chalk.green(`• ${OPERATIONS[operation]}\n`));
            return operation;
        }
        
        // If it's the migrate category, show the migrate operations submenu
        if (category === 'migrate') {
            operation = await selectMigrateOperation();
            if (operation === 'back') {
                console.log(chalk.blue('Returning to category selection...'));
                continue; // Go back to category selection
            }
            console.log('\n' + chalk.blue('Operation Summary:'));
            console.log(chalk.green(`• ${OPERATIONS[operation]}\n`));
            return operation;
        }
        
        // If it's the misc category, show the misc operations submenu
        if (category === 'misc') {
            operation = await selectMiscOperation();
            if (operation === 'back') {
                console.log(chalk.blue('Returning to category selection...'));
                continue; // Go back to category selection
            }
            console.log('\n' + chalk.blue('Operation Summary:'));
            console.log(chalk.green(`• ${OPERATIONS[operation]}\n`));
            return operation;
        }
        
        // Handle other categories here as they're added
        // This would be where new operation types would integrate
        
        // Default fallback (shouldn't reach here in normal operation)
        throw new Error('Invalid operation category');
    }
}

async function executeOperation(sites: SiteConfig[]) {
    const stateManager = StateManager.getInstance();
    const operation = await selectOperation();
    
    // Show current context
    console.log(chalk.blue('Current Operation:'));
    console.log(chalk.green(`• ${OPERATIONS[operation]}\n`));
    console.log(chalk.blue('Processing Sites:'));
    sites.forEach((site: SiteConfig) => console.log(chalk.green(`• ${site.name}`)));
    console.log(); // Empty line for spacing
    
    // Handle inline operation for setup-analysts-committee-json
    if (operation === 'setup-analysts-committee-json') {
        const setupOp = new SetupAnalystsCommitteeJson(sites);
        await setupOp.execute();
        return;
    }

    // Handle CleanAnalystCommitteeJson operation
    if (operation === 'clean-analyst-committee-json') {
        // Get safe site directory names
        const siteDirs = sites.map(site => getSafeSiteDirName(site.name));
        await cleanAnalystCommitteeJson(siteDirs);
        return;
    }

    // Create a queue of sites to process
    const siteQueue = [...sites];
    const activeSites = new Set<string>();
    let completedSites = 0;
    const totalSites = sites.length;
    
    // Ensure we're using the correct maxConcurrent value
    stateManager.clearAllState(); // Reset the state to get fresh maxConcurrentSites value
    const maxConcurrent = operation === 'delete-all' 
        ? Math.min(6, stateManager.getGlobalState().maxConcurrentSites) // Use up to 6 concurrent for delete-all
        : stateManager.getGlobalState().maxConcurrentSites;
    
    // Update global state
    stateManager.updateGlobalState({
        activeSites: 0,
        maxConcurrentSites: maxConcurrent,
        lastUpdated: Date.now()
    });

    console.log(chalk.blue('Concurrent Processing:'));
    if (operation === 'delete-all') {
        console.log(chalk.yellow('Note: Delete-all operations can use up to 6 concurrent sites'));
    }
    console.log(chalk.green(`• Maximum concurrent sites: ${maxConcurrent}\n`));

    async function processSite(site: SiteConfig, operation: OperationType): Promise<void> {
        if (!(operation in OPERATION_CLASSES)) {
            // Not a class-based operation, skip
            return;
        }
        let success = false;
        const loginManager = new LoginManager(site);
        loginManager.setShared(true);

        try {
            // Create operation instance using the mapping
            const OperationClass = OPERATION_CLASSES[operation as ClassOperationType];
            const operationInstance = new OperationClass(site, loginManager);
            success = await operationInstance.execute();
            await operationInstance.cleanup();
            
            if (!success) {
                console.log(chalk.red(`Operation failed for ${site.name}`));
                stateManager.updateSiteState(site.source, {
                    operationStatus: 'failed',
                    lastError: 'Operation failed'
                });
            } else {
                console.log(chalk.green(`Operation completed successfully for ${site.name}`));
                stateManager.updateSiteState(site.source, {
                    operationStatus: 'completed',
                    lastError: undefined
                });
            }
        } catch (error) {
            console.error(chalk.red(`Error processing ${site.name}:`), error);
            stateManager.updateSiteState(site.source, {
                operationStatus: 'failed',
                lastError: error instanceof Error ? error.message : 'Unknown error'
            });
        } finally {
            // Clean up the shared login manager at the end
            await loginManager.close();
            
            // Remove from active sites and increment completed count
            activeSites.delete(site.source);
            completedSites++;
            stateManager.updateGlobalState({
                activeSites: activeSites.size,
                lastUpdated: Date.now()
            });

            // Process next site if any remain in queue
            if (siteQueue.length > 0) {
                const nextSite = siteQueue.shift()!;
                activeSites.add(nextSite.source);
                processSite(nextSite, operation);
            }
        }
    }

    // Start initial batch of sites
    const initialBatch = siteQueue.splice(0, maxConcurrent);
    console.log(chalk.yellow(`Starting initial batch of ${initialBatch.length} sites (max concurrent: ${maxConcurrent})`));
    
    initialBatch.forEach(site => {
        activeSites.add(site.source);
        processSite(site, operation);
    });

    // Update active sites count
    stateManager.updateGlobalState({
        activeSites: activeSites.size,
        lastUpdated: Date.now()
    });

    // Wait for all sites to complete using a polling approach
    while (completedSites < totalSites) {
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(chalk.green(`\nAll ${totalSites} sites have completed processing.`));

    // Ask if user wants to continue
    console.log(); // Empty line for spacing
    const { shouldContinue } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'shouldContinue',
            message: 'Would you like to perform another operation?',
            default: false
        }
    ]);

    if (shouldContinue) {
        await main();
    } else {
        console.log(chalk.green('\nThank you for using the Content Migration Tool. Goodbye!'));
        process.exit(0);
    }
}

async function main() {
    try {
        if (!process.env.CMS_USER || !process.env.CMS_PASSWORD) {
            console.error(chalk.red('Error: CMS_USER and CMS_PASSWORD environment variables are required'));
            console.error(chalk.yellow('Please create a .env file with these variables'));
            process.exit(1);
        }

        const { sites } = await loadSites();
        const selectedSites = await selectSites(sites);
        await executeOperation(selectedSites);
        
    } catch (error) {
        console.error(chalk.red('Error:'), error);
        process.exit(1);
    }
}

// Run the CLI
main(); 