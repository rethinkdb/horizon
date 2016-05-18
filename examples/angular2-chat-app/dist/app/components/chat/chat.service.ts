import {Component, OnInit} from '@angular/core';
import {Observable} from 'rxjs'


export class ChatService {
    horizon = Horizon();
    chat = this.horizon('chat');
    avatar_url = `http://api.adorable.io/avatars/50/${new Date().getMilliseconds()}.png`;


    constructor() { }
    getChats = function (): Observable<[any]> {
        return this.chat
            .order('datetime', 'descending')
            .limit(8)
            .watch()
    }

    sendChat = function (text: string): Observable<[any]> {
        return this.chat.store({
            text: text,
            datetime: new Date(),
            url: this.avatar_url,
        })
    }
}
