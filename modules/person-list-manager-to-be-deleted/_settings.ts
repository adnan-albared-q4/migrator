import { ScraperSettings } from '../../lib/scraper/ScraperSettings';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface PersonImage {
    remotePath?: string;  // URL of the image to download
    localPath?: string;   // Path where image was downloaded
    uploadPath?: string;  // Path to use when uploading (files/images/department/...)
}

export interface PersonData {
    firstName: string;
    lastName: string;
    title: string;
    description: string;
    active: boolean;
    department: string;
    tags?: string[];
    image?: PersonImage;
}

export interface CompanyPair {
    from: string;
    to: string;
}

export interface Settings {
    companies: CompanyPair[];
}

const settings: ScraperSettings = {
    baseUrlToScrapeFrom: new URL('https://kimco2020index.s4.q4web.com/admin/login.aspx'),
    baseUrlToCreateTo: new URL('https://kimco2025snprd.s4.q4web.com/admin/login.aspx'),
    baseFilesUrl: new URL('https://s2.q4cdn.com/479595614/')
};

export default settings; 