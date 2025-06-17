import { Base } from './Base';
import { SiteConfig } from '../core/types';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';

// Types for tagging configuration
interface TagRule {
    action: 'add' | 'remove';
    tag: string;
    conditions: {
        type: 'tag' | 'title_set';
        operator: 'and' | 'or';
        value: string; // tag name or set name
        negate?: boolean; // if true, condition is inverted (e.g., "not in set" or "does not have tag")
    }[];
}

interface TitleSet {
    name: string;
    titles: string[];
}

interface TaggingConfig {
    rules: TagRule[];
    titleSets: TitleSet[];
    metadata: {
        created: string;
        lastModified: string;
        description?: string;
    };
}

export class SetupTaggingRules extends Base {
    private readonly configPath: string;
    private config: TaggingConfig;

    constructor(site: SiteConfig) {
        super(site);
        this.configPath = join(process.cwd(), 'data', this.site.name, 'tagging-config.json');
        this.config = this.loadConfig();
    }

    async execute(): Promise<boolean> {
        try {
            console.log('\n' + chalk.blue('Setting up tagging rules for ' + this.site.name));
            
            while (true) {
                const { action } = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'action',
                        message: 'Choose action:',
                        choices: [
                            { name: 'Manage title sets', value: '3' },
                            { name: 'Add tag rule', value: '1' },
                            { name: 'Remove tag rule', value: '2' },
                            { name: 'Save and exit', value: '4' },
                            { name: 'Exit without saving', value: '5' }
                        ]
                    }
                ]);
                
                switch (action) {
                    case '1':
                        await this.addTagRule();
                        break;
                    case '2':
                        await this.removeTagRule();
                        break;
                    case '3':
                        await this.manageTitleSets();
                        break;
                    case '4':
                        await this.saveConfig();
                        return true;
                    case '5':
                        return true;
                }
            }
        } catch (error) {
            console.error(chalk.red('Error in SetupTaggingRules:'), error);
            return false;
        }
    }

    private loadConfig(): TaggingConfig {
        try {
            if (existsSync(this.configPath)) {
                return JSON.parse(readFileSync(this.configPath, 'utf8'));
            }
        } catch (error) {
            console.log(chalk.yellow('No existing config found or error loading config.'));
        }

        // Return default config
        return {
            rules: [],
            titleSets: [],
            metadata: {
                created: new Date().toISOString(),
                lastModified: new Date().toISOString()
            }
        };
    }

    private async saveConfig(): Promise<void> {
        try {
            // Ensure directory exists
            const dir = join(process.cwd(), 'data', this.site.name);
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }

            // Update metadata
            this.config.metadata.lastModified = new Date().toISOString();

            // Save config
            writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
            console.log(chalk.green('\nConfiguration saved successfully!'));
        } catch (error) {
            console.error(chalk.red('Error saving configuration:'), error);
            throw error;
        }
    }

    private async addTagRule(): Promise<void> {
        console.log('\n' + chalk.blue('Adding new tag rule...'));
        
        // Check if there are any title sets
        if (this.config.titleSets.length === 0) {
            console.log(chalk.yellow('\nNo title sets exist. Please create a title set first.'));
            return;
        }
        
        // Get action type
        const { action } = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: 'Action:',
                choices: [
                    { name: 'Add tag', value: 'add' },
                    { name: 'Remove tag', value: 'remove' }
                ]
            }
        ]);

        // Get tag name
        const { tag } = await inquirer.prompt([
            {
                type: 'input',
                name: 'tag',
                message: 'Tag name:',
                validate: (input: string) => input.trim() !== '' || 'Tag name is required'
            }
        ]);

        // Initialize rule
        const rule: TagRule = {
            action: action as 'add' | 'remove',
            tag,
            conditions: []
        };

        // Add conditions
        while (true) {
            // Display current conditions
            if (rule.conditions.length > 0) {
                console.log('\n' + chalk.blue('Current conditions:'));
                rule.conditions.forEach((condition, index) => {
                    const negateText = condition.negate ? 'not ' : '';
                    const conditionText = condition.type === 'tag' 
                        ? `has ${negateText}tag "${condition.value}"`
                        : `is ${negateText}in set "${condition.value}"`;
                    console.log(chalk.green(`${index + 1}. ${conditionText}`));
                });
            }

            const { action } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'action',
                    message: 'Choose action:',
                    choices: [
                        { name: 'Add condition', value: 'add' },
                        { name: 'Done', value: 'done' }
                    ]
                }
            ]);

            if (action === 'done') break;

            // Add new condition
            const { conditionType } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'conditionType',
                    message: 'Condition type:',
                    choices: [
                        { name: 'Tag', value: 'tag' },
                        { name: 'Title Set', value: 'title_set' }
                    ]
                }
            ]);

            if (conditionType === 'tag') {
                const { tagValue } = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'tagValue',
                        message: 'Tag name:',
                        validate: (input: string) => input.trim() !== '' || 'Tag name is required'
                    }
                ]);

                const { negate } = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'negate',
                        message: 'Condition:',
                        choices: [
                            { name: `Has tag "${tagValue}"`, value: false },
                            { name: `Does not have tag "${tagValue}"`, value: true }
                        ]
                    }
                ]);

                rule.conditions.push({
                    type: 'tag',
                    operator: 'and',
                    value: tagValue,
                    negate
                });
            } else {
                const { setName } = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'setName',
                        message: 'Select title set:',
                        choices: this.config.titleSets.map(set => ({
                            name: `${set.name} (${set.titles.length} titles)`,
                            value: set.name
                        }))
                    }
                ]);

                const { negate } = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'negate',
                        message: 'Condition:',
                        choices: [
                            { name: `Is in set "${setName}"`, value: false },
                            { name: `Is not in set "${setName}"`, value: true }
                        ]
                    }
                ]);

                rule.conditions.push({
                    type: 'title_set',
                    operator: 'and',
                    value: setName,
                    negate
                });
            }
        }

        // Add rule to config
        this.config.rules.push(rule);
        console.log(chalk.green('\nRule added successfully!'));
    }

    private async removeTagRule(): Promise<void> {
        if (this.config.rules.length === 0) {
            console.log(chalk.yellow('\nNo rules to remove.'));
            return;
        }

        const { ruleIndex } = await inquirer.prompt([
            {
                type: 'list',
                name: 'ruleIndex',
                message: 'Select rule to remove:',
                choices: this.config.rules.map((rule, index) => ({
                    name: `${rule.action} tag "${rule.tag}" with ${rule.conditions.length} condition(s)`,
                    value: index
                }))
            }
        ]);

        this.config.rules.splice(ruleIndex, 1);
        console.log(chalk.green('Rule removed successfully!'));
    }

    private async manageTitleSets(): Promise<void> {
        while (true) {
            const { action } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'action',
                    message: 'Title Sets Management:',
                    choices: [
                        { name: 'Create new title set', value: '1' },
                        { name: 'List existing title sets', value: '2' },
                        { name: 'Back to main menu', value: '3' }
                    ]
                }
            ]);
            
            switch (action) {
                case '1':
                    await this.createTitleSet();
                    break;
                case '2':
                    this.listTitleSets();
                    break;
                case '3':
                    return;
            }
        }
    }

    private async createTitleSet(): Promise<void> {
        const { name } = await inquirer.prompt([
            {
                type: 'input',
                name: 'name',
                message: 'Enter title set name:',
                validate: (input: string) => {
                    if (input.trim() === '') return 'Title set name is required';
                    if (this.config.titleSets.some(set => set.name === input.trim())) {
                        return 'A title set with this name already exists';
                    }
                    return true;
                }
            }
        ]);

        this.config.titleSets.push({
            name: name.trim(),
            titles: []
        });

        console.log(chalk.green('\nTitle set created successfully!'));
        console.log(chalk.yellow('Note: You can add titles to this set by editing the JSON file directly.'));
    }

    private listTitleSets(): void {
        if (this.config.titleSets.length === 0) {
            console.log(chalk.yellow('\nNo title sets exist.'));
            return;
        }

        console.log('\n' + chalk.blue('Existing title sets:'));
        this.config.titleSets.forEach((set, index) => {
            console.log(chalk.green(`${index + 1}. ${set.name} (${set.titles.length} titles)`));
        });
    }
} 