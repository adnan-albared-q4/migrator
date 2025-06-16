import { ScraperSettings } from '../../lib/scraper/ScraperSettings';

// Debug: Log environment variables
console.log('Environment variables:', {
	CMS_USER: process.env.CMS_USER,
	CMS_PASSWORD: process.env.CMS_PASSWORD
});

const settings: ScraperSettings = {
	baseUrlToScrapeFrom: new URL('https://proassurance2020index.s4.q4web.com/admin/login.aspx'),
    baseUrlToCreateTo: new URL('https://proassurance2025snprd.s4.q4web.com/admin/login.aspx'),
}

export interface DownloadSettings {
	downloadType: string;
}

const downloads_settings: DownloadSettings = {			
	downloadType: "Insurance Filings Custom",
}

export { downloads_settings };
export default settings;