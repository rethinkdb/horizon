System.register([], function(exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    var ChatService;
    return {
        setters:[],
        execute: function() {
            ChatService = (function () {
                function ChatService() {
                    this.horizon = Horizon();
                    this.chat = this.horizon('chat');
                    this.avatar_url = "http://api.adorable.io/avatars/50/" + new Date().getMilliseconds() + ".png";
                    this.getChats = function () {
                        return this.chat
                            .order('datetime', 'descending')
                            .limit(8)
                            .watch();
                    };
                    this.sendChat = function (text) {
                        return this.chat.store({
                            text: text,
                            datetime: new Date(),
                            url: this.avatar_url,
                        });
                    };
                }
                return ChatService;
            }());
            exports_1("ChatService", ChatService);
        }
    }
});
//# sourceMappingURL=chat.service.js.map