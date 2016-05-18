///<reference path="../../horizon.d.ts" />

import {Component, OnInit} from '@angular/core';

@Component({
    selector: '<chat><chat>',
   styles: [`
        ul {
            list-style-type: none;
            padding:0;
        }
       
        .message {
            height: 50px;
            padding:5px;
        }

        .message img {
            vertical-align:middle;
        }
        .message .text {
            vertical-align:middle;
            margin-left:5px;
            font-size:20px;
        }
        .message .datetime {
             color:darkgrey;
             float:right;
        }
        form{
           
        }
        input {
            width: 90%;
            height: 50px;
            font-size: 20px;
            float: left;
            padding: 10px;
        }
        button{
            width:10%;
            height: 50px;
        }
   `],
    template: `<h1>Messages</h1>
    <form>
        <input [(ngModel)]="newMessage">
        <button type="submit" (click)="addMessage(newMessage)">Send</button>
    </form>
    <ul>
        <li *ngFor="let message of messages; let i = index" class="message">
        <img height="50px" width="50px" src="{{message.url}}" />
        <span> {{message.text}} </span>
        <span class="datetime u-pull-right">
            {{message.datetime}}
          </span>
        </li>
    </ul>
    `
})
export class ChatComponent implements OnInit {
    horizon = Horizon();
    chat = this.horizon('chat');

    newMessage = '';
    avatar_url = `http://api.adorable.io/avatars/50/${new Date().getMilliseconds()}.png`;
    messages = [];
    ngOnInit() {
        this.getChats()
    }

    getChats = function() {
        this.chat
            .order('datetime', 'descending')
            .limit(8)
            .watch()
            .subscribe((newMessages) => {
                this.messages = [...newMessages];
            });
    }

    addMessage = function(text) {
        if (text) {
            this.chat.store({
                text: text,
                datetime: new Date(),
                url: this.avatar_url,
            }).subscribe();
            this.newMessage = '';
        }
    }




}