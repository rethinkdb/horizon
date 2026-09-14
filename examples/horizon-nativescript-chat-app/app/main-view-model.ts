var Horizon = require('@horizon/client/dist/horizon-dev');
import {Observable} from 'data/observable';
import {ObservableArray} from 'data/observable-array';
import frame = require("ui/frame");
import {ListView} from 'ui/list-view';
var config = require('./config');

const SERVER_URL = config.SERVER_URL;

export class HorizonDemo extends Observable {
    public messages: ObservableArray<any>;
    public newMessage: string;
    private horizon;
    private chat;
    private avatar_url = `http://api.adorable.io/avatars/50/${new Date().getMilliseconds()}.png`;

    constructor() {
        super();
        this.messages = new ObservableArray();
        
        this.horizon = new Horizon({ host: SERVER_URL });

        this.horizon.onReady()
            .subscribe(status => { console.log(status.type) })

        this.horizon.onDisconnected()
            .subscribe(status => { console.log(status.type) })

        this.horizon.onSocketError()
            .subscribe(status => { console.log(status.type) })

        this.chat = this.horizon('messages');

        this.getChats().subscribe((newMessage: any) => {           
            newMessage.map((val,index)=>{
                this.messages.setItem(index,val);
            });
            this.messages.reverse();            
        });
    }

    private getChats() {
        return this.chat
            .order('timeStamp', 'descending')
            .limit(10)
            .watch();
    }
    
    public addMessage() {
        this.chat
            .store({
                text: this.newMessage,
                timeStamp: new Date(),
                avatar: this.avatar_url,
            }).subscribe((res) => {
                console.log(`Adding new message:`);
               let lv =  <ListView>frame.topmost().getViewById('list');
               lv.scrollToIndex(this.messages.length - 1);
            },
            (error) => { console.log(error) });
        this.set('newMessage', '');
    }
    
    private getStatus() {
        return this.horizon.status();
    }
}