import { Base } from './Base';
import { SiteConfig } from '../core/types';
import chalk from 'chalk';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getSafeSiteDirName } from '../helpers/siteName';
import inquirer from 'inquirer';

interface LinkInfo {
  href: string;
  text: string;
  surroundingContext: string;
}

interface FAQLinkContext {
  siteName: string;
  faqListName: string;
  questionText: string;
  linkInfo: LinkInfo;
  suggestedStandard?: LinkStandard;
}

interface LinkStandard {
  newPath: string;
  keywords: string[];
  description: string;
}

interface LinkUpdate {
  originalHref: string;
  newHref: string;
  linkText: string;
  questionText: string;
  faqListName: string;
}

// Flexible configuration for link standards - easy to modify or extend
const LINK_STANDARDS: LinkStandard[] = [
  {
    newPath: '/stock-info',
    keywords: ['stock information', 'stock info', 'stock quote', 'stock price'],
    description: 'Stock information pages'
  },
  {
    newPath: '/stock-info/dividend-history',
    keywords: ['dividend history', 'dividends', 'dividend'],
    description: 'Dividend history pages'
  },
  {
    newPath: '/resources/information-request-form',
    keywords: ['information request', 'request information', 'contact form', 'request form'],
    description: 'Information request forms'
  },
  {
    newPath: '/resources/investor-email-alerts',
    keywords: ['email alerts', 'email notification', 'email alerts', 'notifications'],
    description: 'Email alert signup pages'
  },
  {
    newPath: '/financials/annual-reports',
    keywords: ['annual reports', 'annual report', 'financial reports'],
    description: 'Annual reports and financial documents'
  },
  {
    newPath: '/stock-info/analyst-coverage',
    keywords: ['analyst coverage', 'analyst research', 'analyst reports'],
    description: 'Analyst coverage and research'
  },
  {
    newPath: '/stock-info/market-makers',
    keywords: ['market makers', 'market maker'],
    description: 'Market makers information'
  }
];

export class ScanFAQLinks extends Base {
  private isDebugMode = false;

  public enableDebugMode(): void {
    this.isDebugMode = true;
    console.log(chalk.cyan('Debug mode enabled - will show detailed logging'));
  }

  private async debugStep(message: string): Promise<void> {
    if (!this.isDebugMode) return;
    console.log(chalk.cyan(`\n=== DEBUG: ${message} ===`));
  }

  async execute(): Promise<boolean> {
    try {
      console.log(chalk.blue('\n🔍 FAQ Link Scanner'));
      console.log(chalk.gray('Scanning FAQ files for links...\n'));

      // Get the site configuration
      const siteConfig = this.site;
      console.log(chalk.blue(`Processing site: ${chalk.white(siteConfig.name)}`));

      // Scan FAQ file for this site
      const allLinks = await this.scanSiteFAQLinks(siteConfig);
      
      // Display results
      this.displayResults(siteConfig.name, allLinks);

      // If we found links with suggestions, offer to apply updates
      const linksWithSuggestions = allLinks.filter(link => link.suggestedStandard);
      if (linksWithSuggestions.length > 0) {
        await this.offerLinkUpdates(siteConfig, linksWithSuggestions);
      } else {
        console.log(chalk.gray('─'.repeat(50)));
        console.log(chalk.green('✅ FAQ link scan complete!'));
      }

      return true;
    } catch (error) {
      console.error(chalk.red('Error in ScanFAQLinks operation:'), error);
      return false;
    }
  }

  private async offerLinkUpdates(siteConfig: SiteConfig, linksWithSuggestions: FAQLinkContext[]): Promise<void> {
    console.log(chalk.blue('\n🔄 Link Standardization'));
    console.log(chalk.gray('─'.repeat(50)));

    // Create update choices for each link with detailed information
    const updateChoices = linksWithSuggestions.map((link, index) => ({
      name: `${link.linkInfo.text} → ${link.suggestedStandard!.newPath}`,
      value: index,
      short: `${link.linkInfo.href} → ${link.suggestedStandard!.newPath}`
    }));

    const { selectedUpdates } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedUpdates',
        message: `Select links to standardize for ${siteConfig.name} (press 'a' to select/deselect all):`,
        choices: updateChoices,
        validate: (selected: number[]) => {
          // Allow empty selection (user can skip all)
          return true;
        }
      }
    ]);

    if (selectedUpdates.length === 0) {
      console.log(chalk.yellow('No links selected for update.'));
      return;
    }

    // Apply selected updates
    await this.applyLinkUpdates(siteConfig, linksWithSuggestions, selectedUpdates);
  }

  private async applyLinkUpdates(siteConfig: SiteConfig, linksWithSuggestions: FAQLinkContext[], selectedIndices: number[]): Promise<void> {
    console.log(chalk.blue('\n📝 Applying Link Updates'));
    console.log(chalk.gray('─'.repeat(50)));

    const siteDir = getSafeSiteDirName(siteConfig.name);
    const faqFilePath = join(process.cwd(), 'data', siteDir, 'faq.json');
    
    // Read current FAQ file
    const faqContent = readFileSync(faqFilePath, 'utf8');
    const faqData = JSON.parse(faqContent);
    
    let updatedCount = 0;

    // Process each selected link
    for (const index of selectedIndices) {
      const linkContext = linksWithSuggestions[index];
      const originalHref = linkContext.linkInfo.href;
      const newHref = linkContext.suggestedStandard!.newPath;

      console.log(chalk.white(`\nUpdating: ${chalk.green(linkContext.linkInfo.text)}`));
      console.log(chalk.white(`  From: ${chalk.yellow(originalHref)}`));
      console.log(chalk.white(`  To: ${chalk.cyan(newHref)}`));

      // Update the FAQ data
      const updated = this.updateLinkInFAQData(faqData, linkContext, newHref);
      if (updated) {
        updatedCount++;
        console.log(chalk.green('  ✅ Updated successfully'));
      } else {
        console.log(chalk.red('  ❌ Failed to update'));
      }
    }

    // Save updated FAQ file
    if (updatedCount > 0) {
      writeFileSync(faqFilePath, JSON.stringify(faqData, null, 2), 'utf8');
      console.log(chalk.green(`\n✅ Successfully updated ${updatedCount} links in ${faqFilePath}`));
    } else {
      console.log(chalk.yellow('\nNo links were updated.'));
    }
  }

  private updateLinkInFAQData(faqData: any, linkContext: FAQLinkContext, newHref: string): boolean {
    // Find and update the specific link in the FAQ data
    if (faqData.faqLists && Array.isArray(faqData.faqLists)) {
      for (const faqList of faqData.faqLists) {
        if (faqList.listName === linkContext.faqListName) {
          if (faqList.questions && Array.isArray(faqList.questions)) {
            for (const question of faqList.questions) {
              if (question.question === linkContext.questionText && question.answer) {
                // Update the link in the answer HTML
                const originalHref = linkContext.linkInfo.href;
                const linkText = linkContext.linkInfo.text;
                
                // Create regex to match the specific link
                const linkRegex = new RegExp(`<a[^>]+href=["']${this.escapeRegex(originalHref)}["'][^>]*>([^<]*(?:<[^>]*>[^<]*)*)<\/a>`, 'gi');
                
                // Replace the href while preserving the link text and other attributes
                question.answer = question.answer.replace(linkRegex, (match: string, linkContent: string) => {
                  return match.replace(`href="${originalHref}"`, `href="${newHref}"`);
                });
                
                return true;
              }
            }
          }
        }
      }
    }
    return false;
  }

  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async scanSiteFAQLinks(siteConfig: SiteConfig): Promise<FAQLinkContext[]> {
    const siteDir = getSafeSiteDirName(siteConfig.name);
    const faqFilePath = join(process.cwd(), 'data', siteDir, 'faq.json');
    
    await this.debugStep(`Checking for FAQ file: ${faqFilePath}`);

    if (!existsSync(faqFilePath)) {
      console.log(chalk.yellow(`No FAQ file found for site: ${siteConfig.name}`));
      return [];
    }

    // Read and parse FAQ file
    const faqContent = readFileSync(faqFilePath, 'utf8');
    const faqData = JSON.parse(faqContent);
    
    await this.debugStep(`Found FAQ file with ${faqData.faqLists?.length || 0} FAQ lists`);

    const allLinks: FAQLinkContext[] = [];

    // Process each FAQ list
    if (faqData.faqLists && Array.isArray(faqData.faqLists)) {
      for (const faqList of faqData.faqLists) {
        await this.debugStep(`Processing FAQ list: ${faqList.listName}`);
        
        // Process each question in the list
        if (faqList.questions && Array.isArray(faqList.questions)) {
          for (const question of faqList.questions) {
            if (question.answer) {
              // Extract links from the answer HTML
              const links = this.extractLinksFromHTML(question.answer);
              
              // Create context for each link
              for (const link of links) {
                // Find matching standard for this link
                const suggestedStandard = this.findMatchingStandard(link.text, link.href);
                
                allLinks.push({
                  siteName: siteConfig.name,
                  faqListName: faqList.listName,
                  questionText: question.question,
                  linkInfo: link,
                  suggestedStandard
                });
              }
            }
          }
        }
      }
    }

    return allLinks;
  }

  private findMatchingStandard(linkText: string, href: string): LinkStandard | undefined {
    const normalizedText = linkText.toLowerCase();
    
    // Find the best matching standard based on keyword matches
    let bestMatch: LinkStandard | undefined;
    let bestScore = 0;
    
    for (const standard of LINK_STANDARDS) {
      let score = 0;
      
      // Check each keyword phrase
      for (const keyword of standard.keywords) {
        const normalizedKeyword = keyword.toLowerCase();
        
        // Exact match gets highest score
        if (normalizedText === normalizedKeyword) {
          score += 10;
        }
        // Contains the full phrase
        else if (normalizedText.includes(normalizedKeyword)) {
          score += 5;
        }
        // Contains individual words from the phrase (lower score)
        else {
          const keywordWords = normalizedKeyword.split(' ');
          let wordMatches = 0;
          for (const word of keywordWords) {
            if (normalizedText.includes(word)) {
              wordMatches += 1;
            }
          }
          // Only count if most words match (avoid false positives)
          if (wordMatches >= keywordWords.length * 0.7) {
            score += wordMatches;
          }
        }
      }
      
      // If we found a match and it's better than our current best
      if (score > 0 && score > bestScore) {
        // Check if the original link is already close to the standardized version
        if (!this.isLinkAlreadyStandardized(href, standard.newPath)) {
          bestScore = score;
          bestMatch = standard;
        }
      }
    }
    
    return bestMatch;
  }

  private isLinkAlreadyStandardized(originalHref: string, suggestedPath: string): boolean {
    // Remove query parameters and fragments
    const cleanOriginal = originalHref.split('?')[0].split('#')[0];
    const cleanSuggested = suggestedPath.split('?')[0].split('#')[0];
    
    // If they're exactly the same, no update needed
    if (cleanOriginal === cleanSuggested) {
      return true;
    }
    
    // Check if original is the suggested path with /default.aspx added
    if (cleanOriginal === cleanSuggested + '/default.aspx') {
      return true;
    }
    
    // Check if original is the suggested path with /default.aspx and trailing slash
    if (cleanOriginal === cleanSuggested + '/default.aspx/') {
      return true;
    }
    
    // Check if original is the suggested path with trailing slash
    if (cleanOriginal === cleanSuggested + '/') {
      return true;
    }
    
    // Check if original ends with /default.aspx and suggested is the base path
    if (cleanOriginal.endsWith('/default.aspx') && cleanOriginal.replace('/default.aspx', '') === cleanSuggested) {
      return true;
    }
    
    return false;
  }

  private extractLinksFromHTML(htmlContent: string): LinkInfo[] {
    const links: LinkInfo[] = [];
    
    // Regex to match <a> tags and capture href and text content
    const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*(?:<[^>]*>[^<]*)*)<\/a>/gi;
    
    let match;
    while ((match = linkRegex.exec(htmlContent)) !== null) {
      const href = match[1];
      const fullTag = match[0];
      const textContent = this.extractTextContent(fullTag);
      
      // Get surrounding context (text before and after the link)
      const beforeContext = htmlContent.substring(Math.max(0, match.index - 50), match.index).trim();
      const afterContext = htmlContent.substring(match.index + fullTag.length, match.index + fullTag.length + 50).trim();
      const surroundingContext = `${beforeContext} [LINK] ${afterContext}`;
      
      links.push({
        href,
        text: textContent,
        surroundingContext
      });
    }
    
    return links;
  }

  private extractTextContent(htmlTag: string): string {
    // Remove HTML tags and get just the text content
    return htmlTag.replace(/<[^>]*>/g, '').trim();
  }

  private displayResults(siteName: string, allLinks: FAQLinkContext[]): void {
    console.log(chalk.blue('\n📊 Scan Results'));
    console.log(chalk.gray('─'.repeat(50)));
    
    console.log(chalk.white(`Site: ${chalk.blue(siteName)}`));
    console.log(chalk.white(`Total Links Found: ${chalk.green(allLinks.length)}`));
    
    if (allLinks.length === 0) {
      console.log(chalk.yellow('No links found in FAQ content.'));
      return;
    }

    // Count links with suggestions
    const linksWithSuggestions = allLinks.filter(link => link.suggestedStandard);
    console.log(chalk.white(`Links with standardization suggestions: ${chalk.cyan(linksWithSuggestions.length)}`));

    // Display links by FAQ list
    const linksByList = this.groupLinksByFAQList(allLinks);
    
    for (const [faqListName, links] of Object.entries(linksByList)) {
      console.log(chalk.blue(`\n📍 FAQ List: ${chalk.white(faqListName)} (${links.length} links)`));
      
      for (const linkContext of links) {
        console.log(chalk.white(`  Question: ${chalk.gray(linkContext.questionText)}`));
        console.log(chalk.white(`  Link: ${chalk.green(linkContext.linkInfo.text)} → ${chalk.yellow(linkContext.linkInfo.href)}`));
        
        if (linkContext.suggestedStandard) {
          console.log(chalk.white(`  Suggestion: ${chalk.cyan(linkContext.suggestedStandard.newPath)} (${chalk.gray(linkContext.suggestedStandard.description)})`));
        } else {
          console.log(chalk.white(`  Suggestion: ${chalk.gray('No standardization match found')}`));
        }
        
        console.log(chalk.white(`  Context: ${chalk.gray(linkContext.linkInfo.surroundingContext)}`));
        console.log(); // Single line break between links
      }
    }
    
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.green('✅ FAQ link scan complete!'));
  }

  private groupLinksByFAQList(allLinks: FAQLinkContext[]): Record<string, FAQLinkContext[]> {
    const grouped: Record<string, FAQLinkContext[]> = {};
    
    for (const link of allLinks) {
      if (!grouped[link.faqListName]) {
        grouped[link.faqListName] = [];
      }
      grouped[link.faqListName].push(link);
    }
    
    return grouped;
  }
} 