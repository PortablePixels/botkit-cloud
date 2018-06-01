var debug = require('debug')('botkit:remote_triggers');
var handlers = {}

module.exports = function(botkit) {
    return {
        name: 'Botkit Cloud Services Client',
        init: function() {

            // set up handlers for legacy botkit.studio.* hooks
            botkit.studio = {
                run: function(bot, script_name, user, channel, input_message) {
                    return new Promise(function(resolve, reject) {
                        botkit.api.getScript(script_name, user).then(function(script) {
                            var state = {
                                cursor: 0,
                                turn: 0,
                                thread: 'default',
                                vars: {
                                    user: {}
                                }
                            }
                            var convo = botkit.createConversation(input_message, bot, state, script);
                            convo.setUser(user);
                            convo.setChannel(channel);
                            convo.fulfill();
                            resolve(convo);
                        }).catch(reject);
                    });

                },
                get: function(bot, script_name, user, channel, input_message) {
                    return new Promise(function(resolve, reject) {
                        botkit.api.getScript(script_name, user).then(function(script) {
                            var state = {
                                cursor: 0,
                                turn: 0,
                                thread: 'default',
                                vars: {
                                    user: {}
                                }
                            }
                            var convo = botkit.createConversation(input_message, bot, state, script);
                            convo.setUser(user);
                            convo.setChannel(channel);
                            resolve(convo);
                        }).catch(reject);
                    });

                },
                before: function(script_name, handler) {
                    botkit.middleware.beforeScript.use(function(convo, next) {
                        if (convo.script.command == script_name) {
                            try {
                                handler(convo, function() {
                                    next();
                                });
                            } catch (err) {
                                next(err);
                            }
                        } else {
                            next();
                        }
                    });
                },
                after: function(script_name, handler) {
                    botkit.middleware.afterScript.use(function(convo, next) {
                        if (convo.script.command == script_name) {
                            try {
                                handler(convo, function() {
                                    next();
                                });
                            } catch (err) {
                                next(err);
                            }
                        } else {
                            next();
                        }
                    });
                },
                validate: function(script_name, var_name, handler) {
                    botkit.middleware.onChange.use(function(convo, key, val, next) {
                        if (convo.script.command == script_name && key == var_name) {
                            try {
                                handler(convo, function() {
                                    next();
                                });
                            } catch (err) {
                                next(err);
                            }
                        } else {
                            next();
                        }
                    });
                },
                beforeThread: function(script_name, thread_name, handler) {
                    botkit.middleware.beforeThread.use(function(convo, new_thread, next) {
                        if (convo.script.command == script_name && thread_name == new_thread) {
                            try {
                                handler(convo, function() {
                                    next();
                                });
                            } catch (err) {
                                next(err);
                            }
                        } else {
                            next();
                        }
                    });
                }
            }

        },
        middleware: {
            understand: [
                function(bot, message, response, next) {
                    // pass it through the ol' Botkit Studio trigger API

                    debug('EVALUATE', message);
                    // already handled
                    if (response.script) {
                        debug('skipping api call');
                        return next();
                    }

                    botkit.api.evaluateTrigger(message.text, message.user).then(function(script) {

                        response.state = {
                            thread: 'default',
                            turn: 0,
                            cursor: 0,
                            vars: {
                                user: {},
                            },
                        };
                        response.script = script;

                        next();

                    }).catch(next);

                }
            ]
        }
    }
}
