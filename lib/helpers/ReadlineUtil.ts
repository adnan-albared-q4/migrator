import * as readline from 'readline';

let rl: readline.Interface | null = null;

export function getReadlineInterface(): readline.Interface {
    if (!rl) {
        rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false // Disable terminal mode to prevent character echo
        });
    }
    return rl;
}

export async function askQuestion(question: string): Promise<string> {
    const readline = getReadlineInterface();
    return new Promise((resolve) => {
        readline.question(question, (answer) => {
            resolve(answer);
        });
    });
}

export function closeReadline() {
    if (rl) {
        rl.close();
        rl = null;
    }
} 