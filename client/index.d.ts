
import { Observable } from 'rxjs';

declare namespace hz {

    interface Feed {
        watch (options?: { rawChanges: boolean }): Observable<any>;
        fetch (): Observable<any>;
    }

    type Bound = 'open' | 'closed';
    type Direction = 'ascending' | 'descending';
    type Primitive = boolean | number | string | Date;
    type IdValue = Primitive | Primitive[] | { id: Primitive };
    type WriteOp = Object | Object[];

    interface TermBase extends Feed {
        find (value: IdValue): TermBase;
        findAll (...values: IdValue[]): TermBase;

        order (fields: string[], direction?: Direction): TermBase;
        limit (size: Number): TermBase;
        above (spec: any, bound?: Bound): TermBase;
        below (spec: any, bound?: Bound): TermBase;
    }

    interface Collection extends TermBase {
        store (docs: WriteOp): Observable<any>;
        upsert (docs: WriteOp): Observable<any>;
        insert (docs: WriteOp): Observable<any>;
        replace (docs: WriteOp): Observable<any>;
        update (docs: WriteOp): Observable<any>;

        remove (docs: IdValue): Observable<any>;
        removeAll (docs: IdValue[]): Observable<any>;
    }

    interface User extends Feed {}

    interface HorizonInstance {
        (name: string): Collection;

        currentUser (): User;

        hasAuthToken (): boolean;
        authEndpoint (name: string): Observable<string>;

        aggregate (aggs: any): TermBase;
        model (fn: Function): TermBase;

        disconnect (): void;
        connect (): void;

        status (): Observable<any>;
        onReady (): Observable<any>;
        onDisconnected (): Observable<any>;
        onSocketError (): Observable<any>;
    }

    interface HorizonOptions {
        host?: string;
        path?: string;
        secure?: boolean;

        authType?: string;
        lazyWrites?: boolean;
        keepalive?: number;

        WebSocketCtor?: any;
    }

    interface Horizon {
        (options: HorizonOptions): HorizonInstance;

        clearAuthTokens (): void;
    }
}

export type HorizonOptions = hz.HorizonOptions;
export type HorizonInstance = hz.HorizonInstance;
export type TermBase = hz.TermBase;
export type Collection = hz.Collection;
export type User = hz.User;

declare var Horizon: hz.Horizon;
export default Horizon;
