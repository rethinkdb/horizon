'use strict';

const Rule = require('./rule');

const assert = require('assert');

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
  // RSI: This might not always be an error.
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
    this.userToRulenames.forEach((rn) => {
      const rule = this.rulenameToRule.get(rn);
      assert(rule);
      cb(rule);
    });
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
    addToMapSet(this.groupToRulenames, group, ruleName);
    getMapSet(this.groupToUsers, group).forEach((user) => {
      addToMapSet(this.userToRulenames, user, ruleName);
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
  constructor(config, ctx) {
    const r = ctx.r;

    this.ctx = ctx;
    this.timeout = config.cacheTimeout;

    this.ruleMap = new RuleMap();

    this.userCfeeds = new Map();
    this.newUserCfeed = (userId) => {
      let oldGroups = new Set();
      const cfeed = new ctx.ReliableChangefeed(
        r.table(config.usersTable).get(userId).changes({includeInitial: true}),
        ctx.reliableConn,
        {
          onUnready: () => {
            cfeed.unreadyAt = new Date();
          },
          onChange: (change) => {
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
      return cfeed;
    };

    this.queuedGroups = new Map();
    this.groupsUnreadyAt = new Date(0); // epoch
    this.groupCfeed = new ctx.ReliableChangefeed(
      r.table(config.groupsTable).changes({includeInitial: true}),
      ctx.reliableConn,
      {
        onReady: () => {
          this.ruleMap.delAllGroupRules();
          this.queuedGroups.forEach(
            (rules, groupId) => rules.forEach(
              (rule) => this.ruleMap.addGroupRule(
                groupId, JSON.stringify([groupId, rule.name]), new Rule(rule))));
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
            this.queuedGroups.set(id, change.rules);
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
              this.ruleMap.addGroupRule(id, k, new Rule(newRules[k]));
            }
          }
        },
      }
    );
  }

  subscribe(userId) {
    let cfeed = this.userCfeeds.get(userId);
    if (!cfeed) {
      this.userCfeeds.set(userId, cfeed = this.newUserCfeed());
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
              if (userStale && (curTime - Number(userStale) > staleMs)) {
                staleSince = userStale;
              }
              if (groupsStale && (curTime - Number(groupsStale) > staleMs)) {
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
            return (...args) => {
              try {
                for (const rule of ruleset) {
                  if (rule.is_valid(...args)) {
                    return rule;
                  }
                }
              } catch (err) {
                // We don't want to pass the error message on to the user because
                // it might leak information about the data.
                this.ctx.logger.error(`Exception in validator function: ${err.stack}`);
                throw new Error('Validation error');
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

// RSI: remove the extra level of function calling.
module.exports = (config) => {
  const name = config.name || 'permissions';
  const userCache = Symbol(`${name}_userCache`);
  const userSub = Symbol(`${name}_userSub`);
  return {
    name,

    activate(ctx) {
      ctx.logger.info('Activating plugins module.');
      ctx[userCache] = new UserCache(config, ctx);
      return {
        methods: {
          hz_permissions: {
            type: 'preReq',
            handler: (req, res, next) => {
              if (!req.clientCtx[userSub]) {
                next(new Error('client connection not authenticated'));
              } else {
                req.clientCtx[userSub].getValidatePromise(req).then((validate) => {
                  req.validate = validate;
                  next();
                }).catch(next);
              }
            },
          },
        },
        onClientEvent: {
          auth: (clientCtx) => {
            clientCtx[userSub] = ctx[userCache].subscribe(clientCtx.user.id);
          },
          disconnect: (clientCtx) => {
            if (clientCtx[userSub]) {
              clientCtx[userSub].close();
            }
          },
        },
      };
    },

    deactivate(ctx) {
      if (ctx[userCache]) {
        ctx[userCache].close();
      }
    },
  };
};
