export interface ScraperSettings {
  baseUrlToScrapeFrom: URL;
  baseUrlToCreateTo?: URL;
  baseFilesUrl?: URL;
  username?: string;
  password?: string;
}