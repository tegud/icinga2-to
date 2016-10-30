const request = require('request');
const fs = require('fs');
const JsonParser = require('jsonparse');

module.exports = function(app, config) {
    const parser = new JsonParser();
    const logging = app.logging.forModule('Icinga Event Stream');
    let connected;
    let connecting;

    const basicAuth = new Buffer(`${config.username}:${config.password}`).toString('base64');
    const auth = `Basic ${basicAuth}`;
    const icingaUrl = `https://${config.host}:${config.port}`
    let cert;
    let certError;

    if(config.certificatePath) {
        const certificatePath = config.certificatePath[0] === '.' ? `${__dirname}/../${config.certificatePath}` : config.certificatePath;
        try {
            cert = fs.readFileSync(certificatePath);
        }
        catch(ex) {
            logging.logError(`Failed to load Icinga2 certificate (${certificatePath}): ${ex}`);
            certError = ex;
        }
    }

    const types = (config.types || ['StateChange']).map(type => `types=${type}`).join('&');

    function attemptConnection() {
        statusPing()
            .then(connect)
            .catch(err => {
                app.events.emit('update-status', {
                    name: 'icinga-event-stream',
                    module: 'icinga-event-stream',
                    status: 'critical',
                    url: icingaUrl,
                    message: err
                });
                retryConnect();
            })
    }

    function retryConnect() {
        logging.logInfo('Retrying connection in 1500ms');
        setTimeout(attemptConnection, 1500);
    }

    function statusPing() {
        return new Promise((resolve, reject) => {
            const data = [];

            const req = request.get(`${icingaUrl}/v1/status`, {
                ca: cert,
                headers: {
                    'Accept': 'application/json',
                    'Authorization': auth
                }
            });

            req.on('response', resp => {
                logging.logInfo('Status Response!');
            });

            req.on('data', chunk => {
                data.push(chunk);
            });

            req.on('end', resp => {
                logging.logInfo('Status Check Complete');

                // TODO: Parse response and check IcingaApplication SQL DB Connection is connected.

                resolve();
            });

            req.on('error', err => {
                logging.logInfo('Status Check Failed!', { error: err });
                reject(err);
            });
        });
    }

    const statuses = ['OK', 'WARNING', 'CRITICAL', 'UNKNOWN'];
    const statusTypes = ['SOFT', 'HARD'];

    function parseStatusChange(statusChange) {
        return {
            host: statusChange.host,
            service: statusChange.service,
            state: {
                status: statuses[statusChange.state],
                statusType: statusTypes[statusChange.state_type],
                attempt: statusChange.check_result.vars_after.attempt
            },
            previousState: {
                status: statuses[statusChange.check_result.vars_before.state],
                statusType: statusTypes[statusChange.check_result.vars_before.state_type],
                attempt: statusChange.check_result.vars_before.attempt
            },
            output: statusChange.check_result.output
        };
    }

    function connect() {
        if(connected || connecting) {
            return;
        }

        logging.logInfo('Connecting to Icinga2');
        connecting = true;

        const req = request.post(`${icingaUrl}/v1/events?${types}&queue=${config.queue}`, {
            ca: cert,
            headers: {
                'Accept': 'application/json',
                'Authorization': auth
            }
        });

        req.on('response', () => {
            connecting = false;
            connected = true;

            logging.logInfo('Connected to Icinga2');
        });

        req.on('data', chunk => {
            logging.logDebug('Data in', { data: chunk });
            parser.write(chunk);
        });

        req.on('end', () => {
            connected = false;
            connecting = false;
            logging.logInfo('Connection closed');
            retryConnect();
        });

        req.on('error', err => {
            logging.logError('Failed to connect to Icinga2', { error: JSON.stringify(err) });
            connecting = false;
            connected = false;
            retryConnect();
        });

        app.events.emit('update-status', {
            name: 'icinga-event-stream',
            module: 'icinga-event-stream',
            status: 'ok'
        });
    }

    return {
        start: () => new Promise(resolve => {
            parser.onValue = function(value) {
                if (this.stack.length !== 0) {
                    return;
                }

                logging.logDebug(JSON.stringify(value, null, 4));

                app.events.emit('status-change', {
                    type: 'status-change',
                    data: parseStatusChange(value)
                });
            };

            app.events.emit('register-status', {
                name: 'icinga-event-stream',
                module: 'icinga-event-stream',
                status: 'initialising',
                url: icingaUrl
            });

            attemptConnection();

            resolve();
        })
    };
}
