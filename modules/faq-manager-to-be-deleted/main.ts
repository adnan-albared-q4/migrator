import { createInterface } from 'readline';
import { spawn } from 'child_process';
import settings, { ProcessedSettings } from './_settings';
import { execSync } from 'child_process';

interface Step {
    name: string;
    script: string;
    description: string;
}

interface Steps {
    [key: string]: Step;
}

const steps: Steps = {
    '1': {
        name: 'Scrape FAQ',
        script: 'modules/faq-manager/01_scrapeFAQ.ts',
        description: 'Scrapes FAQ content from source site'
    },
    '2': {
        name: 'Create FAQ',
        script: 'modules/faq-manager/02_createFAQ.ts',
        description: 'Creates FAQ entries in the target CMS'
    },
    '99': {
        name: 'Delete FAQ',
        script: 'modules/faq-manager/99_deleteFAQ.ts',
        description: 'Delete all FAQs from selected list'
    },
    'c': {
        name: 'Change Company',
        script: '',
        description: 'Select a different company'
    },
    'x': {
        name: 'Exit',
        script: '',
        description: 'Terminate the script'
    }
};

function clearScreen() {
    try {
        execSync('clear', {stdio: 'inherit'});
    } catch {
        try {
            execSync('cls', {stdio: 'inherit'});
        } catch {
            console.clear();
        }
    }
}

async function askQuestion(query: string): Promise<string> {
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => rl.question(query, (answer) => {
        rl.close();
        resolve(answer);
    }));
}

async function runScript(scriptPath: string, companyName: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const process = spawn('ts-node', [scriptPath, companyName], {
            stdio: 'inherit'
        });

        process.on('error', (error) => {
            reject(error);
        });

        process.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Process exited with code ${code}`));
            }
        });
    });
}

async function displayMenu(companySettings: ProcessedSettings): Promise<void> {
    console.clear();
    console.log('🚀 FAQ Migration Tool\n');
    console.log(`Current Company: ${companySettings.name}`);
    console.log(`Source: ${companySettings.baseUrlToScrapeFrom}`);
    console.log(`Destination: ${companySettings.baseUrlToCreateTo}\n`);
    
    console.log('Available steps:');
    Object.entries(steps).forEach(([key, value]) => {
        console.log(`  ${key}. ${value.name} - ${value.description}`);
    });
    console.log();
}

async function main() {
    try {
        clearScreen();
        let companySettings = await settings.getSettings();
        
        while (true) {
            await displayMenu(companySettings);
            
            const answer = (await askQuestion('Enter selection (1-2, 99, c=change company, x=exit): ')).trim();
            const step = steps[answer];

            if (!step) {
                console.error('❌ Invalid selection');
                await askQuestion('Press Enter to continue...');
                continue;
            }

            // Handle special commands
            if (answer === 'x') {
                console.log('\n👋 Goodbye!');
                process.exit(0);
            }

            if (answer === 'c') {
                companySettings = await settings.getSettings(true); // true to force new selection
                continue;
            }

            // Run selected script
            console.log(`\n📝 Running ${step.name}...\n`);

            try {
                await runScript(step.script, companySettings.name);
                console.log(`\n✅ ${step.name} completed successfully`);
                await askQuestion('Press Enter to continue...');
            } catch (error) {
                const err = error as Error;
                console.error('\n❌ Error running script:', err.message);
                await askQuestion('Press Enter to continue...');
            }
        }
    } catch (error) {
        const err = error as Error;
        console.error('Error:', err.message);
        process.exit(1);
    }
}

main().catch(error => {
    const err = error as Error;
    console.error('❌ Unexpected error:', err.message);
    process.exit(1);
});