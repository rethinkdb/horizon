how to run:

1. run npm install -g yo generator-horizon-rulecreator form any directory
2. in the desired directory run : yo horizon-rulecreator

This generator helps users create schema files that the user can then implement.

Horizon’s permission system is based on a query whitelist. Any operation on a Horizon collection is disallowed
by default, unless there is a rule that allows the operation.

A whitelist rule has three properties that define which operations it covers:

 1. A user group
 2. A query template describing the type of operation
 3. An optional validator function written in JavaScript that can be used to check the contents of the 
    accessed documents, or to implement more complex permission checks

You can use the special "default" group to create rules that apply to all users, authenticated or not. Or use
the "authenticated" group to cover authenticated users only.

```
[groups.GROUP_NAME.rules.RULE_NAME]
template = "QUERY_TEMPLATE"
# Optional:
validator = "VALIDATOR_FUNCTION"
```
