import { CMSDate } from './CMSDate';
import { CMSTime } from './Time';
import { Select } from './Select';
import { Objectifiable } from './Objectifiable';
import { CMSFile } from './CMSFile';
import { Attachment, parseAttachmentDocumentType, parseAttachmentType } from './Attachment';
import { UrlOverride } from './UrlOverride';
import { ContainsDownloadableFiles } from './Downloadable';
import { State } from './State';
import { stringToEnumValue } from '../helpers/Enum';

const MAX_TITLE_COUNT = 501;

export type EventsInput = {
  startDate?: CMSDate | string;
  endDate?: CMSDate | string;
  timeZone?: string;
  title?: string;
  startTime?: CMSTime;  
  endTime?: CMSTime;
  href?: URL | string;
  tags?: Array<string>;
  location?: string;
  body?: string;
  isWebcast?: boolean;
  openLinkInNewWindow?: boolean;
  exclude?: boolean;
  active?: boolean;
  urlOverride?: UrlOverride;
  relatedRelease?: Select;
  relatedFinancial?: Select;
  financialPeriodQuarter?: Select;
  financialPeriodYear?: Select;
  relatedPresentation?: Select;
  relatedWebcast?: UrlOverride;
  speakers?: unknown;
  attachments?: Array<Attachment>;
  createdHref?: URL;
  state?: State;
}

export class Events implements Objectifiable, ContainsDownloadableFiles {
  private _startDate?: CMSDate;
  private _endDate?: CMSDate;
  private _timeZone?: string;
  private _title?: string;
  private _startTime?: CMSTime;
  private _endTime?: CMSTime;
  private _href?: URL;
  private _tags: Array<string> = [];
  private _location?: string;
  private _body?: string;
  private _isWebcast: boolean = false;
  private _openLinkInNewWindow: boolean = false;
  private _exclude: boolean = false;
  private _active: boolean = true;
  private _urlOverride?: UrlOverride;
  private _relatedRelease?: Select;
  private _relatedFinancial?: Select;
  private _financialPeriodQuarter?: Select;
  private _financialPeriodYear?: Select;
  private _relatedPresentation?: Select;
  private _relatedWebcast?: UrlOverride;
  private _speakers?: unknown;
  private _attachments: Array<Attachment> = [];
  private _createdHref?: URL;
  private _state: State = State.Uninitialized;
  constructor(input: EventsInput) {

    if (input.startDate) {
      if (typeof input.startDate === 'string') {
        this._startDate = new CMSDate(input.startDate);
      } else {
        this._startDate = input.startDate;
      }
    }

    if (input.endDate) {
      if (typeof input.endDate === 'string') {
        this._endDate = new CMSDate(input.endDate);
      } else {
        this._endDate = input.endDate;
      }
    }

    if (input.timeZone) {
      if (input.timeZone.length > 2 && input.timeZone.length < 3) {
        const tzArr = input.timeZone.split('');
        tzArr[1] = ''
        input.timeZone = tzArr.join('');
      }
      if (input.timeZone.length > 3){
        throw new Error("Time Zone text is too long.");
      }
      this._timeZone = input.timeZone;
    }

    if (input.title) {
      if (input.title.length >= MAX_TITLE_COUNT) {
        throw new Error("Title cannot be longer than 501 characters.");
      }
      this._title = input.title;
    }

    if (input.href) {
      this._href = typeof input.href === 'string' ? new URL(input.href) : input.href;
    }

    if (input.startTime) {
      this._startTime = input.startTime;
    }

    if (input.endTime) {
      this._endTime = input.endTime;
    }
    
    if (input.tags) {
      this._tags = input.tags;
    }

    if (input.location) {
      if (input.location !== undefined){
        this._location = input.location;
    } else {
      this._location = '';
    }
    }

    if (input.body) {
      this._body = input.body;
    }

    if (input.isWebcast){
      this._isWebcast = input.isWebcast;
    }

    if (input.openLinkInNewWindow !== null) {
      this._openLinkInNewWindow = input.openLinkInNewWindow ?? false;
    }

    if (input.exclude !== null) {
      this._exclude = input.exclude ?? false;
    }

    if (input.active !== null) {
      this._active = input.active ?? true;
    }

    if (input.urlOverride) {
      this._urlOverride = input.urlOverride;
    }

    if (input.relatedRelease) {
      this._relatedRelease = input.relatedRelease;
    }

    if (input.relatedFinancial) {
      this._relatedFinancial = input.relatedFinancial;
    }

    if (input.financialPeriodQuarter) {
      this._financialPeriodQuarter = input.financialPeriodQuarter;
    }

    if (input.financialPeriodYear) {
      this._financialPeriodYear = input.financialPeriodYear;
    }

    if (input.relatedPresentation) {
      this._relatedPresentation = input.relatedPresentation;
    }

    if (input.relatedWebcast) {
      // if relatedWebcast is undefined, don't set it
      if (input.relatedWebcast !== undefined) {
        this._relatedWebcast = input.relatedWebcast;
      }
    }

    if (input.speakers) {
      this._speakers = input.speakers;
    }

    if (input.attachments && input.attachments.length > 0) {
      this._attachments = input.attachments;
    }

    if (input.createdHref != null) {
      this._createdHref = input.createdHref;
    }

    this._state = input.state != null ? input.state : State.Uninitialized;

  }

  public get startDate(): CMSDate | undefined {
    return this._startDate;
  }

  public set startDate(input: CMSDate | undefined) {
    this._startDate = input;
  }

  public get endDate(): CMSDate | undefined {
    return this._endDate;
  }

  public set endDate(input: CMSDate | undefined) {
    this._endDate = input;
  }

  public get timeZone(): string | undefined {
    return this._timeZone;
  }

  public set timeZone(str: string | undefined) {
    this._timeZone = str;
  }  

  public get title(): string | undefined {
    return this._title;
  }

  public set title(str: string | undefined) {
    this._title = str;
  }
  
  public get startTime(): CMSTime | undefined {
    return this._startTime;
  }

  public set startTime(input: CMSTime | undefined) {
    this._startTime = input;
  }

  public get endTime(): CMSTime | undefined {
    return this._endTime;
  }

  public set endTime(input: CMSTime | undefined) {
    this._endTime = input;
  }

  public get href(): URL | undefined {
    return this._href;
  }
  
    public set tags(tags: Array<string>) {
      this._tags = tags;
    }
  
    public get tags(): Array<string> {
      if (this._tags == null) {
        return [];
      }
      return this._tags;
    }

  public get location(): string | undefined {
    return this._location;
  }

  public set location(loc: string | undefined) {
    this._location = loc;
  }

  public get body(): string | undefined {
    return this._body;
  }

  public set body(body: string | undefined) {
    this._body = body;
  }

  public get isWebcast(): boolean {
    return this._isWebcast;
  }

  public set isWebcast(b: boolean) {
    this._isWebcast = b;
  }

  public get openLinkInNewWindow(): boolean {
    return this._openLinkInNewWindow;
  }

  public set openLinkInNewWindow(b: boolean) {
    this._openLinkInNewWindow = b;
  }

  public get exclude(): boolean {
    return this._exclude;
  }

  public set exclude(b: boolean) {
    this._exclude = b;
  }

  public get active(): boolean {
    return this._active;
  }

  public set active(b: boolean) {
    this._active = b;
  }

  public get urlOverride(): UrlOverride | undefined {
    return this._urlOverride;
  }

  public set urlOverride(override: UrlOverride | undefined) {
    this._urlOverride = override;
  }

  public get relatedRelease(): Select | undefined {
    return this._relatedRelease;
  }

  public set relatedRelease(r: Select | undefined) {
    this._relatedRelease = r;
  }

  public get relatedFinancial(): Select | undefined {
    return this._relatedFinancial;
  }

  public set relatedFinancial(r: Select | undefined) {
    this._relatedFinancial = r;
  }

  public get financialPeriodQuarter(): Select | undefined {
    return this._financialPeriodQuarter;
  }

  public set financialPeriodQuarter(f: Select | undefined) {
    this._financialPeriodQuarter = f;
  }

  public get financialPeriodYear(): Select | undefined {
    return this._financialPeriodYear;
  }

  public set financialPeriodYear(f: Select | undefined) {
    this._financialPeriodYear = f;
  }  

  public get relatedPresentation(): Select | undefined {
    return this._relatedPresentation;
  }

  public set relatedPresentation(r: Select | undefined) {
    this._relatedPresentation = r;
  }

  public get relatedWebcast(): UrlOverride | undefined {
    return this._relatedWebcast;
  }

  public set relatedWebcast(override: UrlOverride | undefined) {
    this._relatedWebcast = override;
  }

  public get speakers(): unknown | undefined {
    return this._speakers;
  }

  public set speakers(s: unknown | undefined) {
    this._speakers = s;
  }

  public get attachments(): Array<Attachment> {
    return this._attachments;
  }

  public set attachments(a: Array<Attachment>) {
    this._attachments = a;
  }

  public get createdHref(): URL | undefined {
    return this._createdHref;
  }

  public set createdHref(u: URL | undefined) {
    this._createdHref = u;
  }

  public get state(): State {
    return this._state;
  }

  public set state(s: State) {
    this._state = s;
  }

  objectify() {
    const obj: Record<string, any> = {};

    if (this._startTime) {
      obj.startTime = {
        hour: this._startTime.hour,
        minute: this._startTime.minute,
        meridiem: this._startTime.meridiem
      };
    }

    if (this._endTime) {
      obj.endTime = {
        hour: this._endTime.hour,
        minute: this._endTime.minute,
        meridiem: this._endTime.meridiem
      };
    }

    if (this._startDate) {
      obj.startDate = this._startDate.to_string();
    }

    if (this._endDate) {
      obj.endDate = this._endDate.to_string();
    }

    if (this._timeZone) {
      obj.timeZone = this._timeZone;
    }

    if (this._title) {
      obj.title = this._title;
    }

    if (this._href) {
      obj.href = this._href;
    }

    if (this._tags) {
      obj.tags = this._tags;
    }

    if (this._location) {
      obj.location = this._location;
    }

    if (this._body) {
      obj.body = this._body;
    }

    obj.isWebcast = this._isWebcast;
    obj.openLinkInNewWindow = this._openLinkInNewWindow;
    obj.exclude = this._exclude;
    obj.active = this._active;

    if (this._urlOverride) {
      if (this._urlOverride instanceof URL) {
        obj.urlOverride = this._urlOverride.toString();
      } else {
        obj.urlOverride = this._urlOverride.objectify();
      }
    }

    if (this._relatedRelease) {
      obj.relatedRelease = this._relatedRelease.objectify();
    }

    if (this._relatedFinancial) {
      obj.relatedFinancial = this._relatedFinancial.objectify();
    }

    if (this._financialPeriodQuarter) {
      obj.financialPeriodQuarter = this._financialPeriodQuarter.objectify();
    }

    if (this._financialPeriodYear) {
      obj.financialPeriodYear = this._financialPeriodYear.objectify();
    }

    if (this._relatedPresentation) {
      obj.relatedPresentation = this._relatedPresentation.objectify();
    }

    if (this._relatedWebcast) {
      obj.relatedWebcast = this._relatedWebcast;
    }

    if (this._speakers) {
      obj.speakers = this._speakers;
    }

    if (this._attachments && this._attachments.length > 0) {
      obj.attachments = this._attachments.map((attachment: Attachment) => attachment.objectify());
    }

    if (this._createdHref) {
      obj.createdHref = this._createdHref.toString();
    }

    obj.state = this._state;

    return obj;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public static convertObjectToClass(o: any) {

    const input: EventsInput = {};

    if (o.startDate) {
      if (o.startDate.day && o.startDate.month && o.startDate.year) {
        input.startDate = `${o.startDate.month}/${o.startDate.day}/${o.startDate.year}`;
      }
      else {
        input.startDate = o.startDate;
      }
    }

    if (o.endDate) {
      if (o.endDate.day && o.endDate.month && o.endDate.year) {
        input.endDate = `${o.endDate.month}/${o.endDate.day}/${o.endDate.year}`;
      }
      else {
        input.endDate = o.endDate;
      }
    }

    if (o.timeZone) {
      input.timeZone = o.timeZone;
    }

    if (o.title) {
      input.title = o.title;
    }

    if (o.startTime) {
      input.startTime = new CMSTime(o.startTime.hour, o.startTime.minute, o.startTime.meridiem);
    }

    if (o.endTime) {
      input.endTime = new CMSTime(o.endTime.hour, o.endTime.minute, o.endTime.meridiem);
    }

    if (o.href) {
      input.href = new URL(o.href);
    }

    if (o.tags) {
      input.tags = o.tags;
    }

    if (o.location) {
      input.location = o.location;
    }

    if (o.body) {
      input.body = o.body;
    }

    if (o.isWebcast !== null && o.isWebcast !== undefined) {
      input.isWebcast = o.isWebcast;
    }

    if (o.openLinkInNewWindow !== null && o.openLinkInNewWindow !== undefined) {
      input.openLinkInNewWindow = o.openLinkInNewWindow;
    }

    if (o.exclude !== null && o.exclude !== undefined) {
      input.exclude = o.exclude;
    }

    if (o.active !== null && o.active !== undefined) {
      input.active = o.active;
    }

    if (o.urlOverride) {
      if (typeof o.urlOverride === 'string') {
        input.urlOverride = new URL(o.urlOverride);
      } else {
        const override = o.urlOverride;
        input.urlOverride = new CMSFile(override.remotePath, override.customFilename, override.localPath);      }
    }

    if (o.relatedRelease) {
      input.relatedRelease = new Select(o.relatedRelease.value, o.relatedRelease.text);
    }

    if (o.relatedFinancial) {
      input.relatedFinancial = new Select(o.relatedFinancial.value, o.relatedFinancial.text);
    }

    if (o.financialPeriodQuarter) {
      input.financialPeriodQuarter = new Select(o.financialPeriodQuarter.value, o.financialPeriodQuarter.text);
    }

    if (o.financialPeriodYear) {
      input.financialPeriodYear = new Select(o.financialPeriodYear.value, o.financialPeriodYear.text);
    }

    if (o.relatedPresentation) {
      input.relatedPresentation = new Select(o.relatedPresentation.value, o.relatedPresentation.text);
    }

    if (o.relatedWebcast) {
      input.relatedWebcast = o.relatedWebcast;
    }

    if (o.speakers) {
      input.speakers = o.speakers;
    }

    if (o.attachments) {
      input.attachments = o.attachments.map((attachment: any) => {
        let localPath, customFilename;
        if (attachment.localPath && attachment.localPath !== '') {
          localPath = attachment.localPath;
        }
        if (attachment.customFilename && attachment.customFilename !== '') {
          customFilename = attachment.customFilename;
        }
        return new CMSFile(attachment.remotePath, customFilename, localPath);
      });
    }

    if (o.createdHref !== null && o.createdHref !== undefined) {
      input.createdHref = new URL(o.createdHref);
    }

    if (o.state !== null && o.state !== undefined) {
      input.state = stringToEnumValue(State, o.state);
    }

    return new Events(input);

  }

  getDownloadables(): Array<CMSFile> {

    const downloadables: Array<CMSFile> = [];

    if (this._urlOverride instanceof CMSFile) {
      downloadables.push(this._urlOverride);
    }

    if (this._attachments) {
      for (const file of this._attachments) {
        downloadables.push(file.file);
      }
    }

    return downloadables;

  }

}