

new Vue({
  el: '#app',
  data: {
    newMessage: "",
    id: 1,
    messages: [{text: 'Hello Vue.js!', id: 1}],
  },

  computed: {

  },

  methods: {
    addMessage: function(){
      var text = this.newMessage.trim();
      if (text){
        this.id++;
        this.messages.push({
          text: text,
          id: this.id
        });
        this.newMessage = "";
      }
    }
  }


})
