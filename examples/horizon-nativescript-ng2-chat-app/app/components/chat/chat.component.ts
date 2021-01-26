import {Component, OnInit,PipeTransform,Pipe} from '@angular/core';
import {HorizonService} from '../../services/horizon.service';
import {Http} from '@angular/http';
import * as moment from 'moment';
import {FromNowPipe} from '../../pipes/fromnow.pipe';
import {ListView} from 'ui/list-view'
@Component({
    selector: 'chat',
    templateUrl: 'components/chat/chat.component.html',
    providers: [HorizonService,ListView],
    pipes: [FromNowPipe] 
})


export class ChatComponent implements OnInit {
    newMessage;
    messages;
    constructor(private hs: HorizonService, private http: Http,private listview:ListView) {
        this.messages = [];
        this.newMessage = '';
    }

    ngOnInit() {
        this.hs.getChats()
            .subscribe((newMessage) => {
                this.messages = [...newMessage].reverse();
                console.log('updating')
            },
            error => { console.log(error) })
    }

    addMessage(message) {
        this.hs.addMessage(message)
            .subscribe((res) => {
                this.listview.scrollToIndex(this.messages.length - 1)
                console.log(res);
                console.log(`Adding new message:`);
                console.log(this.newMessage);
            },
            error => { console.log(error) })
        this.newMessage = '';

    }
}