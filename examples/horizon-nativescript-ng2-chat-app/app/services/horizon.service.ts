var Horizon = require('@horizon/client/dist/horizon-dev');
import {Injectable} from '@angular/core';
import {Observable} from 'rxjs/Observable';
import config = require('../config');
const SERVER_URL = config.SERVER_URL;

@Injectable()
export class HorizonService {
    private horizon;
    private chat;
    private avatar_url = `http://api.adorable.io/avatars/50/${new Date().getMilliseconds()}.png`;
    constructor() {
        this.horizon = new Horizon({ host: SERVER_URL });

        this.horizon.onReady()
            .subscribe(status => { console.log(status.type) })

        this.horizon.onDisconnected()
            .subscribe(status => { console.log(status.type) })

        this.horizon.onSocketError()
            .subscribe(status => { console.log(status.type) })
        
        this.chat = this.horizon('messages');     
    }
    
    connect() {
        return this.horizon.connect();
    }

    getChats() {

        return this.chat
            .order('timeStamp', 'descending')
            .limit(10)
            .watch()

    }
    addMessage(text) {
        return this.chat
            .store({
                text: text,
                timeStamp: new Date(),
                avatar: this.avatar_url,
            });
    }
    getStatus() {
        return this.horizon.status();
    }

}
