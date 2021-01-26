import {Component} from '@angular/core';
import {ChatComponent} from './components/chat/chat.component';
@Component({
    selector: "my-app",
    template: "<chat></chat>",
    directives: [ChatComponent] 
})
export class AppComponent {}
