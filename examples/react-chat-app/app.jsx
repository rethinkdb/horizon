/*jshint quotmark:false */
/*jshint white:false */
/*jshint trailing:false */
/*jshint newcap:false */

var app = app || {};

(function(){
  'use strict';

  //Setup RethinkDB
	const Fusion = require("Fusion");
	const fusion = new Fusion("localhost:8181", {
		secure: true
	});

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
      return {
        fusion: fusion("react_messages"),
        authorId: new Date().getMilliseconds()
      };
    },

    getInitialState: function(){
      return {
        disabled: true,
        messages:[]
      };
    },

    componentDidMount: function(){
      this.props.fusion.value().then((function(result){
        this.setState({
          messages: result
        });
      }).bind(this));
      this.setState({
        disabled: false,
      });
      this.subscribe();
    },

    save: function(message){
      console.log("SUBMIT");
      this.props.fusion.store({
        id: this.uuid(),
        text: message,
        authorId: this.props.authorId
      });
    },

    subscribe: function(){
      this.props.fusion.subscribe()
        .on("added", (function(added){
          console.log("ADDED");
          console.log(added);
          this.setState({
            messages: this.state.messages.concat(added)
          });
          // this.props.messages = this.props.messages.concat(added);
        }).bind(this));
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
      let messages = this.props.messages.map(function(message){
        return <app.ChatMessage message={message} key={message.id}/>;
      }, this);

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
      return {
        ENTER_KEY: 13,
        ESCAPE_KEY: 27
      };
    },

    getInitialState: function(){
      return {
        inputText:""
      }
    },

    handleKeyDown: function(event){
      if(event.keyCode === this.props.ENTER_KEY){
        console.log("ENTER KEY DETECTED")
        const val = this.state.inputText.trim();
        if (val){
          this.props.onSave(val);
          this.setState({inputText: ""});
        }
      }
    },

    handleChange: function(event){
      console.log("HANDLINGCHANGE - ChatInput")
      this.setState(
        {inputText: event.target.value}
      );
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

  ReactDOM.render(
    <app.ChatApp/>,
    document.getElementById('app')
  );
})();
