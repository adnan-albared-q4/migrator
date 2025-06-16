import { ScraperSettings } from '../../lib/scraper/ScraperSettings';

export interface AnalystData {
    analyst: string;
    firm: string;
    title?: string;
    url?: string;
    email?: string;
    phone?: string;
    location?: string;
    targetPrice?: string;
    reportingDate?: string;
    rating?: string;
}

const settings: ScraperSettings = {
    baseUrlToScrapeFrom: new URL('https://phillipsedison2024ir.s4.q4web.com/admin/login.aspx'),
    baseUrlToCreateTo: new URL('https://phillipsedison2025snprd.s4.q4web.com/admin/login.aspx')
};

export default settings; 