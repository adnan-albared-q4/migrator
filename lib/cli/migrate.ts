import { Command } from 'commander';
import { MigratePerson } from '../operations/MigratePerson';
import { SiteConfig } from '../core/types';
import { StateManager } from '../core/StateManager';
import chalk from 'chalk';

export function registerMigrateCommands(program: Command) {
    const migrate = program
        .command('migrate')
        .description('Migrate content from source to destination site');

    migrate
        .command('person')
        .description('Migrate persons from source to destination site')
        .option('-s, --source <source>', 'Source site name')
        .option('-d, --destination <destination>', 'Destination site name')
        .option('--debug', 'Enable debug mode')
        .action(async (options) => {
            try {
                // Get site config from state
                const state = StateManager.getInstance();
                const siteState = state.getSiteState(options.destination);

                if (!siteState?.config) {
                    console.error(chalk.red('Site configuration not found. Please run setup first.'));
                    return;
                }

                const siteConfig = siteState.config;

                // Migrate to destination
                console.log(chalk.blue('\nMigrating persons to destination site...'));
                const migrateOperation = new MigratePerson(siteConfig);
                if (options.debug) {
                    migrateOperation.enableDebugMode();
                }
                const migrateSuccess = await migrateOperation.execute();

                if (!migrateSuccess) {
                    console.error(chalk.red('Failed to migrate persons to destination site'));
                    return;
                }

                console.log(chalk.green('\nPerson migration completed successfully'));
            } catch (error) {
                console.error(chalk.red('Error during person migration:'), error);
            }
        });

    // ... existing migrate commands ...
} 