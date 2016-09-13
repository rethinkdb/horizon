'use strict';

const Rule = require('./rule');

const assert = require('assert');

const Joi = require('joi');

const {r, logger, Reliable, ReliableChangefeed} = require('@horizon/server');

// We can be desynced from the database for up to 5 seconds before we
// start rejecting queries.
const staleMs = 5000;

// auth plugins should set 'request.context.user'
// token/anonymous: this should be the user id
// unauthenticated: this should be null, and will use the default rules

// RSI: do something drastic when a user's account is deleted

function addToMapSet(map, name, el) {
  let set = map.get(name);
  if (!set) {
    set = new Set();
    map.set(name, set);
  }
  set.add(el);
}

function addToMapSetUnique(map, name, el) {
  let set = map.get(name);
  if (!set) {
    set = new Set();
    map.set(name, set);
  }
  assert(!set.has(el), `addToMapSet: ${name} already has ${el}`);
  set.add(el);
}

// Returns whether or not it deleted an empty set from the map.
function delFromMapSet(map, name, el) {
  const set = map.get(name);
  assert(set, `delFromMapSet: ${name} not in map`);
  assert(set.has(el), `delFromMapSet: ${name} does not have ${el}`);
  set.delete(el);
  if (set.size === 0) {
    map.delete(name);
    return true;
  }
  return false;
}

function getMapSet(map, name) {
  return map.get(name) || new Set();
}

const emptyRulesetSymbol = Symbol();
class RuleMap {
  constructor() {
    this.groupToRulenames = new Map();
    this.rulenameToRule = new Map();
    this.groupToUsers = new Map();

    this.userToRulenames = new Map(); // computed
    this.userToRulesetSymbol = new Map(); // updated when user's rules change
  }

  getUserRulesetSymbol(user) {
    return this.userToRulesetSymbol.get(user) || emptyRulesetSymbol;
  }

  forEachUserRule(user, cb) {
    const ruleset = this.userToRulenames.get(user);

    if (ruleset) {
      ruleset.forEach((rn) => {
        const rule = this.rulenameToRule.get(rn);
        assert(rule);
        cb(rule);
      });
    }
  }

  addUserGroup(user, group) {
    addToMapSet(this.groupToUsers, group, user);
    getMapSet(this.groupToRulenames, group).forEach((rn) => {
      addToMapSet(this.userToRulenames, user, rn);
    });
    this.userToRulesetSymbol.set(user, Symbol());
  }

  delUserGroup(user, group) {
    delFromMapSet(this.groupToUsers, group, user);
    let clearRuleset = false;
    getMapSet(this.groupToRulenames, group).forEach((rn) => {
      const deletedEmptySet = delFromMapSet(this.userToRulenames, user, rn);
      if (deletedEmptySet) { clearRuleset = true; }
    });
    if (clearRuleset) {
      this.userToRulesetSymbol.delete(user);
    } else {
      this.userToRulesetSymbol.set(user, Symbol());
    }
  }

  addGroupRule(group, ruleName, rule) {
    this.rulenameToRule.set(ruleName, rule);
    addToMapSetUnique(this.groupToRulenames, group, ruleName);
    getMapSet(this.groupToUsers, group).forEach((user) => {
      addToMapSetUnique(this.userToRulenames, user, ruleName);
      this.userToRulesetSymbol.set(user, Symbol());
    });
  }

  delGroupRule(group, ruleName) {
    assert(this.rulenameToRule.has(ruleName), `unrecognized ${group} rule ${ruleName}`);
    this.rulenameToRule.delete(ruleName);
    delFromMapSet(this.groupToRulenames, group, ruleName);
    getMapSet(this.groupToUsers, group).forEach((user) => {
      const deletedEmptySet = delFromMapSet(this.userToRulenames, user, ruleName);
      if (deletedEmptySet) {
        this.userToRulesetSymbol.delete(user);
      } else {
        this.userToRulesetSymbol.set(user, Symbol());
      }
    });
  }

  // This should be equivalent to calling `delGroupRule` for all rules.
  delAllGroupRules() {
    this.groupToRulenames.clear();
    this.rulenameToRule.clear();
    this.userToRulenames.clear();
    this.userToRulesetSymbol.clear();
  }
}

class UserCache {
  constructor(context, options) {
    this.timeout = options.cacheTimeout;

    this.ruleMap = new RuleMap();
    this.userCfeeds = new Map();
    this.newUserCfeed = (userId) => {
      let oldGroups = new Set();
      const cfeed = new ReliableChangefeed(
        r.table(options.usersTable).get(userId).changes({includeInitial: true}),
        context.horizon.rdbConnection,
        {
          onUnready: () => {
            cfeed.unreadyAt = new Date();
          },
          onChange: (change) => {
            cfeed.userRow = change.new_val || null;
            cfeed.unreadyAt = null; // We're ready on every change.
            const newGroups = new Set((change.new_val && change.new_val.groups) || []);
            oldGroups.forEach((g) => {
              if (!newGroups.has(g)) {
                this.ruleMap.delUserGroup(userId, g);
              }
            });
            newGroups.forEach((g) => {
              if (!oldGroups.has(g)) {
                this.ruleMap.addUserGroup(userId, g);
              }
            });
            oldGroups = newGroups;
          },
        }
      );
      if (cfeed.unreadyAt === undefined) {
        cfeed.unreadyAt = new Date(0); // epoch
      }
      cfeed.refcount = 0;
      cfeed.userRow = null;
      return cfeed;
    };

    // Set up a dummy user cfeed for unauthenticated users (null id)
    this.ruleMap.addUserGroup(null, 'default');
    this.userCfeeds.set(null, Object.assign(new Reliable(), {
      refcount: 1,
      unreadyAt: null,
      userRow: {id: null, groups: ['default']},
      readyPromise: Promise.resolve()
    }));

    this.queuedGroups = new Map();
    this.groupsUnreadyAt = new Date(0); // epoch
    this.groupCfeed = new ReliableChangefeed(
      r.table(options.groupsTable).changes({includeInitial: true}),
      context.horizon.rdbConnection,
      {
        onReady: () => {
          this.ruleMap.delAllGroupRules();
          this.queuedGroups.forEach(
            (rules, groupId) => {
              for (const name in rules) {
                const ruleId = JSON.stringify([groupId, name]);
                this.ruleMap.addGroupRule(groupId, ruleId, new Rule(rules[name]));
              }
            });
          this.queuedGroups.clear();

          assert(this.groupsUnreadyAt !== null);
          this.groupsUnreadyAt = null;
        },
        onUnready: () => {
          assert(this.queuedGroups.size === 0);
          assert(this.groupsUnreadyAt === null);
          this.groupsUnreadyAt = new Date();
        },
        onChange: (change) => {
          const id = change.old_val ? change.old_val.id : change.new_val.id;
          if (this.groupsUnreadyAt !== null) {
            if (change.new_val) {
              this.queuedGroups.set(id, change.new_val.rules);
            } else {
              this.queuedGroups.delete(id);
            }
          } else {
            const oldRules = change.old_val ? change.old_val.rules : {};
            const newRules = change.new_val ? change.new_val.rules : {};
            for (const k in oldRules) {
              if (newRules[k] &&
                  oldRules[k].template === newRules[k].template &&
                  oldRules[k].validator === newRules[k].validator) {
                delete newRules[k];
              } else {
                this.ruleMap.delGroupRule(id, k);
              }
            }
            for (const k in newRules) {
              try {
                this.ruleMap.addGroupRule(id, k, new Rule(newRules[k]));
              } catch (err) {
                logger.error(`Failed to evaluate rule ${id}.${k}: ${err}`);
                logger.debug(`Contents: ${JSON.stringify(newRules[k])}`);
                logger.debug(`Stack: ${err.stack}`);
              }
            }
          }
        },
      }
    );
  }

  close() {
    let promises = [this.groupCfeed.close()];
    this.userCfeeds.forEach((feed) => {
      promises.push(feed.close()); 
    });
    return Promise.all(promises);
  }

  subscribe(userId) {
    let cfeed = this.userCfeeds.get(userId);
    if (!cfeed) {
      this.userCfeeds.set(userId, cfeed = this.newUserCfeed(userId));
      // RSI: move this into newUserCfeed?
      cfeed.readyPromise = new Promise((resolve, reject) => {
        cfeed.subscribe({onReady: () => resolve()});
        setTimeout(() => reject(new Error('timed out')), this.timeout);
      });
    }
    cfeed.refcount += 1;

    return {
      getValidatePromise: (req) =>
        cfeed.readyPromise.then(() => {
          let rulesetSymbol = Symbol();
          let ruleset = [];
          let needsValidation = true;
          return () => {
            const userStale = cfeed.unreadyAt;
            const groupsStale = this.groupsUnreadyAt;
            if (userStale || groupsStale) {
              let staleSince = null;
              const curTime = Number(new Date());
              if (userStale && (curTime - Number(userStale) > this.timeout)) {
                staleSince = userStale;
              }
              if (groupsStale && (curTime - Number(groupsStale) > this.timeout)) {
                if (!staleSince || Number(groupsStale) < Number(staleSince)) {
                  staleSince = groupsStale;
                }
              }
              if (staleSince) {
                throw new Error(`permissions desynced since ${staleSince}`);
              }
            }
            const curSymbol = this.ruleMap.getUserRulesetSymbol(userId);
            if (curSymbol !== rulesetSymbol) {
              rulesetSymbol = curSymbol;
              ruleset = [];
              needsValidation = true;
              this.ruleMap.forEachUserRule(userId, (rule) => {
                if (rule.isMatch(req.options)) {
                  if (!rule.validator) {
                    needsValidation = false;
                  }
                  ruleset.push(rule);
                }
              });
            }
            if (!needsValidation) {
              return null;
            }

            // The validator function returns the matching rule if allowed, or undefined
            return (...args) => {
              try {
                for (const rule of ruleset) {
                  if (rule.isValid(cfeed.userRow, ...args)) {
                    return rule;
                  }
                }
              } catch (err) {
                // We don't want to pass the error message on to the user because
                // it might leak information about the data.
                logger.error(`Exception in validator function: ${err.stack}`);
              }
            };
          };
        }),
      close: () => {
        cfeed.refcount -= 1;
        if (cfeed.refcount === 0) {
          this.userCfeeds.delete(userId);
          return cfeed.close();
        }
      },
    };
  }
}

const optionsSchema = Joi.object().keys({
  name: Joi.any().required(),
  usersTable: Joi.string().default('users'),
  groupsTable: Joi.string().default('hz_groups'),
  cacheTimeout: Joi.number().positive().integer().default(5000),
}).unknown(true);

module.exports = {
  name: 'hz_permissions',

  activate(context, rawOptions, onReady, onUnready) {
    const options = Joi.attempt(rawOptions, optionsSchema);
    const userSub = Symbol(`${options.name}_userSub`);
    
    // Save things in the context that we will need at deactivation
    const userCache = new UserCache(context, options);
    context[options.name] = {
      userCache,
      authCb: (clientCtx) => {
        clientCtx[userSub] = userCache.subscribe(clientCtx.user.id);
      },
      disconnectCb: (clientCtx) => {
        if (clientCtx[userSub]) {
          clientCtx[userSub].close();
        }
      },
    };

    context.horizon.events.on('auth', context[options.name].authCb);
    context.horizon.events.on('disconnect', context[options.name].disconnectCb);

    return new Promise((resolve, reject) => {
      userCache.groupCfeed.subscribe({onUnready, onReady: () => {
        resolve({
          methods: {
            hz_permissions: {
              type: 'prereq',
              handler: (req, res, next) => {
                if (!req.clientCtx[userSub]) {
                  next(new Error('Client connection is not authenticated.'));
                } else {
                  // RSI: test timeout behavior - anecdotal evidence points to 'broken'
                  req.clientCtx[userSub].getValidatePromise(req).then((validate) => {
                    req.setParameter(validate);
                    next();
                  }).catch(next);
                }
              },
            },
          },
        });
        onReady();
      }});
    });

  },

  deactivate(context, options) {
    const pluginData = context[options.name];
    delete context[options.name];
    if (pluginData.authCb) {
      context.horizon.events.removeListener('auth', pluginData.authCb);
    }
    if (pluginData.disconnectCb) {
      context.horizon.events.removeListener('disconnect', pluginData.disconnectCb);
    }
    if (pluginData.userCache) {
      pluginData.userCache.close();
    }
  },
};
