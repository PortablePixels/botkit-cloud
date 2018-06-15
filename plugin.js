var debug = require('debug')('botkit:remote_triggers');
var md5 = require('md5');
var request = require('request');
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
                                handler(convo, function(err) {
                                    next(err);
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
            afterScript: [function(convo, next) {
              if (!botkit.config.stats_optout) {
                var data = {
                    user: md5(convo.context.user),
                    channel: md5(convo.context.channel),
                    command: convo.script.command,
                    conversation_length: convo.lastActive - convo.startTime,
                    status: convo.status,
                    type: 'remote_command_end',
                    final_thread: convo.state.thread,
                    bot_type: convo.bot.type,
                };
                statsAPI(convo.bot, {
                    method: 'post',
                    form: data,
                });
              }
              next();
            }],
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




        function statsAPI(bot, options, message) {
            var _STUDIO_STATS_API = botkit.config.studio_stats_uri || 'https://stats.botkit.ai';
            options.uri = _STUDIO_STATS_API + '/api/v1/stats';

            return new Promise(function(resolve, reject) {

                var headers = {
                    'content-type': 'application/json',
                };

                if (bot.config && bot.config.studio_token) {
                    options.uri = options.uri + '?access_token=' + bot.config.studio_token;
                } else if (botkit.config && botkit.config.studio_token) {
                    options.uri = options.uri + '?access_token=' + botkit.config.studio_token;
                } else {
                    // do nothing - making an unathenticated request to the stats api...
                }

                options.headers = headers;

                var stats_body = {};
                stats_body.botHash = botHash(bot);
                if (bot.type == 'slack' && bot.team_info) {
                    stats_body.team = md5(bot.team_info.id);
                }

                if (bot.type == 'ciscospark' && message && message.raw_message && message.raw_message.orgId) {
                    stats_body.team = md5(message.raw_message.orgId);
                }

                if (bot.type == 'teams' && bot.config.team) {
                    stats_body.team = md5(bot.config.team);
                }

                stats_body.channel = options.form.channel;
                stats_body.user = options.form.user;
                stats_body.type = options.form.type;
                stats_body.meta = {};
                stats_body.meta.user = options.form.user;
                stats_body.meta.channel = options.form.channel;
                if (options.form.final_thread) {
                    stats_body.meta.final_thread = options.form.final_thread;
                }
                stats_body.meta.conversation_length = options.form.conversation_length;
                stats_body.meta.status = options.form.status;
                stats_body.meta.type = options.form.type;
                stats_body.meta.command = options.form.command;
                options.form = stats_body;
                request(options, function(err, res, body) {
                    if (err) {
                        return reject(err);
                    }

                    var json = null;

                    try {
                        json = JSON.parse(body);
                    } catch (e) {}

                    if (!json || json == null) {
                        return reject('Response from Botkit Studio API was empty or invalid JSON');
                    } else if (json.error) {
                        if (res.statusCode === 401) {
                            console.error(json.error);
                        }
                        return reject(json.error);
                    } else {
                        resolve(json);
                    }
                });
            });
        }

        /* generate an anonymous hash to uniquely identify this bot instance */
        function botHash(bot) {
            var x = '';
            switch (bot.type) {
                case 'slack':
                    if (bot.config.token) {
                        x = md5(bot.config.token);
                    } else {
                        x = 'non-rtm-bot';
                    }
                break;
                case 'teams':
                    x = md5(bot.identity.id);
                break;
                case 'fb':
                    x = md5(bot.botkit.config.access_token);
                break;
                case 'twilioipm':
                    x = md5(bot.config.TWILIO_IPM_SERVICE_SID);
                break;
                case 'twiliosms':
                    x = md5(bot.botkit.config.account_sid);
                break;
                case 'ciscospark':
                    x = md5(bot.botkit.config.ciscospark_access_token);
                break;
                default:
                    x = 'unknown-bot-type';
                break;
            }
            return x;
        };


        /* Every time a bot spawns, Botkit calls home to identify this unique bot
         * so that the maintainers of Botkit can measure the size of the installed
         * userbase of Botkit-powered bots. */




}
