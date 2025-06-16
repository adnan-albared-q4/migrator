import { Base } from './Base';
import { SiteConfig } from '../core/types';
import { LoginManager } from '../core/LoginManager';
import chalk from 'chalk';
import { MergePersonData } from './MergePersonData';
import { MigrateCommittees } from './MigrateCommittees';
import { MigrateDepartments } from './MigrateDepartments';
import { MigrateImages } from './MigrateImages';
import { MigratePerson } from './MigratePerson';

export class MigrateAllPersons extends Base {
    constructor(site: SiteConfig, loginManager?: LoginManager) {
        super(site, loginManager);
    }

    async execute(): Promise<boolean> {
        const steps = [
            { name: 'MergePersonData', Operation: MergePersonData },
            { name: 'MigrateCommittees', Operation: MigrateCommittees },
            { name: 'MigrateDepartments', Operation: MigrateDepartments },
            { name: 'MigrateImages', Operation: MigrateImages },
            { name: 'MigratePerson', Operation: MigratePerson }
        ];

        for (const step of steps) {
            console.log(chalk.blue(`\n[${this.site.name}] Starting ${step.name}...`));
            const op = new step.Operation(this.site, this.loginManager);
            const success = await op.execute();
            if (!success) {
                console.log(chalk.red(`[${this.site.name}] Error in ${step.name}, aborting further steps.`));
                return false;
            }
            if (typeof op.cleanup === 'function') {
                await op.cleanup();
            }
            console.log(chalk.green(`[${this.site.name}] ${step.name} completed successfully.`));
        }
        console.log(chalk.green(`\n[${this.site.name}] All person migration steps completed successfully!`));
        return true;
    }

    async cleanup(): Promise<void> {
        // No additional cleanup needed
    }
} 