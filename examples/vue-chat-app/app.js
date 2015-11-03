const F = require("Fusion");
const Fusion = new F.Fusion({mock:true});
var messages = Fusion("messages");

const app = new Vue({
  el: '#chat',
  data: {
    newMessage: "",
    id: 1,
    messages: messages.value(),
    users: users.value()
  },
  methods: {
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
