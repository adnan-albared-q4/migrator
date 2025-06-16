import { createInterface } from 'readline';
import { spawn } from 'child_process';
import settings from './_settings';

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
        name: 'Delete & Create Analysts',
        script: './01_createAnalysts.ts',
        description: 'Delete existing analysts and create new ones'
    },
    '2': {
        name: 'Create Analysts',
        script: './01_createAnalysts.ts',
        description: 'Create new analysts without deleting existing ones'
    },
    'd': {
        name: 'Delete Analysts',
        script: './01_createAnalysts.ts',
        description: 'Delete existing analysts only'
    },
    'x': {
        name: 'Exit',
        script: '',
        description: 'Terminate the script'
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

async function runScript(scriptPath: string, option: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const childProcess = spawn('ts-node', [scriptPath, option], {
            stdio: 'inherit'
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
    });
}

async function main(): Promise<void> {
    while (true) {
        console.log('\nAvailable steps:');
        Object.entries(steps).forEach(([key, step]) => {
            console.log(`${key}: ${step.name} - ${step.description}`);
        });

        const answer = await askQuestion('\nEnter step number (or x to exit): ');

        if (answer === 'x') {
            break;
        }

        const step = steps[answer];
        if (step && step.script) {
            try {
                await runScript(step.script, answer);
                console.log(`\n✅ ${step.name} completed successfully`);
            } catch (error) {
                const err = error as Error;
                console.error(`\n❌ Error during ${step.name}:`, err.message);
            }
        } else {
            console.log('\n⚠️ Invalid step number');
        }
    }
}

// Start the script
main().catch((error: Error) => {
    console.error('❌ Unexpected error:', error.message);
    process.exit(1);
}); 