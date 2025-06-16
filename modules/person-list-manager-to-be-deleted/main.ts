import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import settings from './_settings';
import { CompanyPair, Settings } from './_settings';
import { scrapePersons } from './01_scrapePerson';
import { downloadImages } from './02_downloadImages';
import { mapCommittees } from './03_mapCommittees';
import { createPersons } from './04_createPersons';
import { askQuestion, closeReadline } from '../../lib/helpers/ReadlineUtil';

const MAX_COMPANIES = 5;

function loadSettings(): Settings {
    const settingsPath = path.join(__dirname, 'settings.json');
    if (!fs.existsSync(settingsPath)) {
        return { companies: [] };
    }
    try {
        const data = fs.readFileSync(settingsPath, 'utf8');
        return JSON.parse(data) as Settings;
    } catch (error) {
        const err = error as Error;
        console.error('Error loading settings:', err.message);
        return { companies: [] };
    }
}

function saveSettings(settings: Settings): void {
    const settingsPath = path.join(__dirname, 'settings.json');
    try {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    } catch (error) {
        const err = error as Error;
        console.error('Error saving settings:', err.message);
    }
}

function addCompanyToSettings(settings: Settings, company: CompanyPair): void {
    // Remove if company pair already exists
    settings.companies = settings.companies.filter(c => 
        !(c.from === company.from && c.to === company.to)
    );

    // Add new company pair to the front
    settings.companies.unshift(company);

    // Keep only the most recent 5
    if (settings.companies.length > MAX_COMPANIES) {
        settings.companies = settings.companies.slice(0, MAX_COMPANIES);
    }

    saveSettings(settings);
}

async function selectCompanyPair(settings: Settings): Promise<CompanyPair> {
    while (true) {
        console.log('\nRecent companies:');
        settings.companies.forEach((company, index) => {
            console.log(`${index + 1}: ${company.from} → ${company.to}`);
        });
        console.log('o: Other (enter new company)');
        console.log('x: Exit');

        const answer = await askQuestion('\nSelect option: ');

        if (answer.toLowerCase() === 'x') {
            process.exit(0);
        }

        if (answer.toLowerCase() === 'o') {
            console.log('\nEnter new company details:');
            const from = await askQuestion('Source subdomain (e.g., company2020index): ');
            if (!from) {
                console.log('Source subdomain cannot be empty. Please try again.');
                continue;
            }

            const to = await askQuestion('Destination subdomain (e.g., company2025snprd): ');
            if (!to) {
                console.log('Destination subdomain cannot be empty. Please try again.');
                continue;
            }

            const newCompany = { from, to };
            addCompanyToSettings(settings, newCompany);
            return newCompany;
        }

        const index = parseInt(answer) - 1;
        if (index >= 0 && index < settings.companies.length) {
            return settings.companies[index];
        }

        console.log('Invalid selection. Please try again.');
    }
}

async function performFullOperation(company: CompanyPair) {
    // Step 1: Delete placeholders
    console.log('\n1. Deleting existing placeholders...');
    await createPersons(company.to, true);
    
    // Step 2: Scrape persons
    console.log('\n2. Scraping persons from source...');
    await scrapePersons(company.from);
    
    // Step 3: Download images
    console.log('\n3. Downloading person images...');
    await downloadImages(company.to);
    
    // Ask about committee mapping
    const includeCommittees = await askQuestion('\nDo you want to map committees? (y/n): ');
    
    if (includeCommittees.toLowerCase() === 'y') {
        // Step 4: Map committees
        console.log('\n4. Mapping committees...');
        await mapCommittees(company.to);
    } else {
        console.log('\nSkipping committee mapping...');
    }
    
    // Step 5: Create persons
    console.log('\n5. Creating persons in destination...');
    await createPersons(company.to);
}

async function main() {
    try {
        console.log('Person Management Script\n');
        
        // Load existing settings
        const settings = loadSettings();
        
        // Select company pair
        const company = await selectCompanyPair(settings);

        // Choose operation
        console.log('\nAvailable operations:');
        console.log('1. Full operation (delete placeholders → scrape → download images → map committees → create)');
        console.log('2. Delete placeholders only');
        console.log('3. Scrape persons only');
        console.log('4. Download images only');
        console.log('5. Map committees only');
        console.log('6. Create persons only');
        
        const operation = await askQuestion('\nSelect operation (1-6): ');

        try {
            switch (operation) {
                case '1':
                    await performFullOperation(company);
                    break;

                case '2':
                    console.log('\nDeleting placeholders in destination...');
                    await createPersons(company.to, true);
                    break;

                case '3':
                    console.log('\nScraping persons from source...');
                    await scrapePersons(company.from);
                    break;

                case '4':
                    console.log('\nDownloading person images...');
                    await downloadImages(company.to);
                    break;

                case '5':
                    console.log('\nMapping committees...');
                    await mapCommittees(company.to);
                    break;

                case '6':
                    console.log('\nCreating persons in destination...');
                    await createPersons(company.to);
                    break;

                default:
                    console.error('Invalid operation selected');
                    process.exit(1);
            }

            console.log('\nOperation completed successfully!');
        } catch (error) {
            console.error('Error:', error);
            process.exit(1);
        }
    } finally {
        closeReadline();
    }
}

main().catch(console.error); 