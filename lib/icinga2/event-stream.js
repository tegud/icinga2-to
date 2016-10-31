const request = require('request');
const JsonParser = require('jsonparse');

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

module.exports = function(app, config) {
    const logging = app.logging.forModule(`Icinga Event Stream:${config.queue}`);
    const parser = new JsonParser();
    let connected;
    let connecting;

    const types = (config.types || ['StateChange']).map(type => `types=${type}`).join('&');
    const filter = config.filter ? `&filter=${config.filter}` : '';

    function connect() {
        if(connected || connecting) {
            return;
        }

        logging.logInfo('Connecting to Icinga2');
        connecting = true;

        const req = request.post(`${config.baseUrl}/v1/events?${types}${filter}&queue=${config.queue}`, config.baseRequest);

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
            app.events.emit('icinga-event-stream-lost');
        });

        req.on('error', err => {
            logging.logError('Failed to connect to Icinga2', { error: JSON.stringify(err) });
            connecting = false;
            connected = false;
            app.events.emit('icinga-event-stream-lost');
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

                app.events.emit(config.eventName, {
                    type: config.eventName,
                    data: parseStatusChange(value)
                });
            };

            resolve();
        }),
        connect: () => connect(),
        stop: () => {}
    };
};
