import { Base } from './Base';
import { Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { getSafeSiteDirName } from '../helpers/siteName';

const FIELD_LABEL_MAP: Record<string, string> = {
  title: 'Title and Professional Designation',
  email: 'Email',
  url: 'Url',
  phone: 'Phone Number',
  location: 'Location',
  address: 'Location',
  targetPrice: 'Target Price',
  reportingDate: 'Report Date',
  rating: 'Rating',
};

const ANALYST_FIELD_SELECTORS: Record<string, string> = {
  analyst: '#AnalystGroupsAnalystFormNameFieldInput',
  firm: '#AnalystGroupsAnalystFormFirmFieldInput',
  title: '#AnalystGroupsAnalystFormTitleFieldInput',
  url: '#AnalystGroupsAnalystFormUrlFieldInput',
  email: '#AnalystGroupsAnalystFormEmailFieldInput',
  phone: '#AnalystGroupsAnalystFormPhoneFieldInput',
  location: '#AnalystGroupsAnalystFormLocationFieldInput',
  targetPrice: '#AnalystGroupsAnalystFormTargetPriceFieldInput',
  reportingDate: '#AnalystGroupsAnalystFormReportingDateFieldInput',
  rating: '#AnalystGroupsAnalystFormRatingFieldInput',
};

export default class MigrateAnalysts extends Base {
  async execute(): Promise<boolean> {
    try {
      const { analysts, page } = await this.configureFields();
      if (analysts && analysts.length > 0 && page) {
        await this.createAnalysts(page, analysts);
      }
      return true;
    } catch (err) {
      console.error('[MigrateAnalysts] Error in execute:', err);
      return false;
    }
  }

  async configureFields(): Promise<{ analysts: any[], page?: Page }> {
    // 1. Load JSON
    const dataDir = path.join('data', getSafeSiteDirName(this.site.name));
    console.log(`[MigrateAnalysts] Using data directory: ${dataDir}`);
    const jsonPath = path.join(dataDir, 'analyst-committee-llm.json');
    console.log(`[MigrateAnalysts] Loading JSON from: ${jsonPath}`);
    if (!fs.existsSync(jsonPath)) {
      throw new Error(`[MigrateAnalysts] JSON file not found: ${jsonPath}`);
    }
    const json = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    
    // Get analysts directly from root level
    const analysts = json.analysts || [];
    
    // Early exit if no analysts
    if (!analysts || analysts.length === 0) {
      console.log('[MigrateAnalysts] No analysts to migrate for this site. Skipping field configuration.');
      return { analysts: [], page: undefined };
    }
    // 2. Extract unique fields
    const fields = new Set<string>();
    for (const analyst of analysts) {
      Object.keys(analyst).forEach(f => {
        // Only add fields that have non-empty values
        if (analyst[f] && analyst[f].trim() !== '') {
          fields.add(f);
        }
      });
    }
    // If either 'address' or 'location' is present, ensure 'Location' is checked
    if (fields.has('address') || fields.has('location')) {
      fields.add('location');
      fields.add('address');
    }
    // Only consider fields that have a mapping
    const fieldsToCheck = Array.from(fields).filter(f => FIELD_LABEL_MAP[f]);
    console.log('[MigrateAnalysts] Fields found in JSON with values:', Array.from(fields));
    console.log('[MigrateAnalysts] Fields to be checked:', fieldsToCheck.map(f => FIELD_LABEL_MAP[f]));

    // 3. Get Puppeteer page
    const page = await this.getPage();
    if (!page) {
      console.error('[MigrateAnalysts] Could not get Puppeteer page (login failed?)');
      throw new Error('[MigrateAnalysts] Could not get Puppeteer page (login failed?)');
    }

    // 4. Navigate to platform settings
    const baseUrl = `https://${this.site.destination}.s4.q4web.com`;
    const settingsUrl = `${baseUrl}/admin/studio/#/platform-settings`;
    await page.goto(settingsUrl, { waitUntil: 'domcontentloaded' });
    const tabSelector = '#CapabilitiesFieldConfigurationTab';
    let tabActivated = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.waitForSelector(tabSelector, { visible: true, timeout: 15000 });
      await page.evaluate((sel) => {
        const tab = document.querySelector(sel) as HTMLElement;
        if (tab) {
          tab.scrollIntoView();
          tab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }
      }, tabSelector);
      await page.waitForTimeout(1000);
      // Check if the accordion header is now visible
      const accordionVisible = await page.$('#CapabilitiesFieldConfigurationAnalystAccordionHeader');
      if (accordionVisible) {
        tabActivated = true;
        break;
      }
    }
    if (!tabActivated) {
      await page.screenshot({ path: 'tab-fail-final.png' });
      throw new Error('[MigrateAnalysts] Failed to activate Field Configuration tab after 3 attempts');
    }
    // Wait for accordion to appear
    const accordionSelector = '#CapabilitiesFieldConfigurationAnalystAccordionHeader';
    let accordionExpanded = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.evaluate((sel) => {
        const acc = document.querySelector(sel) as HTMLElement;
        if (acc) acc.scrollIntoView();
      }, accordionSelector);
      await page.click(accordionSelector);
      await page.waitForTimeout(1000);
      // Check if the checkboxes container is now visible
      const checkboxesVisible = await page.$('.field-configuration_checkbox-list-wrapper');
      if (checkboxesVisible) {
        accordionExpanded = true;
        break;
      }
    }
    if (!accordionExpanded) {
      await page.screenshot({ path: 'accordion-fail-final.png' });
      throw new Error('[MigrateAnalysts] Failed to expand Analyst Fields accordion after 3 attempts');
    }
    // Wait for checkboxes to appear
    await page.waitForSelector('.field-configuration_checkbox-list-wrapper', { visible: true, timeout: 15000 });

    // 5. Check required fields
    const checkedLabels: string[] = [];
    for (const field of fieldsToCheck) {
      const label = FIELD_LABEL_MAP[field];
      // Find the label span with the correct text
      const labelSelector = `.field-configuration_checkbox-list-wrapper .nui-toggle-input-base_label-text`;
      const labelHandles = await page.$$(labelSelector);
      let found = false;
      for (const handle of labelHandles) {
        const text = await page.evaluate(el => el.textContent?.trim(), handle);
        if (text === label) {
          found = true;
          // Get the closest .nui-toggle-input-base div
          const toggleDiv = await handle.evaluateHandle(el => el.closest('.nui-toggle-input-base'));
          if (toggleDiv) {
            let isChecked = await page.evaluate(el => el.classList.contains('nui-toggle-input-base--checked'), toggleDiv);
            if (isChecked) {
              continue;
            }
            // Try clicking the toggle div
            const toggleDivElement = toggleDiv.asElement();
            if (toggleDivElement) {
              await toggleDivElement.click();
              await page.waitForTimeout(500);
              isChecked = await page.evaluate(el => el.classList.contains('nui-toggle-input-base--checked'), toggleDivElement);
              if (isChecked) {
                checkedLabels.push(label);
                continue;
              }
            }
          }
        }
      }
    }
    // 6. Save
    await page.waitForSelector('#CapabilitiesFieldConfigurationActionsSaveButton', { visible: true, timeout: 15000 });
    await page.waitForTimeout(1000); // Wait 1 second before clicking Save
    await page.click('#CapabilitiesFieldConfigurationActionsSaveButton');
    await page.waitForTimeout(1000); // Wait 1 second after clicking Save
    console.log('[MigrateAnalysts] Fields checked and saved:', checkedLabels);
    return { analysts, page };
  }

  async createAnalysts(page: Page, analysts: any[]): Promise<void> {
    // Always navigate to analyst groups page first
    const baseUrl = `https://${this.site.destination}.s4.q4web.com`;
    const analystGroupsUrl = `${baseUrl}/admin/studio/#/analyst-groups`;
    await page.goto(analystGroupsUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    // Click first group edit button
    const groupEditBtn = 'button#AnalystGroupsTableBodyTableItemsItem0EditIcon';
    await page.waitForSelector(groupEditBtn, { visible: true, timeout: 15000 });
    await page.click(groupEditBtn);
    // Wait for analyst list table to appear
    const analystTable = 'table#AnalystGroupsFormAnalystTableTable';
    await page.waitForSelector(analystTable, { visible: true, timeout: 15000 });
    const MAX_RETRIES = 5;
    for (let i = 0; i < analysts.length; i++) {
      const analyst = analysts[i];
      const name = analyst.analyst || analyst.firm || '[MISSING NAME]';
      let added = false;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        // Extract current analyst names from the table
        const tableNames: string[] = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('span.analyst-table_col_analyst-name-label'))
            .map(el => el.textContent?.trim() || '')
            .filter(Boolean);
        });
        // Check if analyst is present at the correct position
        if (tableNames[i] === name) {
          console.log(`[MigrateAnalysts] Analyst '${name}' is present at position ${i} (attempt ${attempt}).`);
          added = true;
          break;
        }
        // If analyst is present but out of order, log a warning and skip (optional strict mode)
        if (tableNames.includes(name)) {
          console.warn(`[MigrateAnalysts] Analyst '${name}' is present in the table but not at position ${i}. Skipping to next.`);
          added = true;
          break;
        }
        // Try to add the analyst
        console.log(`[MigrateAnalysts] Attempting to add analyst '${name}' at position ${i} (attempt ${attempt}).`);
        try {
          // Click Add New
          const addNewBtn = '#AnalystGroupsFormAnalystTableHeaderAddNew';
          await page.waitForSelector(addNewBtn, { visible: true, timeout: 15000 });
          await page.click(addNewBtn);

          let formAppeared = false;
          for (let attemptForm = 1; attemptForm <= 3; attemptForm++) {
            try {
              await page.waitForSelector('#AnalystGroupsAnalystFormNameFieldInput', { visible: true, timeout: 4000 });
              await page.waitForSelector('#AnalystGroupsAnalystFormFirmFieldInput', { visible: true, timeout: 4000 });
              formAppeared = true;
              break;
            } catch (e) {
              if (attemptForm < 3) {
                await page.click(addNewBtn);
                await page.waitForTimeout(1000);
              }
            }
          }
          if (!formAppeared) {
            console.error(`[MigrateAnalysts] Failed to open form for analyst '${name}' after 3 attempts.`);
            if (page.screenshot) {
              await page.screenshot({ path: `analyst-form-fail-${i + 1}.png` });
            }
            continue;
          }
          // Always fill the Location field if either 'location' or 'address' exists
          const locationValue = analyst.location || analyst.address;
          if (locationValue) {
            const selector = ANALYST_FIELD_SELECTORS['location'];
            await page.waitForSelector(selector, { visible: true, timeout: 5000 });
            await page.click(selector, { clickCount: 3 });
            await page.type(selector, String(locationValue), { delay: 10 });
          }
          // Fill all other fields except 'address' and 'location' (handled above)
          for (const key of Object.keys(analyst)) {
            if (key === 'address' || key === 'location') continue; // already handled
            const selector = ANALYST_FIELD_SELECTORS[key];
            if (selector && analyst[key]) {
              await page.waitForSelector(selector, { visible: true, timeout: 5000 });
              await page.click(selector, { clickCount: 3 }); // select all
              await page.type(selector, String(analyst[key]), { delay: 10 });
            }
          }
          // Submit the form
          const submitBtn = '#AnalystGroupsAnalystFormWorkflowActionSubmit';
          await page.waitForSelector(submitBtn, { visible: true, timeout: 10000 });
          await page.click(submitBtn);
          // Handle confirmation modal if it appears
          try {
            await page.waitForSelector('#ConfimationModal', { visible: true, timeout: 2000 });
            await page.waitForSelector('#ConfimationModalCommentTextArea', { visible: true, timeout: 2000 });
            await page.type('#ConfimationModalCommentTextArea', 'Automated migration');
            await page.waitForSelector('#ConfimationModalActionButton', { visible: true, timeout: 2000 });
            await page.click('#ConfimationModalActionButton');
            await page.waitForTimeout(1000);
            await page.waitForSelector('#ConfimationModal', { hidden: true, timeout: 5000 });
          } catch (e) {
            // Modal did not appear, proceed as normal
          }
          // Wait for analyst list table to reappear before next analyst
          await page.waitForSelector(analystTable, { visible: true, timeout: 15000 });
        } catch (err) {
          console.error(`[MigrateAnalysts] Failed to add analyst '${name}' at position ${i}:`, err);
        }
      }
      if (!added) {
        console.error(`[MigrateAnalysts] Could not add analyst '${name}' at position ${i} after ${MAX_RETRIES} attempts.`);
      }
    }
    // Final verification: check table order matches JSON order
    await page.waitForSelector('table#AnalystGroupsFormAnalystTableTable', { visible: true, timeout: 15000 });
    await page.waitForTimeout(1000);
    const finalTableAnalystNames: string[] = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('span.analyst-table_col_analyst-name-label'))
        .map(el => el.textContent?.trim() || '')
        .filter(Boolean);
    });
    const jsonNames = analysts.map(a => a.analyst || a.firm);
    let orderCorrect = true;
    for (let i = 0; i < jsonNames.length; i++) {
      if (finalTableAnalystNames[i] !== jsonNames[i]) {
        orderCorrect = false;
        break;
      }
    }
    if (orderCorrect) {
      console.log('[MigrateAnalysts] Table order matches JSON order.');
    } else {
      console.warn('[MigrateAnalysts] Table order does NOT match JSON order.');
      console.warn('JSON order:', jsonNames);
      console.warn('Table order:', finalTableAnalystNames);
    }
  }
} 