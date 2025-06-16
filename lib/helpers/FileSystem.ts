import * as fs from 'fs';
import * as path from 'path';

import { PressRelease } from '../data/PressRelease';
import { Presentations } from '../data/Presentations';
import { Persons } from '../data/Persons';
import { DownloadLists } from '../data/DownloadLists';
import { Events } from '../data/Events';
import { Dashboard } from '../data/Dashboard';
import { CMSDate } from '../data/CMSDate';
import { CMSFile } from '../data/CMSFile';

type WriteFileParams = {
  filename: string;
  directory?: string;
  data: string;
}

export function writeToFile({ filename, directory='./scraperMetadata', data }: WriteFileParams){
  if (!fs.existsSync(directory)){
      fs.mkdirSync(directory);
  }
  filename = path.join(directory, filename);
  fs.writeFileSync(filename, data);
}

/*
  Given a list of items and a Class, use the Static method of PressRelease to generate a PressRelease
  from an object
*/
export function convertJsonToCMSClasses(pathToFile: string, pr: typeof PressRelease = PressRelease, directory='./'): Array<PressRelease> {
  const raw = fs.readFileSync(path.resolve(directory, pathToFile));
  const data = JSON.parse(raw.toString('utf-8'));  
  return data.map((entry: Record<string, unknown>) => pr.convertObjectToClass(entry));
}

export function convertJsonToCMSClassesPresentations(pathToFile: string, pr: typeof Presentations = Presentations, directory='./'): Array<Presentations> {
  const raw = fs.readFileSync(path.resolve(directory, pathToFile));
  const data = JSON.parse(raw.toString('utf-8'));  
  return data.map((entry: Record<string, unknown>) => pr.convertObjectToClass(entry));
}

export function convertJsonToCMSClassesPersons(pathToFile: string, pr: typeof Persons = Persons, directory='./'): Array<Persons> {
  const raw = fs.readFileSync(path.resolve(directory, pathToFile));
  const data = JSON.parse(raw.toString('utf-8'));  
  return data.map((entry: Record<string, unknown>) => pr.convertObjectToClass(entry));
}

export function convertJsonToCMSClassesDownloadLists(pathToFile: string, pr: typeof DownloadLists = DownloadLists, directory='./'): Array<DownloadLists> {
  const raw = fs.readFileSync(path.resolve(directory, pathToFile));
  const data = JSON.parse(raw.toString('utf-8'));  
  return data.map((entry: Record<string, unknown>) => pr.convertObjectToClass(entry));
}

export function convertJsonToCMSClassesEvents(pathToFile: string, pr: typeof Events = Events, directory='./'): Array<Events> {
  const raw = fs.readFileSync(path.resolve(directory, pathToFile));
  const data = JSON.parse(raw.toString('utf-8'));  
  return data.map((entry: Record<string, unknown>) => pr.convertObjectToClass(entry));
}

export function jsonRevertDashboard(pathToFile: string, ent: typeof Dashboard = Dashboard, directory='./'): Array<Dashboard> {
  const raw = fs.readFileSync(path.resolve(directory, pathToFile));
  const data = JSON.parse(raw.toString('utf-8'));  
  return data.map((entry: Record<string, unknown>) => ent.convertObjectToClass(entry));
}

export function convertStep3ToStep4(filename: string): Array<DownloadLists> {
    const rawdata = fs.readFileSync(filename, 'utf8');
    const jsonData = JSON.parse(rawdata);
    return jsonData.map((entry: Record<string, any>) => {
        const date = entry._date ? new CMSDate(
            `${entry._date._month.month}/${entry._date._day.day}/${entry._date._year.year}`
        ) : undefined;

        const relatedDoc = entry._relatedDoc ? new CMSFile(
            entry._relatedDoc._remotePath,
            entry._relatedDoc._customFilename,
            entry._relatedDoc._localPath
        ) : undefined;

        return new DownloadLists({
            title: entry._title,
            date: date,
            downloadType: entry._downloadType,
            state: entry._state,
            relatedDoc: relatedDoc
        });
    });
}