const fs = require('fs');
const machina = require('machina');

function createAuthHeader(config) {
    const basicAuth = new Buffer(`${config.username}:${config.password}`).toString('base64');
    return `Basic ${basicAuth}`;
}

function loadCertificate(config) {
    const certificatePath = config.certificatePath[0] === '.' ? `${__dirname}/../../${config.certificatePath}` : config.certificatePath;
    try {
        cert = fs.readFileSync(certificatePath);
    }
    catch(ex) {
        logging.logError(`Failed to load Icinga2 certificate (${certificatePath}): ${ex}`);
    }

    return cert;
}

module.exports = function(app, config) {
    const logging = app.logging.forModule('Icinga2 Client');
    const icingaUrl = `https://${config.host}:${config.port}`;
    let cert;

    if(config.certificatePath) {
        cert = loadCertificate(config);
    }

    const baseRequest = {
        ca: cert,
        headers: {
            'Accept': 'application/json',
            'Authorization': createAuthHeader(config)
        }
    };

    const eventStream = new require('./event-stream')(app, {
        baseRequest: baseRequest,
        queue: config.queue,
        types: config.types,
        baseUrl: icingaUrl
    });

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
                    eventStream.connect();
                },
                'connection-lost': 'waitingToRetry'
            }
        }
    });

    return {
        start: () => eventStream.start()
            .then(() => new Promise(resolve => {
                app.events.on('icinga-event-stream-lost', () => connection.handle("connection-lost"));

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
