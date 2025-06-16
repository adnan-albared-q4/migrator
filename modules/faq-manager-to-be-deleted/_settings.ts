import { ScraperSettings } from '../../lib/scraper/ScraperSettings';
import * as fs from 'fs';
import * as path from 'path';
import { createInterface } from 'readline';

interface CompanySettings {
	name: string;
	baseUrlToScrapeFrom: string;
	baseUrlToCreateTo: string;
}

interface Settings {
	companies: CompanySettings[];
	defaultCompany?: string;
}

export interface ProcessedSettings {
	name: string;
	baseUrlToScrapeFrom: string;
	baseUrlToCreateTo: string;
}

// Load settings from JSON file
function loadSettings(): Settings {
	try {
		const settingsPath = path.join(__dirname, 'settings.json');
		
		if (fs.existsSync(settingsPath)) {
			const content = fs.readFileSync(settingsPath, 'utf8');
			return JSON.parse(content) as Settings;
		}
		return { companies: [] };
	} catch (error) {
		const err = error as Error;
		console.error('Error loading settings:', err.message);
		return { companies: [] };
	}
}

// Save settings to JSON file
function saveSettings(settings: Settings): void {
	try {
		const settingsPath = path.join(__dirname, 'settings.json');
		fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
	} catch (error) {
		const err = error as Error;
		console.error('Error saving settings:', err.message);
	}
}

async function prompt(question: string): Promise<string> {
	const readline = createInterface({
		input: process.stdin,
		output: process.stdout
	});

	return new Promise<string>((resolve) => {
		readline.question(question, (answer: string) => {
			readline.close();
			resolve(answer.trim());
		});
	});
}

async function selectOrCreateCompany(): Promise<CompanySettings> {
	const settings = loadSettings();
	
	if (settings.companies.length > 0) {
		console.log('\nAvailable companies:');
		settings.companies.forEach((company, index) => {
			console.log(`${index + 1}. ${company.name}`);
		});
		console.log(`${settings.companies.length + 1}. Create new company`);

		const selection = await prompt('\nSelect a company or create new (enter number): ');
		const index = parseInt(selection) - 1;

		if (index >= 0 && index < settings.companies.length) {
			return settings.companies[index];
		}
	}

	// Create new company
	const name = await prompt('Enter company name: ');
	const fromUrl = await prompt('Enter source subdomain (e.g., atlanticus2020index): ');
	const toUrl = await prompt('Enter destination subdomain (e.g., atlanticus2025snprd): ');

	const newCompany: CompanySettings = {
		name,
		baseUrlToScrapeFrom: fromUrl,
		baseUrlToCreateTo: toUrl
	};

	settings.companies.push(newCompany);
	saveSettings(settings);

	return newCompany;
}

function constructFullUrl(subdomain: string): string {
	return `https://${subdomain}.s4.q4web.com/admin/login.aspx`;
}

let selectedCompany: CompanySettings | null = null;

const settingsManager = {
	async getSettings(forceNew = false): Promise<ProcessedSettings> {
		if (forceNew || !selectedCompany) {
			selectedCompany = await selectOrCreateCompany();
		}
		return {
			name: selectedCompany.name,
			baseUrlToScrapeFrom: constructFullUrl(selectedCompany.baseUrlToScrapeFrom),
			baseUrlToCreateTo: constructFullUrl(selectedCompany.baseUrlToCreateTo)
		};
	},
	
	async getSettingsForCompany(companyName: string): Promise<ProcessedSettings> {
		const settings = loadSettings();
		const company = settings.companies.find(c => c.name === companyName);
		
		if (!company) {
			throw new Error(`Company "${companyName}" not found in settings`);
		}
		
		return {
			name: company.name,
			baseUrlToScrapeFrom: constructFullUrl(company.baseUrlToScrapeFrom),
			baseUrlToCreateTo: constructFullUrl(company.baseUrlToCreateTo)
		};
	}
};

export default settingsManager;
