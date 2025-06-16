import { createInterface } from 'readline';
import { spawn } from 'child_process';

interface Step {
    name: string;
    script: string;
    description: string;
}

type Steps = {
    [key: string]: Step;
}

const steps: Steps = {
    '1': {
        name: 'Scrape Index',
        script: './01_scrapeIndex.ts',
        description: 'Scrapes the initial index of downloads'
    },
    '2': {
        name: 'Scrape Details',
        script: './02_scrapeDetails.ts',
        description: 'Scrapes detailed information for each download'
    },
    '3': {
        name: 'Download Files',
        script: './03_download.ts',
        description: 'Downloads all PDF files'
    },
    '4': {
        name: 'Create Entries',
        script: './04_create.ts',
        description: 'Creates entries in the CMS'
    }
};

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

async function runScript(scriptPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        try {
            const fullPath = require.resolve(scriptPath);
            const childProcess = spawn('ts-node', [fullPath], {
                stdio: 'inherit', // This will pipe the child process I/O to the parent
                cwd: __dirname // Ensure we're in the correct directory
            });

            childProcess.on('error', (error: Error) => {
                reject(new Error(`Failed to start script: ${error.message}`));
            });

            childProcess.on('close', (code: number | null) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Script exited with code ${code}`));
                }
            });
        } catch (error) {
            const err = error as Error;
            reject(new Error(`Failed to resolve script path: ${err.message}`));
        }
    });
}

async function main(): Promise<void> {
    console.clear();
    console.log('🚀 Download List Processing Tool\n');
    
    // Display available steps
    console.log('Available steps:');
    Object.entries(steps).forEach(([key, value]) => {
        console.log(`  ${key}. ${value.name} - ${value.description}`);
    });
    console.log();

    // Get user input
    const answer = await askQuestion('Enter step number (1-4): ');
    const step = steps[answer];

    if (!step) {
        console.error('❌ Invalid step number');
        process.exit(1);
    }

    console.log(`\n📝 Running ${step.name}...\n`);

    try {
        await runScript(step.script);
        console.log(`\n✅ ${step.name} completed successfully`);
    } catch (error) {
        const err = error as Error;
        console.error('\n❌ Error running script:', err.message);
        process.exit(1);
    }
}

// Start the script
main().catch((error: Error) => {
    console.error('❌ Unexpected error:', error.message);
    process.exit(1);
});
