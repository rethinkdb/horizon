/*jshint quotmark:false */
/*jshint white:false */
/*jshint trailing:false */
/*jshint newcap:false */

var app = app || {};

(function(){
  'use strict';

  //Setup Horizon connection
  const horizon = Horizon();

  app.ChatApp = React.createClass({

    uuid: function () {
      /*jshint bitwise:false */
      var i, random;
      var uuid = '';

      for (i = 0; i < 32; i++) {
        random = Math.random() * 16 | 0;
        if (i === 8 || i === 12 || i === 16 || i === 20) {
          uuid += '-';
        }
        uuid += (i === 12 ? 4 : (i === 16 ? (random & 3 | 8) : random))
          .toString(16);
      }
      return uuid;
    },

    getDefaultProps: function(){

      const time = new Date().getMilliseconds();

      // Precache the avatar image so it immediately shows on input enter.
      const image = new Image();
      image.src = `http://api.adorable.io/avatars/50/${time}.png`;

      return {
        horizon: horizon("react_messages"),
        avatarUrl: image.src,
        authorId: time
      };
    },

    getInitialState: function(){
      return {
        disabled: true,
        messages: []
      };
    },

    componentDidMount: function(){
      // As soon as this component is mounted, enable the input
      this.setState({
        disabled: false,
      });

      // Initiate the changefeeds
      this.subscribe();
    },

    save: function(message){
      //Save method for handling messages
      this.props.horizon.store({
        id: this.uuid(),
        text: message,
        authorId: this.props.authorId,
        datetime: new Date()
      }).subscribe();
    },

    subscribe: function(){
      this.props.horizon
        .order("datetime", "descending")
        .limit(8)
        .watch()
        .subscribe(messages => {
            this.setState({ messages: messages })
        })
    },

    render: function(){
      return (
        <div>
        <app.ChatList messages={this.state.messages}/>
        <app.ChatInput
          disabled={this.props.disabled}
          onSave={this.save}
          />
        </div>
      );
    },
  });

  app.ChatList = React.createClass({
    render: function(){

      // Construct list of ChatMessages
      const messages = this.props.messages.map(function(message){
        return <app.ChatMessage message={message} key={message.id}/>;
      }, this);

      // Return assembled ChatList of Messages
      return (
        <div className="row">
          <ul>
          {messages}
          </ul>
        </div>
      );
    }
  });

  app.ChatMessage = React.createClass({
    render: function(){
      return (
        <li className="message">
          <img height="50px" width="50px" src={`http://api.adorable.io/avatars/50/${this.props.message.authorId}.png`}/>
          <span className="text">
            {this.props.message.text}
          </span>
        </li>
      );
    }
  });

  app.ChatInput = React.createClass({
    getDefaultProps: function(){
      // Set default props for enter key
      return {
        ENTER_KEY: 13
      };
    },

    getInitialState: function(){
      // Initial state of the inputText is blank ""
      return {
        inputText: ""
      }
    },

    handleKeyDown: function(event){
      // Checking if enter key has been pressed to handle contents of
      //  input field value.
      if(event.keyCode === this.props.ENTER_KEY){
        const val = this.state.inputText.trim();
        if (val){
          // Save the value
          this.props.onSave(val);
          // Empty the input value
          this.setState({inputText: ""});
        }
      }
    },

    handleChange: function(event){
      // Every time the value of the input field changes we update the state
      //  object to have the value of the input field.
      this.setState({
        inputText: event.target.value
      });
    },

    render: function(){
      return (
        <div id="input" className="row">
          <input
            className="u-full-width"
            value={this.state.inputText}
            disabled={this.props.disabled}
            onChange={this.handleChange}
            onKeyDown={this.handleKeyDown}
            autoFocus={true}
            />
        </div>
      );
    }
  });

  // Render this monster.
  ReactDOM.render(
    <app.ChatApp/>,
    document.getElementById('app')
  );
})();
