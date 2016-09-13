
import { Observable } from 'rxjs';

declare namespace hz {
    type Bound = 'open' | 'closed';
    type Direction = 'ascending' | 'descending';
    type Primitive = boolean | number | string | Date;
    type IdValue = Primitive | Primitive[] | { id: Primitive };

    interface TermBase {
        watch (options?: { rawChanges: boolean }): TermBase;
        fetch (): TermBase;

        findAll (...values: IdValue[]): TermBase;
        find (value: IdValue): TermBase;

        order (fields: string[], direction?: Direction): TermBase;
        limit (size: Number): TermBase;
        above (spec: any, bound?: Bound): TermBase;
        below (spec: any, bound?: Bound): TermBase;
    }

    type WriteOp = Object | Object[];

    interface Collection extends TermBase {
        store (docs: WriteOp): Observable<any>;
        upsert (docs: WriteOp): Observable<any>;
        insert (docs: WriteOp): Observable<any>;
        replace (docs: WriteOp): Observable<any>;
        update (docs: WriteOp): Observable<any>;
        remove (docs: IdValue): Observable<any>;
        remove (docs: IdValue[]): Observable<any>;
    }

    interface User extends TermBase {}

    interface HorizonInstance {
        (name: string): Collection;

        currentUser (): User;

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

declare var Horizon: hz.Horizon;
export default Horizon;
