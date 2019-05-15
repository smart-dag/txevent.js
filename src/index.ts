import { EventEmitter } from "events";
import ws from 'ws';
import randomBytes from 'randombytes';

export default class SDAGEvent extends EventEmitter {

    private ws: WebSocket | ws;
    private url: string;
    private pendingRequests = new Map<string, (resp?: IRequestResponse) => void>();
    private tag = 0;
    private addresses: string[] = [];
    connected = false;
    peerId: string;

    constructor(opts: { peerId?: string } = {}) {
        super();
        this.peerId = opts.peerId || randomBytes(32).toString('hex');
    }

    private createSocket(address: string) {
        try {
            return new WebSocket(address);
        } catch (error) {
            return new ws(address);
        }
    }

    private setup(client: WebSocket | ws, onOpen: () => void = undefined) {
        let heartbeatTimer: NodeJS.Timer;

        client.onopen = () => {
            this.sendVersion({ protocol_version: '1.0', alt: '1', library: 'rust-dag', library_version: '0.1.0', program: 'sdag-explorer', program_version: '0.1.0' });
            this.connected = true;
            heartbeatTimer = setInterval(() => this.sendHeartbeat(), 3000);

            setTimeout(() => {
                super.emit('connected');
                if (onOpen) onOpen();
            }, 500);
        };

        client.onmessage = this.onMessage;

        client.onerror = (err) => {
            super.emit('error', err.message);

            clearInterval(heartbeatTimer);
            this.connected = false;
            this.emit('server_lost');

            setTimeout(() => {
                this.ws = this.createSocket(this.url);
                this.setup(this.ws);
            }, 3000);
        };
    }

    async connect(address: string = 'ws://hub.sdag.io:8086') {
        this.close();

        if (!address) {
            throw Error('empty address');
        }

        address = address.startsWith('ws') ? address : 'ws://' + address;
        this.url = address;

        return new Promise<boolean>((resolve) => {
            this.ws = this.createSocket(this.url);
            let timeout = setTimeout(() => resolve(false), 5000);
            this.setup(this.ws, () => {
                clearTimeout(timeout);
                resolve(true);
            });
        });
    }

    private onMessage = (ev: MessageEvent) => {
        try {
            let [type, content] = JSON.parse(ev.data);

            switch (type) {
                case 'request':
                    this.handleRequest(content);
                    break;
                case 'justsaying':
                    this.handleJustsaying(content);
                    break;
                case 'response':
                    this.handleResponse(content);
                    break;
            }
        } catch (error) {

        }
    }

    private send(type: 'request' | 'justsaying' | 'response', content: any) {
        if (this.ws.readyState !== this.ws.OPEN) return false;
        this.ws.send(JSON.stringify([type, content]));
        return true;
    }

    private sendRequest(content: IRequestContent, resolver?: (resp?: IRequestResponse) => void): string {
        let rid: string = content.tag = content.tag || `${Date.now()}_${this.tag++}`;
        this.send('request', content);

        if (resolver) {
            this.pendingRequests.set(rid, resolver);
        }

        return rid;
    }

    private sendJustsaying(content: { subject, body }) {
        this.send('justsaying', content);
    }

    private sendResponse(content: any) {
        this.send('response', content);
    }

    private sendErrorResponse(tag: any, error: any) {
        this.sendResponse({ tag, response: { error } });
    }

    private sendError(content: any) {
        this.sendJustsaying({ subject: 'error', body: content });
    }

    private sendVersion(body: { protocol_version: string, alt: string, library: string, library_version: string, program: string, program_version: string }) {
        this.sendJustsaying({ subject: 'version', body });
    }

    private sendHeartbeat() {
        this.sendRequest({ command: 'heartbeat', });
    }

    private sendSubscribe() {
        this.sendRequest({ command: 'subscribe', params: { peer_id: this.peerId, last_mci: 10, } });
    }

    private handleJustsaying(content: IJustsayingResponse) {
        switch (content.subject) {
            case 'joint':
                this.emit('joint', content.body);
                break;

            case 'notify':
                const msg = content.body as NotifyMessage;
                this.emit('NotifyMessage', msg);

                let receivers = msg.to_msg.map(t => { return { to: t[0] as string, amount: t[1] as number } });
                let [to] = receivers.filter(t => this.addresses.includes(t.to));
                let e = this.addresses.includes(msg.from) ? 'out' : to ? 'in' : undefined;

                if (!e) return;
                this.emit(e, { from: msg.from, to: to ? to.to : undefined, amount: to ? to.amount : undefined, text: msg.text, timestamp: msg.time, unit: msg.unit });
                break;
        }
    }

    private handleRequest(content: IRequestContent) {
        if (content.command === 'subscribe') {
            let peerId = content.params.peer_id;
            this.sendResponse({ tag: content.tag, response: { peer_id: peerId || this.peerId, is_source: false } });
        }
    }

    private handleResponse(content: IRequestResponse) {

        if (!this.pendingRequests.has(content.tag)) return;

        let resolver = this.pendingRequests.get(content.tag);
        if (!resolver) return;

        resolver(content);
    }

    onServerLost(cb: () => void) {
        super.addListener('server_lost', cb);
    }

    watch(addresses: string[]) {
        this.addresses = this.addresses.concat(addresses);
        this.sendRequest({ command: 'watch', params: addresses });
        return this;
    }

    close() {
        if (!this.ws) return;

        try {
            this.removeAllListeners();
            this.ws.close()
            this.ws.onclose = null;
            this.ws.onmessage = null;
            this.ws.onopen = null;
            this.ws.onmessage = null;
            this.ws.onerror = null;
            this.ws = null;
        } catch (error) {

        }
    }
}

type CommandList =
    'get_net_info' |
    'get_joint' |
    'getunitbymci' |
    'getunitsbyrange' |
    'getunitsbyaddress' |
    'get_balance' |
    'subscribe' |
    'heartbeat' | string;

export interface IRequestContent {
    command: CommandList;
    tag?: any;
    params?: string | any;
}

export interface IJustsayingResponse {
    subject: string;
    body: any;
}

export interface IRequestResponse {
    response: any; //PropertyJoint | NetworkInfo | Balance | { joints: Joint[] } | { transactions: Transaction[] };
    tag: string;
}

export interface NotifyMessage {
    from: string;
    text: string;
    time: number;
    to_msg: (number | string)[][];
    unit: string;
}