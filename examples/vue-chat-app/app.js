const F = require("Fusion");
const Fusion = new F.Fusion({mock:true});
var messages = Fusion("messages");

const app = new Vue({
  el: '#chat',
  data: {
    newMessage: "",
    id: 1,
    messages: this.messagesPopulate(),
    users: this.usersPopulate()
  },
  methods: {
    messagesPopulate: function(){
      let allMessages = [];
      messages.value()
        .then(result => allMessages.unshift(result))
        .finally(return allMessages);
    },
    usersPopulate: function(){
      let allUsers = [];
      users.value()
        .then(result => allUsers.unshift(result))
        .finally(return allUsers);
    },
    addMessage: function(){
      var text = this.newMessage.trim();
      if (text){
        this.id++;
        messages.store({
          text: text,
          id: this.id,
          author: author_id
        });
        this.newMessage = "";
      }
    },
    messageAddChange: function(change){
      this.messages.unshift(change);
    },
    messageDeleteChange: function(change){
      this.messages.forEach(function(message, index){
        if(change.id === message.id){
          this.messages.splice(index, 1);
        }
      });
    },
    userPresenceChange: function(change){
        for (user in this.users){
          if (change.id == user.id){
            user.presence = change.presence;
          }
        }
    },
    startSubscriptions: function(){
      users
        .on("change", userPresenceChange);
      messages
        .on("added", this.messageAddChange)
        .on("deleted", this.messageDeleteChange);
    }
  }
});

app.startSubscriptions();
