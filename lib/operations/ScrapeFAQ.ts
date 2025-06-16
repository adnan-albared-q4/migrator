import { Base } from './Base';
import { SiteConfig } from '../core/types';
import { Page } from 'puppeteer';
import chalk from 'chalk';
import { waitTillHTMLRendered } from '../helpers/Puppeteer';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { FAQList, FAQQuestion } from './ScrapeFAQTypes';
import { getSafeSiteDirName } from '../helpers/siteName';

export class ScrapeFAQ extends Base {
  private readonly SECTION_ID = '6584af41-0d20-43ea-bb53-770a526ad11e';
  private isDebugMode = false;

  private readonly selectors = {
    faqListTable: 'table#_ctrl0_ctl19_UCFaq_dataGrid',
    faqListRow: 'tr:not(.DataGridHeader):not(.DataGridPager)',
    faqListNameCell: 'td.DataGridItemBorder:nth-child(2)',
    faqListEditLink: 'a',
    questionsTable: 'table.questions',
    questionRow: 'tr',
    questionText: 'span[id*="lblQuestion"]',
    editButton: 'input[id*="btnEdit"]',
    questionInput: '#_ctrl0_ctl19_txtQuestion',
    answerIframe: '#_ctrl0_ctl19_RADeditor1_contentIframe',
    answerBody: 'body.RadEContentBordered',
  };

  public enableDebugMode(): void {
    this.isDebugMode = true;
    console.log(chalk.cyan('Debug mode enabled - will show detailed logging'));
  }

  private async debugStep(message: string): Promise<void> {
    if (!this.isDebugMode) return;
    console.log(chalk.cyan(`\n=== DEBUG: ${message} ===`));
  }

  private ensureDataDirectoryExists(): string {
    const dataDir = join(process.cwd(), 'data');
    const siteDir = join(dataDir, getSafeSiteDirName(this.site.name));
    if (!existsSync(dataDir)) mkdirSync(dataDir);
    if (!existsSync(siteDir)) mkdirSync(siteDir);
    return siteDir;
  }

  // --- MAIN EXECUTION ---
  async execute(): Promise<boolean> {
    try {
      // 1. Setup: Ensure LoginManager uses source site as destination
      if (this.site.destination !== this.site.source) {
        // Reconfigure login manager for source site
        const tempConfig = { ...this.site, destination: this.site.source };
        this.loginManager = new (this.loginManager.constructor as any)(tempConfig);
      }

      // 2. Get logged-in page using getPage()
      const page = await this.getPage();
      if (!page) throw new Error('Failed to initialize page');

      // 3. Navigate to FAQ lists page on source site
      if (!(await this.navigateToFAQListPage(page))) throw new Error('Could not load FAQ lists page');

      // 4. Scrape all FAQ lists (name, id, url)
      const lists = await this.getFAQLists(page);
      if (!lists.length) {
        console.log(chalk.yellow('No FAQ lists found'));
        return false;
      }

      // If only one list is found, set its name to 'Frequently Asked Questions'
      if (lists.length === 1) {
        lists[0].listName = 'Frequently Asked Questions';
        console.log(chalk.yellow("Only one FAQ list found. Setting its name to 'Frequently Asked Questions'."));
      }

      const allFAQLists: FAQList[] = [];
      for (const list of lists) {
        // 5a. Navigate to list page
        await page.goto(list.href, { waitUntil: 'domcontentloaded' });
        await waitTillHTMLRendered(page);
        // 5b. Scrape all questions (text, id)
        const questions = await this.getQuestionsForList(page, list);
        console.log(chalk.blue(`List '${list.listName}': Found ${questions.length} questions (initial count)`));
        // 5c. For each question, get answer
        for (let i = 0; i < questions.length; i++) {
          const q = questions[i];
          await this.debugStep(`Getting answer for question ${i + 1}: ${q.question}`);
          // Click edit button
          await page.goto(list.href, { waitUntil: 'domcontentloaded' });
          await waitTillHTMLRendered(page);
          await page.evaluate((buttonId) => {
            const button = document.getElementById(buttonId) as HTMLElement;
            if (button) button.click();
          }, q.questionId);
          await page.waitForSelector(this.selectors.questionInput, { timeout: 5000 }).catch(() => {});
          // Extract answer
          const answer = await page.evaluate((selectors) => {
            const iframe = document.querySelector(selectors.answerIframe) as HTMLIFrameElement;
            if (!iframe) return '';
            const iframeDoc = iframe.contentDocument;
            if (!iframeDoc) return '';
            const body = iframeDoc.querySelector(selectors.answerBody);
            return body ? body.innerHTML : '';
          }, this.selectors);
          q.answer = answer || '';
        }
        // --- Post-processing: Retry for empty answers ---
        const maxAttempts = 3;
        const retryWait = 7000; // ms, longer wait for retries
        const stillEmpty = questions.filter(q => !q.answer || q.answer.trim() === '');
        for (const q of stillEmpty) {
          let found = false;
          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            console.log(chalk.magenta(`[Retry] '${q.question}' (Attempt ${attempt}/${maxAttempts})`));
            await page.goto(list.href, { waitUntil: 'domcontentloaded' });
            await waitTillHTMLRendered(page);
            await page.evaluate((buttonId) => {
              const button = document.getElementById(buttonId) as HTMLElement;
              if (button) button.click();
            }, q.questionId);
            await page.waitForSelector(this.selectors.questionInput, { timeout: retryWait }).catch(() => {});
            // Wait extra for iframe content
            await page.waitForTimeout(2000);
            const answer = await page.evaluate((selectors) => {
              const iframe = document.querySelector(selectors.answerIframe) as HTMLIFrameElement;
              if (!iframe) return '';
              const iframeDoc = iframe.contentDocument;
              if (!iframeDoc) return '';
              const body = iframeDoc.querySelector(selectors.answerBody);
              return body ? body.innerHTML : '';
            }, this.selectors);
            if (answer && answer.trim().length > 0) {
              q.answer = answer;
              found = true;
              console.log(chalk.green(`[Retry Success] Answer found for: '${q.question}'`));
              break;
            } else {
              console.log(chalk.yellow(`[Retry] Still empty for: '${q.question}'`));
            }
          }
          if (!found) {
            console.log(chalk.red(`[Final] No answer found after retries for: '${q.question}'`));
          }
        }
        // ---
        allFAQLists.push({
          listId: list.listId,
          listName: list.listName,
          questionCount: questions.length,
          questions
        });
      }

      // 6. Save JSON to data/ directory
      // --- Additional logging for JSON integrity and empty answers ---
      allFAQLists.forEach((faqList, idx) => {
        const jsonCount = faqList.questions.length;
        const emptyAnswers = faqList.questions.filter(q => !q.answer || q.answer.trim() === '').length;
        console.log(chalk.yellow(`List '${faqList.listName}': JSON question count = ${jsonCount}, initial found = ${faqList.questionCount}`));
        console.log(chalk.yellow(`List '${faqList.listName}': Empty answers in JSON = ${emptyAnswers}`));
      });
      // ---
      await this.saveResults(allFAQLists);
      console.log(chalk.green('FAQ scraping complete.'));
      return true;
    } catch (error) {
      console.error(chalk.red('Error in ScrapeFAQ operation:'), error);
      return false;
    }
  }

  private async navigateToFAQListPage(page: Page): Promise<boolean> {
    try {
      await this.debugStep('Navigating to FAQ lists page');
      const url = `https://${this.site.source}.s4.q4web.com/admin/default.aspx?LanguageId=1&SectionId=${this.SECTION_ID}`;
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await waitTillHTMLRendered(page);
      await page.waitForSelector(this.selectors.faqListTable, { timeout: 10000 });
      return true;
    } catch (error) {
      console.error(chalk.red('Could not load FAQ lists page:'), error);
      return false;
    }
  }

  private async getFAQLists(page: Page): Promise<{ listId: string; listName: string; href: string }[]> {
    await this.debugStep('Extracting FAQ lists');
    return await page.evaluate((selectors) => {
      const lists: { listId: string; listName: string; href: string }[] = [];
      const rows = document.querySelectorAll(`${selectors.faqListTable} ${selectors.faqListRow}`);
      rows.forEach(row => {
        const nameCell = row.querySelector(selectors.faqListNameCell);
        const editLink = row.querySelector(selectors.faqListEditLink) as HTMLAnchorElement;
        if (editLink && nameCell) {
          // Extract listId from the edit link href (query param or path)
          const href = editLink.href;
          let listId = '';
          const match = href.match(/ListId=([\w-]+)/i);
          if (match) listId = match[1];
          lists.push({
            listId,
            listName: nameCell.textContent?.trim() || '',
            href
          });
        }
      });
      return lists;
    }, this.selectors);
  }

  private async getQuestionsForList(page: Page, list: { listId: string; listName: string; href: string }): Promise<FAQQuestion[]> {
    await this.debugStep(`Scraping questions for list: ${list.listName}`);
    // Extract questions and their edit button IDs
    return await page.evaluate((selectors) => {
      const rows = document.querySelectorAll(`${selectors.questionsTable} ${selectors.questionRow}`);
      const result: FAQQuestion[] = [];
      rows.forEach(row => {
        const questionSpan = row.querySelector(selectors.questionText);
        const editButton = row.querySelector(selectors.editButton) as HTMLInputElement;
        if (questionSpan && editButton) {
          result.push({
            questionId: editButton.id,
            question: questionSpan.textContent || '',
            answer: ''
          });
        }
      });
      return result;
    }, this.selectors);
  }

  private async saveResults(faqLists: FAQList[]): Promise<boolean> {
    await this.debugStep('Saving FAQ lists to JSON');
    try {
      const siteDir = this.ensureDataDirectoryExists();
      const filePath = join(siteDir, 'faq.json');
      writeFileSync(filePath, JSON.stringify({ faqLists }, null, 2), 'utf8');
      console.log(chalk.green(`Saved ${faqLists.length} FAQ lists to ${filePath}`));
      return true;
    } catch (error) {
      console.error(chalk.red('Error saving FAQ lists:'), error);
      return false;
    }
  }
} 