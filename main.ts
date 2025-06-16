import { deleteAnalysts } from './modules/cleanup-manager/01_deleteAnalysts';
import { createInterface } from 'readline';
import { execSync } from 'child_process';
import { CMSService } from './lib/services/CMS';
import { launchPuppeteer } from './lib/scraper/PuppeteerHelper';
import { Page, Browser } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

// Global settings
let DEBUG_MODE = true;

// Global state
interface BrowserState {
    browser: Browser;
    page: Page;
    cmsService: CMSService;
}

let browserStates: Map<string, BrowserState> = new Map();

// Types and interfaces
interface Operation {
    name: string;
    description: string;
    modules: Record<string, Module>;
}

interface Module {
    name: string;
    script: string;
    description: string;
    handler?: (page: Page, subdomain: string) => Promise<void>;
}

interface SitePair {
    name: string;
    source: string;
    destination: string;
}

interface SiteConfig {
    sites: SitePair[];
}

// Site configuration management
function loadSiteConfig(): SiteConfig {
    try {
        const configPath = path.join(__dirname, 'sites.json');
        if (!fs.existsSync(configPath)) {
            return { sites: [] };
        }
        const content = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(content) as SiteConfig;
    } catch (error) {
        console.error('Error loading site configuration:', error);
        return { sites: [] };
    }
}

async function selectSite(): Promise<SitePair[]> {
    const config = loadSiteConfig();
    
    if (config.sites.length === 0) {
        console.error('No sites configured in sites.json');
        return [];
    }

    console.log('\nAvailable sites:');
    config.sites.forEach((site, index) => {
        console.log(`${index + 1}. ${site.name} (${site.source} → ${site.destination})`);
    });
    console.log('\nEnter site numbers separated by spaces, or press Enter for all sites');
    console.log('Example: "1 3 5" for multiple sites');
    console.log('x. Exit');

    const answer = await askQuestion('\nSelect sites (or x to exit): ');
    
    if (answer.toLowerCase() === 'x') {
        return [];
    }

    // If Enter was pressed with no input, return all sites
    if (answer.trim() === '') {
        return config.sites;
    }

    // Parse multiple selections
    const selectedIndices = answer.split(' ')
        .map(num => parseInt(num.trim()) - 1)
        .filter(index => index >= 0 && index < config.sites.length);

    if (selectedIndices.length === 0) {
        console.log('No valid selections made');
        return [];
    }

    return selectedIndices.map(index => config.sites[index]);
}

// Available operations
const operations: Record<string, Operation> = {
    '1': {
        name: 'Cleanup',
        description: 'Remove content from destination site',
        modules: {
            '1': {
                name: 'Delete Analysts',
                script: '', // Empty since we're using direct handler
                description: 'Remove all analyst entries from the site',
                handler: async (page: Page, subdomain: string) => {
                    await deleteAnalysts(page, subdomain);
                }
            }
        }
    },
    '2': {
        name: 'Analysts',
        description: 'Manage analyst profiles',
        modules: {
            '1': {
                name: 'Create Analysts',
                script: './modules/analyst-manager/01_createAnalysts.ts',
                description: 'Create new analysts without deleting'
            }
        }
    },
    '3': {
        name: 'Downloads',
        description: 'Manage download lists',
        modules: {
            '1': {
                name: 'Scrape Index',
                script: './modules/downloads-manager/01_scrapeIndex.ts',
                description: 'Scrape download list index'
            },
            '2': {
                name: 'Scrape Details',
                script: './modules/downloads-manager/02_scrapeDetails.ts',
                description: 'Scrape download list details'
            },
            '3': {
                name: 'Download Files',
                script: './modules/downloads-manager/03_download.ts',
                description: 'Download files from source site'
            },
            '4': {
                name: 'Create Downloads',
                script: './modules/downloads-manager/04_create.ts',
                description: 'Create download lists on destination site'
            }
        }
    },
    '4': {
        name: 'FAQ',
        description: 'Manage FAQ content',
        modules: {
            '1': {
                name: 'Create FAQ',
                script: './modules/faq-manager/01_createFAQ.ts',
                description: 'Create FAQ entries'
            }
        }
    },
    '5': {
        name: 'Person List',
        description: 'Manage person list profiles',
        modules: {
            '1': {
                name: 'Create Person List',
                script: './modules/person-list-manager/01_createPersons.ts',
                description: 'Create person list entries'
            }
        }
    },
    '6': {
        name: 'Misc',
        description: 'Miscellaneous operations',
        modules: {
            '1': {
                name: 'Update PR Links',
                script: './lib/operations/UpdatePressReleaseLinks.ts',
                description: 'Update links in press release entries'
            }
        }
    }
};

// Helper functions
function clearScreen(): void {
    console.clear();
    console.log('🔄 Content Migration Tool');
    console.log(`${DEBUG_MODE ? '🐛 Debug Mode Enabled' : ''}\n`);
}

async function askQuestion(query: string): Promise<string> {
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => rl.question(query, (answer) => {
        rl.close();
        resolve(answer.trim());
    }));
}

async function ensureLogin(subdomain: string): Promise<Page> {
    let state = browserStates.get(subdomain);
    
    if (!state) {
        const { page, browser } = await launchPuppeteer({ 
            headless: !DEBUG_MODE,
            width: 1600,
            height: 900
        });
        
        const siteUrl = `https://${subdomain}.s4.q4web.com`;
        const cmsService = new CMSService({ 
            url: new URL(`${siteUrl}/admin/login.aspx`),
            page: page 
        });

        console.log(`🔑 Logging into CMS for ${subdomain}...`);
        await cmsService.login();
        console.log(`✅ Login successful for ${subdomain}`);

        state = { browser, page, cmsService };
        browserStates.set(subdomain, state);
    }
    return state.page;
}

async function runScript(script: string, subdomain: string): Promise<void> {
    try {
        if (script) {
            console.log(`\n🚀 Running ${script}...\n`);
            execSync(`ts-node ${script} ${subdomain}`, { stdio: 'inherit' });
        }
    } catch (error) {
        const err = error as Error;
        console.error('❌ Script failed:', err.message);
        throw err;
    }
}

async function showModules(operation: Operation, site: SitePair): Promise<void> {
    const subdomain = site.destination;
    console.log(`\n📦 ${operation.name} Modules for ${site.name}:`);
    
    for (const [key, module] of Object.entries(operation.modules)) {
        console.log(`${key}: ${module.name} - ${module.description}`);
    }
    console.log('x: Skip this site');

    const answer = await askQuestion(`\nSelect module for ${site.name}: `);
    const selectedModule = operation.modules[answer];

    if (!selectedModule) {
        if (answer.toLowerCase() !== 'x') {
            console.log(`❌ Invalid module selected for ${site.name}`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        return;
    }

    try {
        if (selectedModule.handler) {
            const page = await ensureLogin(subdomain);
            await selectedModule.handler(page, subdomain);
        } else if (selectedModule.script) {
            await runScript(selectedModule.script, subdomain);
        }
    } catch (error) {
        const err = error as Error;
        console.error(`❌ Operation failed for ${site.name}:`, err.message);
    }
}

async function main(): Promise<void> {
    try {
        clearScreen();
        
        // Ask about debug mode
        const debugAnswer = await askQuestion('Enable debug mode? (y/N): ');
        DEBUG_MODE = debugAnswer.toLowerCase() === 'y';
        
        clearScreen();

        while (true) {
            // Select sites
            const selectedSites = await selectSite();
            if (selectedSites.length === 0) {
                console.log('\n👋 Goodbye!');
                process.exit(0);
            }

            console.log(`\nSelected ${selectedSites.length} site(s):\n`);
            for (const site of selectedSites) {
                console.log(`${site.name}:`);
                console.log(`Source: ${site.source}`);
                console.log(`Destination: ${site.destination}\n`);
            }

            // Show available operations
            console.log('Available operations:');
            Object.entries(operations).forEach(([key, op]) => {
                console.log(`${key}. ${op.name} - ${op.description}`);
            });
            console.log('x. Exit');

            const operationChoice = await askQuestion('\nSelect operation (or x to exit): ');
            
            if (operationChoice.toLowerCase() === 'x') {
                console.log('\n👋 Goodbye!');
                process.exit(0);
            }

            const selectedOperation = operations[operationChoice];
            if (!selectedOperation) {
                console.log('\n❌ Invalid operation selected');
                continue;
            }

            // Show available modules for the operation
            await Promise.all(selectedSites.map(site => 
                showModules(selectedOperation, site)
            ));

            // Ask to continue or exit
            const continueAnswer = await askQuestion('\nContinue with another operation? (Y/n): ');
            if (continueAnswer.toLowerCase() === 'n') {
                console.log('\n👋 Goodbye!');
                process.exit(0);
            }
            
            clearScreen();
        }
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    } finally {
        // Clean up browser instances
        for (const state of browserStates.values()) {
            await state.browser.close();
        }
    }
}

// Start the application
main().catch(error => {
    console.error('❌ Application failed:', error.message);
    process.exit(1);
}); 