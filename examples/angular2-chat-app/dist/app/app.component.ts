import {Component} from 'angular2/core';
import {ChatComponent} from './components/chat/chat.component'

@Component({
    selector: 'my-app',
    template: '<chat></chat>',
    directives: [ChatComponent],
    styles:[`     chat{
            margin: auto;
            max-width: 800px;
            width:100%;
            display:block;
            
        }
        `]
})
export class AppComponent { }
