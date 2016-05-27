<chat>
  <div class="container">
  <div class="row messages">
      <ul>
        <li each={messages.slice().reverse().slice(-8)} class="message">
          <img height="50px" width="50px" src={ url }>
          <span class="text">
            { text }
          </span>

          <span class="datetime u-pull-right">
            { datetime.toTimeString() }
          </span>
        </li>
      </ul>
    </div>

    <div class="input row">
      <form onsubmit={ saveMessage }>
        <input autofocus=true name="input" class="u-full-width"> </input>
      </form>
    </div>
  </div>

  <script>
    horizon = Horizon({authType: "unauthenticated"});
    this.messages = [];
    this.db = horizon("riotjs_chat");

    this.avatar = new Image()
    this.avatar.src = "http://api.adorable.io/avatars/50/" + new Date().getTime() + ".png";

    saveMessage(e){
      this.db.store({
          text: this.input.value,
          datetime: new Date(),
          url: this.avatar.src,
      });
      this.input.value = "";
    }

    // Setup changefeed
    this.db.order("datetime", "descending")
        .limit(8)
        .watch()
        .subscribe(messages => {
          this.messages = messages;
          this.update();
        })

    </script>

</chat>
