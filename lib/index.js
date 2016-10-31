const core = require('./core');
const _ = require('lodash');

const handlers = {
    "amqp-hubot-slack": config => ({
        module: 'amqp-publisher',
        name: config.name,
        host: config.amqp.host,
        exchange: config.amqp.exchange,
        transform: new require('./transform-to-hubot-slack')({
            slackProject: config.slackProject
        }),
        append: {
            channels: config.channels
        }
    })
};

module.exports = function() {
    function start() {
        return new Promise(resolve => resolve(core.logging.logInfo('Starting Icinga2 To...')));
    }

    return {
        start: () => start()
            .then(() => core.logging.setLogger(require('./logger')))
            .then(() => core.config.setDefault({
                "http-server": {
                    "port": 1234
                }
            }))
            .then(() => core.use('rs-http-server', 'rs-amqp-publisher'))
            .then(() => core.use('icinga-event-stream', require('./icinga2')))
            .then(() => core.use('downtime-monitor', require('./downtime-monitor')))
            .then(() => core.use('event-router', require('./event-router')))
            .then(() => core.config.setMapToModules(config => new Promise(resolve => {
                const publishers = Object.keys(config.publishers).reduce((publishers, publisherName) => {
                    const publisher = config.publishers[publisherName];

                    if (!handlers[publisher.handler]) {
                        core.logging.logInfo('Handler could not be found', {
                            handler: publisher.handler
                        });
                    }

                    publisher.name = publisherName;
                    const publisherModuleConfig = handlers[publisher.handler](publisher);

                    publishers[publisherName] = publisherModuleConfig;

                    return publishers;
                }, {});

                resolve(Object.keys(publishers).reduce((modules, publisherName) => {
                    const publisher = publishers[publisherName];

                    if (!modules[publisher.module]) {
                        modules[publisher.module] = [];
                    }

                    modules[publisher.module].push(publisher);

                    return modules;
                }, {
                    'http-server': [{
                        module: 'http-server',
                        port: config['http-server'].port
                    }],
                    'icinga-event-stream': [_.merge({
                        module: 'icinga-event-stream'
                    }, config.icinga)],
                    'downtime-monitor': [{
                        module: 'downtime-monitor'
                    }],
                    'event-router': [{
                        module: 'event-router',
                        events: Object.keys(config.subscriptions).reduce((events, eventName) => {
                            const subscription = config.subscriptions[eventName];

                            return [...events, ...subscription.map(current => {
                                const publisher = publishers[current.publisher];

                                if (!publisher) {
                                    core.logging.logInfo('Event publisher not found.', {
                                        event: eventName,
                                        publisher: current.publisher
                                    });
                                }

                                const append = Object.keys(current).reduce((append, key) => {
                                    if (['publisher'].includes(key) || !current[key]) {
                                        return append;
                                    }

                                    if (append[key] && append[key].forEach) {
                                        core.logging.logDebug('Merging event append array with publisher', {
                                            event: eventName,
                                            publisher: current.publisher,
                                            key: key,
                                            publisherObject: JSON.stringify(append[key]),
                                            eventObject: JSON.stringify(current[key])
                                        });

                                        append[key] = _.uniq([...append[key], ...current[key]]);
                                    } else {
                                        append[key] = current[key];
                                    }

                                    return append;
                                }, (JSON.parse(JSON.stringify(publisher.append)) || {}));

                                core.logging.logInfo('Event publisher configured', {
                                    event: eventName,
                                    publisher: current.publisher,
                                    append: JSON.stringify(append)
                                });

                                return {
                                    type: eventName,
                                    sendTo: current.publisher,
                                    append: append
                                };
                            })];
                        }, [])
                    }]
                }));
            })))
            .then(() => core.start())
            .then(() => new Promise(resolve => resolve(core.logging.logInfo('Start up completed'))))
            .catch(err => core.logging.logError('Start up failed', {
                error: err
            }))
    };
};
