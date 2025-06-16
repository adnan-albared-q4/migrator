import { Base } from './Base';
import { SiteConfig } from '../core/types';
import { LoginManager } from '../core/LoginManager';
import chalk from 'chalk';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import inquirer from 'inquirer';
import { FAQScrapeResult } from './ScrapeFAQTypes';

export class VerifyFAQs extends Base {
    constructor(site: SiteConfig, loginManager?: LoginManager) {
        super(site, loginManager);
    }

    async execute(): Promise<boolean> {
        try {
            console.log(chalk.blue('\nStarting FAQ verification across all sites'));

            // Get all site directories
            const dataDir = join(process.cwd(), 'data');
            const siteDirs = readdirSync(dataDir, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);

            if (siteDirs.length === 0) {
                console.log(chalk.yellow('No site data found in data directory'));
                return false;
            }

            // Analyze all FAQ files
            const siteStats = new Map<string, { totalEmpty: number; emptyQuestions: Array<{ list: string; question: string }> }>();
            let totalEmptyAnswers = 0;

            for (const siteDir of siteDirs) {
                const faqPath = join(dataDir, siteDir, 'faq.json');
                try {
                    const faqData = JSON.parse(readFileSync(faqPath, 'utf8')) as FAQScrapeResult;
                    const emptyQuestions: Array<{ list: string; question: string }> = [];

                    // Count empty answers
                    faqData.faqLists.forEach(list => {
                        list.questions.forEach(q => {
                            if (!q.answer || q.answer.trim() === '') {
                                emptyQuestions.push({
                                    list: list.listName,
                                    question: q.question
                                });
                            }
                        });
                    });

                    siteStats.set(siteDir, {
                        totalEmpty: emptyQuestions.length,
                        emptyQuestions
                    });

                    totalEmptyAnswers += emptyQuestions.length;
                } catch (error) {
                    console.log(chalk.yellow(`Could not read FAQ data for ${siteDir}`));
                }
            }

            // Display summary
            console.log(chalk.blue('\nFAQ Verification Summary:'));
            console.log(chalk.blue(`Total sites analyzed: ${siteDirs.length}`));
            console.log(chalk.blue(`Total empty answers found: ${totalEmptyAnswers}`));
            console.log('\nEmpty answers by site:');
            siteStats.forEach((stats, site) => {
                console.log(chalk.yellow(`\n${site}:`));
                console.log(`  Empty answers: ${stats.totalEmpty}`);
            });

            // Ask user what they want to view
            const { action } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'action',
                    message: 'What would you like to view?',
                    choices: [
                        { name: 'View all empty questions', value: 'all' },
                        { name: 'View empty questions for specific site', value: 'site' },
                        { name: 'Exit', value: 'exit' }
                    ]
                }
            ]);

            if (action === 'exit') {
                return true;
            }

            if (action === 'all') {
                // Display all empty questions
                console.log(chalk.blue('\nAll Empty Questions:'));
                siteStats.forEach((stats, site) => {
                    if (stats.emptyQuestions.length > 0) {
                        console.log(chalk.yellow(`\n${site}:`));
                        stats.emptyQuestions.forEach(({ list, question }) => {
                            console.log(`  List: ${list}`);
                            console.log(`  Question: ${question}`);
                            console.log('  ---');
                        });
                    }
                });
            } else if (action === 'site') {
                // Ask for specific site
                const { selectedSite } = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'selectedSite',
                        message: 'Select a site:',
                        choices: Array.from(siteStats.keys()).map(site => ({
                            name: `${site} (${siteStats.get(site)?.totalEmpty} empty answers)`,
                            value: site
                        }))
                    }
                ]);

                // Display empty questions for selected site
                const stats = siteStats.get(selectedSite);
                if (stats && stats.emptyQuestions.length > 0) {
                    console.log(chalk.yellow(`\nEmpty Questions in ${selectedSite}:`));
                    stats.emptyQuestions.forEach(({ list, question }) => {
                        console.log(`  List: ${list}`);
                        console.log(`  Question: ${question}`);
                        console.log('  ---');
                    });
                } else {
                    console.log(chalk.green(`\nNo empty questions found in ${selectedSite}`));
                }
            }

            return true;

        } catch (error) {
            console.error(chalk.red('Error in FAQ verification:'), error);
            return false;
        }
    }
} 