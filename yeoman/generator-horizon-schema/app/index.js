'use strict';
const chalk = require('chalk');
const yeoman = require('yeoman-generator');
const yosay = require('yosay');
const prompt = require('prompt');
const fs = require('fs');

let _group,
  _name,
  _query,
  queryName,
  mod1,
  mod2,
  _rules,
  _collection,
  collName,
  collItem;

let collItems = [];
let store = [];

const schema = {
  properties: {
    name: {
      pattern: /^[a-zA-Z]+$/,
      message: 'Name must be only letters',
      required: true,
      description: '',
    },
  },
};
const findAll = {
  properties: {
    find: {
      pattern: /^(any|userId())$/,
      message: 'only any or userId are acceptable',
      required: true,
    },
  },
};
const answerSchema = {
  properties: {
    answer: {
      pattern: /^(?:yes|no|y|n)$/i,
      message: 'yes or no only',
      required: false,
    },
  },
};
const querySchema = {
  properties: {
    items: {
      pattern: /^\w+/,
      message: 'Query is not valid',
      required: true,
    },
  },
};

const queryQuestion = {
  properties: {
    answer: {
      pattern: /(watch|fetch|anyWrite|findAll|store)?/,
      message: 'not a valid option',
      required: true,
    },
  },
};

module.exports = yeoman.generators.Base.extend({
  prompting: function() {
        // yeoman greeting
    this.log(yosay(
            `Yo! I\'m here to help create your
             ${chalk.bold.yellow('Horizon')} Schema.`
        ));
    console.log('Any operation on a Horizon collection is disallowed ' +
      'by default, unless there is a rule that allows the operation.\n\n' +
      'A whitelist rule has three properties that define which operations' +
      ' it covers:\n\n* A user group\n' +
      '* A query template describing the type of operation\n* An optional' +
      ' validator function' +
      ' written in JavaScript that can be used to check the contents of' +
      ' the accessed\n documents, or to implement more' +
      ' complex permission checks\n\nA rule has the layout of' +
      ' :\n[groups.GROUP_NAME.rules.RULE_NAME]\ntemplate =' +
      ' "QUERY_TEMPLATE"' +
      '\n# Optional:\nvalidator = "VALIDATOR_FUNCTION"\n'
    );
  },
  writing: {
    app: function() {
      prompt.message = '';
      testForSchemaFile();
      function testForSchemaFile() {
        fs.readFile('schema.toml', 'utf8', function(err, data) {
          if (err) {
            fs.writeFile('schema.toml', '[collections]\n\n#\n[rules]\n\n',
              function(err1) {
                if (err1) {
                  console.log('failed to create a schema.toml file for you' +
                  ' and one doesn\'t exist already');
                  process.exit();
                } else {
                  fs.readFile('schema.toml', 'utf8', function(err2, input1) {
                    if (err2) {
                      console.log('failed to read schema');
                    } else {
                      readRules(input1);
                    }
                  });
                }
              });
          } else {
            readRules(data);
          }
        });
      }
      function readRules(data) {
        if (data) {
          store = data.split('#');
          _collection = store[0];
          _rules = store[1];
        }
        addColl();
      }
      function addColl() {
        console.log('Would you like to add a collection?');
        prompt.start();
        prompt.get(answerSchema, function(err, result) {
          if (err) { return onErr(err); }
          const ans = result.answer;
          if (ans === 'no' || ans === 'No' || ans === 'NO' || ans === 'n' ||
            ans === 'N') {
            addRule();
          } else {
            collectionName();
          }
        });
      }
      function collectionName() {
        console.log('Collection name?');
        prompt.start();
        prompt.get(schema, function(err, result) {
          if (err) { return onErr(err); }
          collName = result.name;
          collectionItem();
        });
      }
      function collectionItem() {
        console.log('Name of your collection\'s item?');
        prompt.start();
        prompt.get(schema, function(err, result) {
          if (err) { return onErr(err); }
          collItem = result.name;
          const lengthy = collItems.length;
          collItems[lengthy] = collItem;
          addCollItem();
        });
      }
      function addCollItem() {
        console.log('Would you like to add another item to the collection?');
        prompt.start();
        prompt.get(answerSchema, function(err, result) {
          if (err) { return onErr(err); }
          const ans = result.answer;
          if (ans === 'no' || ans === 'No' || ans === 'NO' || ans === 'n' ||
            ans === 'N') {
            collectionMaker();
          } else {
            collectionItem();
          }
        });
      }
      function collectionMaker() {
        collItem = `"${collItems[0]}"`;
        for (let i = 1; i < collItems.length; i++) {
          collItem = `${collItem} + ,\n\" + ${collItems[i]} + \"`;
        }
        _collection = `${_collection} [collections.${collName}]\nindexes =
         [\n${collItem}\n]\n\n`;
        collItem = '';
        collItems = [];
        addAnotherColl();
      }
      function addAnotherColl() {
        console.log('Would you like to add another collection?');
        prompt.start();
        prompt.get(answerSchema, function(err, result) {
          if (err) { return onErr(err); }
          const ans = result.answer;
          if (ans === 'no' || ans === 'No' || ans === 'NO' || ans === 'n' ||
            ans === 'N') {
            addRule();
          } else {
            collectionName();
          }
        });
      }
      function addRule() {
        console.log('Would you like to add a rule?');
        prompt.start();
        prompt.get(answerSchema, function(err, result) {
          if (err) { return onErr(err); }
          const ans = result.answer;
          if (ans === 'no' || ans === 'No' || ans === 'NO' || ans === 'n' ||
            ans === 'N') {
            print(_collection, _rules);
          } else {
            nameGroup();
          }
        });
      }
      function nameGroup() {
        console.log('What group do you want the rule to apply to?');
        prompt.start();
        prompt.get(schema, function(err, result) {
          if (err) { return onErr(err); }
          _group = result.name;
          nameRule();
        });
      }
      function nameRule() {
        console.log('What do you want the name of your rule to be?');
        prompt.start();
        prompt.get(schema, function(err, result) {
          if (err) { return onErr(err); }
          _name = result.name;
          queryInfo();
        });
      }
      function queryInfo() {
        console.log('What is the collection you wish to apply this rule to?');
        prompt.get(schema, function(err, result) {
          if (err) { return onErr(err); }
          queryName = result.name;
          queryMod();
        });
      }
      function queryMod() {
        mod1 = '';
        mod2 = '';
        console.log('What method would you like to use?\n' +
          'options are: watch, fetch, anyWrite, findAll, store or none');
        prompt.start();
        prompt.get(queryQuestion, function(err, result) {
          if (err) { return onErr(err); }
          mod1 = result.answer;
          switch (mod1) {
          case 'watch':
            builder1();
            break;
          case 'fetch':
            builder1();
            break;
          case 'anyWrite':
            builder1();
            break;
          case 'findAll':
            console.log('Do you want to use any or userId?');
            prompt.start();
            prompt.get(findAll, function(err1, result1) {
              if (err) { return onErr(err1); }
              mod2 = result1.find;
              mod2 = `. ${mod1} + ({type: ${mod2}()}).fetch()\"`;
              builder2(mod2);
            });
            break;
          case 'store':
            console.log('Add each element you want to store ' +
              'from this collection separated by a comma');
            prompt.start();
            prompt.get(querySchema, function(err2, result2) {
              if (err) { return onErr(err2); }
              mod2 = result2.items;
              const arr = mod2.split(',');
              let out = `{${arr[0]}: any()`;
              for (let i = 1; i < arr.length; i++) {
                out += `, ${arr[i]}: any()`;
              }
              out += '}';
              const mods = `.${mod1}(${out})\"`;
              builder2(mods);
            });
            break;
          case 'none':
          case '':
            builder1();
            break;
          }
        });
      }
      // builder for query with one modifier
      function builder1() {
        if (mod1) {
          _query = `\"collection(\'${queryName}\').${mod1}()\"`;
        } else {
          _query = `\"collection(\'${queryName}\')\"`;
        }
        addValidator();
      }
      // builder for query with more than one modifier
      function builder2(inputs) {
        _query = `\"collection(\'${queryName}\')${inputs}`;
        addValidator();
      }
      function addValidator() {
        console.log('Would you like to add a default validator?');
        prompt.start();
        prompt.get(answerSchema, function(err, result) {
          if (err) { return onErr(err); }
          const ans = result.answer;
          if (ans === 'no' || ans === 'No' || ans === 'NO' || ans === 'n' ||
            ans === 'N') {
            rule();
          } else {
            ruleExtra();
          }
        });
      }
      function rule() {
        const ru = `[groups.${_group}.rules.${_name}] \n
        template = ${_query}\n\n`;
        rules(ru);
      }
      function ruleExtra() {
        const rul = `[groups.${_group}.rules.${_name}] \n
          template = ${_query}\nvalidator = \"\"\" (context, oldValue,
           newValue) => { return newValue.length > 1; } \"\"\"\n\n`;
        rules(rul);
      }
      function rules(rulePro) {
        if (_rules) {
          _rules += rulePro;
        } else {
          _rules = rulePro;
        }
        console.log('Would you like to make another rule?(y/N)');
        prompt.start();
        prompt.get([ 'answer' ], function(err, result) {
          if (err) { return onErr(err); }

          if (result.answer === 'y' || result.answer === 'Y') {
            nameGroup();
          } else if (result.answer === 'n' || result.answer === 'N' ||
            result.answer === '') {
            print(_collection, _rules);
          } else {
            rules('');
          }
        });
      }
      function print(collection, words) {
        fs.writeFile('schema.toml', `${collection}#${words}`, function(err) {
          if (err) {
            return console.log(err);
          }
          console.log('Saved Rules');
        });
      }
      function onErr(err) {
        console.log(err);
        process.exit();
      }
    },
  },
});