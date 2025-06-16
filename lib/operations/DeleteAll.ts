import { Base } from './Base';
import { SiteConfig } from '../core/types';
import { Page } from 'puppeteer';
import chalk from 'chalk';
import { LoginManager } from '../core/LoginManager';
import { DeletePerson } from './DeletePerson';
import { DeleteFAQ } from './DeleteFAQ';
import { DeleteAnalyst } from './DeleteAnalyst';
import { DeleteDownloads } from './DeleteDownloads';
import { DeleteFinancials } from './DeleteFinancials';
import { DeletePresentations } from './DeletePresentations';
import { DeleteEvents } from './DeleteEvents';
import { DeletePRs } from './DeletePRs';

interface OperationResult {
    name: string;
    success: boolean;
    error?: Error;
}

/**
 * DeleteAll Operation
 * 
 * Sequentially executes all delete operations:
 * 1. Delete Persons
 * 2. Delete FAQs
 * 3. Delete Analysts
 * 4. Delete Downloads
 * 5. Delete Financials
 * 6. Delete Presentations
 * 7. Delete Events
 * 8. Delete Press Releases
 * 
 * Operations continue even if some fail.
 * Failed operations are logged for manual review.
 * Maintains shared login session across operations for efficiency.
 */
export class DeleteAll extends Base {
    private operations: {
        name: string;
        OperationClass: new (site: SiteConfig, loginManager?: LoginManager) => Base;
    }[];

    private results: OperationResult[] = [];

    constructor(site: SiteConfig, loginManager?: LoginManager) {
        super(site, loginManager);
        
        // Define operations sequence
        this.operations = [
            {
                name: 'Person',
                OperationClass: DeletePerson
            },
            {
                name: 'FAQ',
                OperationClass: DeleteFAQ
            },
            {
                name: 'Analyst',
                OperationClass: DeleteAnalyst
            },
            {
                name: 'Downloads',
                OperationClass: DeleteDownloads
            },
            {
                name: 'Financials',
                OperationClass: DeleteFinancials
            },
            {
                name: 'Presentations',
                OperationClass: DeletePresentations
            },
            {
                name: 'Events',
                OperationClass: DeleteEvents
            },
            {
                name: 'Press Releases',
                OperationClass: DeletePRs
            }
        ];
    }

    private logOperationSummary(): void {
        console.log(chalk.blue('\nOperation Summary:'));
        
        const successful = this.results.filter(r => r.success);
        const failed = this.results.filter(r => !r.success);
        
        console.log(chalk.green(`✓ Successful operations (${successful.length}/${this.results.length}):`));
        successful.forEach(result => {
            console.log(chalk.green(`  • ${result.name}`));
        });

        if (failed.length > 0) {
            console.log(chalk.yellow(`\n! Failed operations (${failed.length}/${this.results.length}):`));
            failed.forEach(result => {
                console.log(chalk.yellow(`  • ${result.name}: ${result.error?.message || 'Unknown error'}`));
            });
            console.log(chalk.yellow('\nFailed operations will need manual review.'));
        }
    }

    async execute(): Promise<boolean> {
        try {
            const operationList = this.operations.map(op => op.name).join(' → ');
            console.log(chalk.blue(`\nStarting DeleteAll operation for ${this.site.name}`));
            console.log(chalk.blue(`Operations will be executed in sequence: ${operationList}\n`));

            let currentLoginManager: LoginManager | null = null;

            try {
                // Create a single login manager for all operations
                currentLoginManager = new LoginManager(this.site);
                currentLoginManager.setShared(true);
                
                // Execute each operation in sequence
                for (let i = 0; i < this.operations.length; i++) {
                    const { name, OperationClass } = this.operations[i];
                    console.log(chalk.yellow(`\nStarting ${name} deletion for ${this.site.name} (${i + 1}/${this.operations.length})...`));
                    
                    try {
                        // Create operation instance with shared login manager
                        const operation = new OperationClass(this.site, currentLoginManager);
                        const success = await operation.execute();
                        
                        this.results.push({
                            name,
                            success,
                            error: success ? undefined : new Error('Operation reported failure')
                        });

                        if (success) {
                            console.log(chalk.green(`✓ ${name} deletion completed successfully for ${this.site.name}`));
                        } else {
                            console.log(chalk.yellow(`! ${name} deletion reported failure for ${this.site.name} - continuing with next operation`));
                        }

                        // Cleanup operation but keep login manager
                        await operation.cleanup();
                        
                    } catch (error) {
                        console.error(chalk.yellow(`! Error in ${name} deletion for ${this.site.name}:`), error);
                        this.results.push({
                            name,
                            success: false,
                            error: error instanceof Error ? error : new Error(String(error))
                        });
                        // Continue with next operation
                    }

                    // Add a small delay between operations
                    if (i < this.operations.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }

            } finally {
                // Always cleanup the login manager
                if (currentLoginManager) {
                    await currentLoginManager.close();
                }
            }

            // Log final summary
            this.logOperationSummary();

            // Return true if at least one operation succeeded
            const hasSuccesses = this.results.some(r => r.success);
            if (hasSuccesses) {
                console.log(chalk.green('\n✓ Some operations completed successfully'));
            } else {
                console.log(chalk.red('\n✗ All operations failed'));
            }

            return hasSuccesses;

        } catch (error) {
            console.error(chalk.red(`Error in DeleteAll operation for ${this.site.name}:`), error);
            return false;
        }
    }

    async cleanup(): Promise<void> {
        // Cleanup is handled in execute() method
    }
} 