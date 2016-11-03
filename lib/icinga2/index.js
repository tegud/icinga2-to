const machina = require('machina');
const _ = require('lodash');

module.exports = function(app, config) {
    const logging = app.logging.forModule('Icinga2 Client');
    const icingaUrl = `https://${config.host}:${config.port}`;
    const baseRequest = require('./base-request')(config);

    const eventStreams = config.streams.map(streamConfig => {
        logging.logInfo('Configuring event stream', streamConfig);
        return new require('./event-stream')(app, _.merge({
            baseRequest: baseRequest,
            baseUrl: icingaUrl
        }, streamConfig));
    });

    const eventStreamConfigLookup = config.streams.reduce((eventStreamLookup, stream) => {
        eventStreamLookup[stream.event] = stream;
        return eventStreamLookup;
    }, {});

    const enrichers = {
        "icinga-api": new require('./api-call')(app, {
            baseRequest: baseRequest,
            baseUrl: icingaUrl
        })
    };

    const statusPing = new require('./ping')(app, {
        baseRequest: baseRequest,
        baseUrl: icingaUrl
    });

    const connection = new machina.Fsm({
        'initialState': 'disconnected',
        'states': {
            'disconnected': {
                'connect': 'verifying'
            },
            'verifying': {
                _onEnter: function() {
                    logging.logInfo('Checking Icinga2 Connection with ping.');
                    statusPing.statusPing()
                        .then(() => this.handle('verified'),
                            err => {
                                logging.logError('Lost contact with Icinga', { error: JSON.stringify(err)});
                                app.events.emit('update-status', {
                                    name: 'icinga-event-stream',
                                    module: 'icinga-event-stream',
                                    status: 'critical',
                                    url: icingaUrl,
                                    message: err
                                });
                                this.handle('connection-failed');
                            });
                },
                'verified': 'verified',
                'connection-failed': 'waitingToRetry'
            },
            'waitingToRetry': {
                _onEnter: function() {
                    logging.logInfo('Retrying connection in 1500ms');
                    setTimeout(() => this.handle("try-again"), 1500);
                },
                'try-again': 'verifying'
            },
            'verified': {
                _onEnter: function() {
                    logging.logInfo('Connection verified');
                    eventStreams.map(eventStream => eventStream.connect());
                },
                'connection-lost': 'waitingToRetry'
            }
        }
    });

    return {
        start: () => Promise.all([
                ...eventStreams.map(eventStream => eventStream.start()),
                ...Object.keys(enrichers).reduce((allEnrichers, current) => {
                    allEnrichers.push(enrichers[current]);
                    return allEnrichers;
                }, [])
            ])
            .then(() => new Promise(resolve => {
                app.events.on('icinga-event-stream-lost', () => connection.handle("connection-lost"));

                app.events.on('icinga-event-received', event => {
                    const eventType = event.type;
                    const streamConfig = eventStreamConfigLookup[eventType];

                    if(!streamConfig) {
                        logging.logInfo(`Couldn't find stream config: ${eventType}`);
                        return app.events.emit(eventType, event);
                    }

                    const enrichWith = streamConfig.enrichWith;

                    if(!enrichWith) {
                        return app.events.emit(eventType, event);
                    }

                    logging.logInfo(`Applying Event Enrinchiments`, { enrichWith: JSON.stringify(enrichWith) });

                    enrichers[enrichWith[0]].enrich(event).then(event => app.events.emit(eventType, event));
                });

                app.events.emit('register-status', {
                    name: 'icinga-event-stream',
                    module: 'icinga-event-stream',
                    status: 'initialising',
                    url: icingaUrl
                });

                connection.handle("connect");

                resolve();
            }))
    };
}
