import { CMSDate } from './CMSDate';
import { Objectifiable } from './Objectifiable';
import { CMSFile } from './CMSFile';
import { ContainsDownloadableFiles } from './Downloadable';
import { State } from './State';
import { stringToEnumValue } from '../helpers/Enum';
import { Select } from './Select';

const MAX_TITLE_COUNT = 501;

export type DownloadListsInput = {
    date?: CMSDate | string;
    title?: string;
    href?: URL | string;
    category?: Select;
    description?: string;
    tags?: Array<string>;
    relatedDoc?: CMSFile;
    downloadType?: unknown;
    active?: boolean;
    createdHref?: URL;
    state?: State;
}

export class DownloadLists implements Objectifiable, ContainsDownloadableFiles {
    private _date?: CMSDate;
    private _title?: string;
    private _href?: URL;
    private _category?: Select;
    private _description?: string;
    private _tags: Array<string> = [];
    private _relatedDoc?: CMSFile;
    private _downloadType?: unknown;
    private _active: boolean = true;
    private _createdHref?: URL;
    private _state: State = State.Uninitialized;

    constructor(input: DownloadListsInput) {
        if (input.date) {
            if (typeof input.date === 'string') {
                this._date = new CMSDate(input.date);
            } else {
                this._date = input.date;
            }
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

        if (input.category) {
            this._category = new Select(input.category.value, input.category.text);
        }

        if (input.description) {
            if (input.description !== undefined){
                this._description = input.description;
            } else {
                this._description = '';
            }
        }

        if (input.tags) {
            this._tags = input.tags;
        }

        if (input.downloadType) {
            this._downloadType = input.downloadType;
        }

        if (input.relatedDoc) {
            this._relatedDoc = input.relatedDoc;
        }

        if (input.active != null) {
            this._active = input.active;
        }

        if (input.createdHref != null) {
            this._createdHref = input.createdHref;
        }

        this._state = input.state != null ? input.state : State.Uninitialized;
    }

    public get title(): string | undefined {
        return this._title;
    }

    public set title(str: string | undefined) {
        this._title = str;
    }

    public set date(input: CMSDate | undefined) {
        this._date = input;
    }

    public get date(): CMSDate | undefined {
        return this._date;
    }

    public get href(): URL | undefined {
        return this._href;
    }

    public set category(c: Select | undefined) {
        this._category = c;
    }

    public get category(): Select | undefined {
        return this._category;
    }

    public get description(): string | undefined {
        return this._description;
    }

    public set description(description: string | undefined) {
        this._description = description;
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

    public get downloadType() {
        return this._downloadType;
    }

    public set downloadType(downloadType: unknown) {
        this._downloadType = downloadType;
    }

    public get relatedDoc(): CMSFile | undefined {
        return this._relatedDoc;
    }

    public set relatedDoc(file: CMSFile | undefined) {
        this._relatedDoc = file;
    }

    public set active(b: boolean) {
        this._active = b;
    }

    public get active(): boolean {
        return this._active;
    }

    public get createdHref(): URL | undefined {
        return this._createdHref;
    }

    public set createdHref(u: URL | undefined) {
        this._createdHref = u;
    }

    public set state(s: State) {
        this._state = s;
    }

    public get state(): State {
        return this._state;
    }

    objectify() {
        const obj: Record<string, any> = {};

        if (this._date) {
            obj.date = this._date.to_string();
        }

        if (this._title) {
            obj.title = this._title;
        }

        if (this._description) {
            obj.description = this._description;
        }

        if (this._href) {
            obj.href = this._href;
        }

        if (this._category) {
            obj.category = this._category.objectify();
        }

        if (this._tags) {
            obj.tags = this._tags;
        }

        if (this._downloadType) {
            obj.downloadType = this._downloadType;
        }

        if (this._relatedDoc) {
            obj.relatedDoc = this._relatedDoc.objectify();
        }

        obj.active = this._active;

        if (this._createdHref) {
            obj.createdHref = this._createdHref.toString();
        }

        obj.state = this._state;

        return obj;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public static convertObjectToClass(o: any) {
        const input: DownloadListsInput = {};

        if (o.date) {
            if (o.date.day && o.date.month && o.date.year) {
                input.date = `${o.date.month}/${o.date.day}/${o.date.year}`;
            }
            else {
                input.date = o.date;
            }
        }

        if (o.title) {
            input.title = o.title;
        }

        if (o.href) {
            input.href = new URL(o.href);
        }

        if (o.category) {
            input.category = new Select(o.category.value, o.category.text);
        }

        if (o.description) {
            input.description = o.description;
        }

        if (o.tags) {
            input.tags = o.tags;
        }

        if (o.downloadType) {
            input.downloadType = o.downloadType;
        }

        if (o.relatedDoc) {
            let localPath, customFilename;
            if (o.relatedDoc.localPath && o.relatedDoc.localPath !== '') {
                localPath = o.relatedDoc.localPath;
            }
            if (o.relatedDoc.customFilename && o.relatedDoc.customFilename !== '') {
                customFilename = o.relatedDoc.customFilename;
            }
            input.relatedDoc = new CMSFile(o.relatedDoc.remotePath, customFilename, localPath);
        }

        if (o.active !== null && o.active !== undefined) {
            input.active = o.active;
        }

        if (o.createdHref !== null && o.createdHref !== undefined) {
            input.createdHref = new URL(o.createdHref);
        }

        if (o.state !== null && o.state !== undefined) {
            input.state = stringToEnumValue(State, o.state);
        }

        return new DownloadLists(input);
    }

    getDownloadables(): Array<CMSFile> {
        const downloadables: Array<CMSFile> = [];

        if (this._relatedDoc) {
            downloadables.push(this._relatedDoc);
        }

        return downloadables;
    }
}