'use strict';

// We can be desynced from the database for up to 5 seconds before we
// start rejecting queries.
const staleLimit = 5000;

// auth plugins should set 'request.context.user'
// token/anonymous: this should be the user id
// unauthenticated: this should be null, and will use the default rules

addToMapSet(map, name, el) {
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
delFromMapSet(map, name, el) {
  let set = map.get(name);
  assert(set, `delFromMapSet: ${name} not in map`);
  assert(set.has(el), `delFromMapSet: ${name} does not have ${el}`);
  set.delete(el);
  if (set.size === 0) {
    map.delete(name);
    return true;
  }
  return false;
}

getMapSet(map, name) {
  return map.get(name) || new Set();
}

const emptyRulesetSymbol = Symbol();
class RuleMap {
  constructor() {
    this.groupToRulenames = new Map();
    this.RulenameToRule = new Map();
    this.groupToUsers = new Map();

    this.userToRulenames = new Map(); // computed
    this.userToRulesetSymbol = new Map(); // updated when user's rules change
  }

  getUserRulesetSymbol(user) {
    return this.userToRulesetSymbol.get(user) || emptyRulesetSymbol;
  }

  forEachUserRule(user, cb) {
    this.userToRulenames.forEach((rn) => {
      const rule = this.RulenameToRule.get(rn);
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
    this.RulenameToRule.set(ruleName, rule);
    addToMapSet(this.groupToRulenames, group, ruleName);
    getMapSet(this.groupToUsers, group).forEach((user) => {
      addToMapSet(this.userToRulenames, user, ruleName);
      this.userToRulesetSymbol.set(user, Symbol());
    });
  }

  delGroupRule(group, ruleName) {
    assert(rulenameToRule.has(ruleName), `unrecognized ${group} rule ${ruleName}`);
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
    this.RulenameToRule.clear();
    this.userToRulenames.clear();
    this.userToRulesetSymbol.clear();
  }
}

class UserCache {
  constructor(config, ctx) {
    this.timeout = config.cacheTimeout;

    this.ruleMap = new RuleMap();
    this.groupsUnreadyAt = new Date(0); // epoch

    this.userCfeeds = new Map();
    this.newUserCfeed = (userId) => {
      let oldGroups = new Set();
      const cfeed = new ReliableChangefeed(
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
      return cfeed;
    };

    this.groupCfeed = new ReliableChangefeed(
      r.table(config.groupsTable).changes({includeInitial: true}),
      ctx.reliableConn,
      {
        onReady: () => {
          this.ruleMap.delAllGroupRules(),
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
            queuedGroups.set(id, change.rules);
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
      this.userCfeeds.set(userId, cfeed = newUserCfeed());
      cfeed.readyPromise = new Promise((resolve, reject) => {
        cfeed.subscribe({onReady: () => resolve()});
        setTimeout(() => reject(new Error('timed out')), this.timeout)
      });
    }

    return {
      getValidatePromise: (req) => {
        return cfeed.readyPromise.then(() => {
          let rulesetSymbol = Symbol();
          let ruleset = [];
          return (...args) => {
            const userStale = cfeed.unreadyAt;
            const groupsStale = this.groupsUnreadyAt;
            if (userStale || groupsStale) {
              let staleSince = null
              const curTime = Number(new Date());
              if (userStale && (curTime - Number(userStale) > staleLimit)) {
                staleSince = userStale;
              }
              if (groupsStale && (curTime - Number(groupsStale) > staleLimit)) {
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
              this.ruleMap.forEachUserRule(userId, (rule) => {
                if (rule.isMatch(req.options)) {
                  ruleset.push(rule);
                }
              });
            }
            // RSI: pick up here, call validator functions.
          };
        });
      },
      close: () => {

      },
    };
  }
}

// RSI: remove the extra level of function calling.
module.exports = (config) => {
  const name = config.name || 'permissions',
  const userCache = Symbol(`${name}_userCache`);
  const userSub = Symbol(`${name}_userSub`);
  return {
    name,

    activate(ctx) {
      ctx.logger.info('Activating plugins module.');
      ctx[userCache] = new UserCache(config, ctx);
      return {
        methods: {
          'hz_permissions': {
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
}

module.exports = (config) => {
  class User {
    constructor(user_id, reliable_conn) {
      this.feed = r.table(config.user_table);
    }

    group_changed(group_name) {
      if (this.data && this.data.groups && this.data.groups.indexOf(group_name) !== -1) {
        this.active_rulesets.forEach((ruleset) => );
      }
    }

    add_request(req, res, next) {
      // Create a changefeed for the user unless it exists

      // Template-match the request options

      // Add a ruleset to request.context.rules
      const ruleset = new Ruleset();
      request.context.rules = ruleset;
      this.active_rulesets.add(ruleset);

      const cleanup = () => this.active_rulesets.delete(ruleset);

      // On changes to the rules in any of the user's groups, re-evaluate rules

      // On response completion, stop tracking the ruleset
      res.complete.then(cleanup).catch(cleanup);
    }
  }

  return {
    name: 'permissions',
    activate: (server) => {
      const reliable_conn = server.conn();
      const users = new Map();
      const groups = new Map();
      const ready = false;

      // TODO: need to save/close the subscription?
      reliable_conn.subscribe({
        onUnready: (reason) => {
          users.forEach((user) => user.close(reason));
          users.clear();
        },
      });

      // Set up a reliable changefeed on the 'groups' table to track rules by group name
      const groups_feed = new ReliableChangefeed(
        r.db(server.project_name)
          .table('hz_groups')
          .changes({squash: false, includeInitial: true, includeTypes: true}),
        reliable_conn,
        {
          onReady: () => {
            ready = true;
          },
          onUnready: () => {
            ready = false;
            groups.forEach((g) => g.close());
            groups.clear();
          },
          onChange: (change) => {
            switch(change.type) {
            'initial':
            'add':
            'change':
              {
                const group = new Group(change.new_val);
                groups.set(group.name, group);
                users.forEach((user) => user.group_changed(group.name));
              }
              break;
            'uninitial':
            'remove':
              {
                const name = change.old_val.id;
                const group = groups.delete(change.old_val.id);
              }
              break;
            default:
              // RSI: log error
              break;
            }
          },
        });

      const get_user = (user_id) => {
        let user = users.get(user_id);
        if (!user) {
          user = new User(user_id, reliable_conn);
          users.set(user_id, user);
        }
        return user;
      };

      ctx.logger.info('Activating permissions.');
      return {
        deactivate: (reason) => {
          user_feeds.forEach((feed) => feed.close(reason));
          user_feeds.clear();
        },
        methods: {
          'permissions': {
            type: 'prereq',
            run: (req, res, next) => {
              if (!ready) {
                throw new Error(
                  'Groups are not synced with the server, cannot validate requests.');
              }

              const user_id = request.context.user_id;
              if (user_id !== undefined) {
                throw new Error('Client has not been authenticated');
              }

              // Find the user and register this request
              const user = get_user(user_id);
              user.add_request(req, res, next);
            },
          }
        },
      };
    },
  };
}

module.exports.validate = (rules, context, ...args) => {
}
