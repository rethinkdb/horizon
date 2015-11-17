const Fusion = require("Fusion");
const fusion = new Fusion("localhost:8181");
const chat = fusion("chat");
const app = new Vue({

  el: '#app',
  data: {
    newMessage: "",
    avatar_url: `http://api.adorable.io/avatars/50/${new Date().getMilliseconds()}.png`,
    messages: [],
  },

  computed: {
    limitedMessages: function(){
      this.messages.sort(function(a,b){
        if (a.datetime > b.datetime){
          return 1;
        } else if (a.datetime == b.datetime){
          return 0;
        } else {
          return -1
        }
      });

      return this.messages.slice(Math.max(this.messages.length - 6, 1))
    }


  },

  methods: {
    addMessage: function(){
      var text = this.newMessage.trim();
      if (text){
        chat.store({
          text: text,
          id: this.avatar_url,
          datetime: new Date().toString(),
        });
        this.newMessage = "";
      }
    },

    addedChange: function(newDoc){
      //Parse string as proper Date Object
      newDoc.datetime = new Date(Date.parse(newDoc.datetime));
      this.messages.push(newDoc);
    },

    fetchAll: function(){
      chat.value().then((result) => {
        result.forEach((doc) => {
          doc.datetime = new Date(Date.parse(doc.datetime));
        })

        this.messages = this.messages.concat(result);
      });
    }
  }
});
app.fetchAll();
chat.subscribe().on("added", app.addedChange);
