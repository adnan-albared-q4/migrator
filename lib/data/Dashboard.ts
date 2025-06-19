import { Objectifiable } from './Objectifiable';
import { State } from './State';
import { stringToEnumValue } from '../helpers/Enum';

export type DashboardInput = {
    title?: string;
    href?: URL | string;
    state?: State;
}

export class Dashboard implements Objectifiable {
    private _title?: string;
    private _href?: URL;
    private _state: State = State.Uninitialized;

    constructor(input: DashboardInput) {
        if (input.title) {
            this._title = input.title;
        }

        if (input.href) {
            this._href = typeof input.href === 'string' ? new URL(input.href) : input.href;
        }

        this._state = input.state ?? State.Uninitialized;
    }

    public get title(): string | undefined {
        return this._title;
    }

    public set title(str: string | undefined) {
        this._title = str;
    }

    public get href(): URL | undefined {
        return this._href;
    }

    objectify() {
        const obj: Record<string, any> = {};

        if (this._title) {
            obj.title = this._title;
        }
    
        if (this._href) {
            obj.href = this._href;
        }

        obj.state = this._state;
    
        return obj;
    }

    public static convertObjectToClass(o: any) {
        const input: DashboardInput = {};

        if (o.title) {
            input.title = o.title;
        }
    
        if (o.href) {
            input.href = new URL(o.href);
        }

        if (o.state !== null && o.state !== undefined) {
            input.state = stringToEnumValue(State, o.state);
        }
    
        return new Dashboard(input);
    }
}