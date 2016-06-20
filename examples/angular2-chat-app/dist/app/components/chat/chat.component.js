System.register(['@angular/core', './chat.service'], function(exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
        var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
        if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
        else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
        return c > 3 && r && Object.defineProperty(target, key, r), r;
    };
    var __metadata = (this && this.__metadata) || function (k, v) {
        if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
    };
    var core_1, chat_service_1;
    var ChatComponent;
    return {
        setters:[
            function (core_1_1) {
                core_1 = core_1_1;
            },
            function (chat_service_1_1) {
                chat_service_1 = chat_service_1_1;
            }],
        execute: function() {
            ChatComponent = (function () {
                function ChatComponent(_chatService) {
                    this._chatService = _chatService;
                    this.newMessage = '';
                    this.messages = [];
                    this.getChats = function () {
                        var _this = this;
                        this._chatService
                            .getChats()
                            .subscribe(function (newMessages) {
                            _this.messages = newMessages.slice();
                        });
                    };
                    this.addMessage = function (text) {
                        if (text) {
                            this._chatService
                                .sendChat(text)
                                .subscribe();
                            this.newMessage = '';
                        }
                    };
                }
                ChatComponent.prototype.ngOnInit = function () {
                    this.getChats();
                };
                ChatComponent = __decorate([
                    core_1.Component({
                        selector: '<chat></chat>',
                        styles: ["\n        ul {\n            list-style-type: none;\n            padding:0;\n        }\n       \n        .message {\n            height: 50px;\n            padding:5px;\n        }\n\n        .message img {\n            vertical-align:middle;\n        }\n        .message .text {\n            vertical-align:middle;\n            margin-left:5px;\n            font-size:20px;\n        }\n        .message .datetime {\n             color:darkgrey;\n             float:right;\n        }\n        form{\n           \n        }\n        input {\n            width: 90%;\n            height: 50px;\n            font-size: 20px;\n            float: left;\n            padding: 10px;\n        }\n        button{\n            width:10%;\n            height: 50px;\n        }\n   "],
                        template: "<h1>Messages</h1>\n    <form>\n        <input [(ngModel)]=\"newMessage\">\n        <button type=\"submit\" (click)=\"addMessage(newMessage)\">Send</button>\n    </form>\n    <ul>\n        <li *ngFor=\"let message of messages; let i = index\" class=\"message\">\n        <img height=\"50px\" width=\"50px\" src=\"{{message.url}}\" />\n        <span> {{message.text}} </span>\n        <span class=\"datetime u-pull-right\">\n            {{message.datetime}}\n          </span>\n        </li>\n    </ul>",
                        providers: [chat_service_1.ChatService]
                    }), 
                    __metadata('design:paramtypes', [chat_service_1.ChatService])
                ], ChatComponent);
                return ChatComponent;
            }());
            exports_1("ChatComponent", ChatComponent);
        }
    }
});
//# sourceMappingURL=chat.component.js.map