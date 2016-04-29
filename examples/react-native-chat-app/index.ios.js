import React, {
  AppRegistry,
  Component,
  StyleSheet,
  Text,
  View,  
  Image,
  ListView,
  TextInput,
  Alert,
} from 'react-native';

import Horizon from '@horizon/client';

var horizon = Horizon({
  host: 'localhost:8181'
});

var app = app || {};

function  uuid() {
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
}

app.ChatApp = React.createClass({
  getDefaultProps: function(){
    const time = new Date().getMilliseconds();

    return {
      horizon: horizon("react_messages"),
      authorId: time
    };
  },

  getInitialState: function(){
    return {
      disabled: true,
      messages: [{text:"No Messages yet!"}]
    };
  },

  componentDidMount: function(){
    // As soon as this component is mounted, enable the input
    this.setState({
      disabled: false,
    });
    horizon.onConnected(function() {
      // Alert.alert('Horizon client connected');
      // this.state.horizon.store({
      //           text: "message",
      //           authorId: this.props.authorId,
      //           datetime: new Date()
      //         })

    }.bind(this));

    // Initiate the changefeeds
    this.subscribe();

    console.log("component did mount");
  },

  save: function(message){
    //Save method for handling messages
    this.props.horizon.store({
      id: uuid(),
      text: message,
      authorId: this.props.authorId,
      datetime: new Date()
    }).subscribe();
  },

  subscribe: function(){
     this.props.horizon
       .order("datetime", "descending")
       .limit(20)
       .watch()
       .subscribe(messages => {
         console.log("message updated ", messages.length);
         this.setState({ messages: messages })
       })
  },

  render: function() {
    return (
      <View style={styles.container}>
        <app.ChatList messages={this.state.messages}/>

        <app.ChatInput
          disabled={this.props.disabled}
          onSave={this.save}
        />
      </View>
    );
  }
});

app.ChatList = React.createClass({
  getInitialState: function() {
    return {
    };
  },

  render: function(){
    if (typeof this.ds === 'undefined') {
      this.ds = new ListView.DataSource({rowHasChanged: (r1, r2) => r1 !== r2});
    }
    
    var m = this.props.messages.map(x=>{return (x)})
    m.reverse();
    this.ds = this.ds.cloneWithRows(m);

    // Return assembled ChatList of Messages
    return (
      <ListView
        ref={ref => this.listView = ref}
        onLayout={event => {
          this.listViewHeight = event.nativeEvent.layout.height
        }}
        onContentSizeChange={() => {
          this.listView.scrollTo({y: this.listView.getMetrics().contentLength - this.listViewHeight})
        }}
        enableEmptySections={true}
        dataSource={this.ds}
        renderRow={this.row}
      />
    );
  },

  row: function(rowData){
    return (
      <View style={styles.messageRow}>
        <Image style={{width: 50, height: 50}} source={{uri:`http://api.adorable.io/avatars/50/${rowData.authorId}.png`}} />
        <Text style={styles.text}>{rowData.text}</Text>
      </View>
     );
  }
});


app.ChatInput = React.createClass({
  getInitialState: function(){
    // Initial state of the inputText is blank ""
    return {
      inputText: ""
    }
  },

  onSubmitEditing: function() {
    if (typeof this.props.onSave === "function") {
      this.props.onSave(this.state.inputText);
    } 
    this.setState({inputText:""});
  },

  render: function(){
    return (
      <TextInput  style={styles.input}
        onChangeText={(text) => this.setState({inputText:text})}
        blurOnSubmit={false}
        placeholder={"message"}
        enablesReturnKeyAutomatically={true}
        returnKeyType={"send"}
        onSubmitEditing={this.onSubmitEditing}
        value={this.state.inputText}
      />
    );
  }
});

const styles = StyleSheet.create({
  container: {
    marginTop:20,
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'stretch',
  },
  messageRow: {
    flex: 1,
    justifyContent: 'flex-start',

    marginBottom: 5,
    alignItems: 'center',
    flexDirection:"row",
    padding: 5,
    backgroundColor: '#EFEDEF',
  },
  text: {
    marginLeft:10,
    fontFamily: "Helvetica Neue",
    fontSize:17,
  },
  input: {
    height:60,
    borderColor: '#ccc', 
    borderWidth: 1,
    fontSize:30,
    padding:10,
    fontFamily: "Helvetica Neue",
  },
});

AppRegistry.registerComponent('ReactNativeChatApp', () => app.ChatApp);
