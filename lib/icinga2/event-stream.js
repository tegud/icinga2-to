const request = require('request');
const JsonParser = require('jsonparse');

const statuses = ['OK', 'WARNING', 'CRITICAL', 'UNKNOWN'];
const statusTypes = ['SOFT', 'HARD'];

function parseStatusChange(statusChange) {
    const baseObject = {
        host: {
            name: statusChange.host
        },
        service: {
            name: statusChange.service
        },
        state: {
            status: statuses[statusChange.state],
            statusType: statusTypes[statusChange.state_type],
            attempt: statusChange.check_result.vars_after.attempt
        },
        output: statusChange.check_result.output
    };

    if(statusChange.check_result.vars_before) {
        baseObject.previousState = {
            status: statuses[statusChange.check_result.vars_before.state],
            statusType: statusTypes[statusChange.check_result.vars_before.state_type],
            attempt: statusChange.check_result.vars_before.attempt
        };
    }

    return baseObject;
}

module.exports = function(app, config) {
    const logging = app.logging.forModule(`Icinga Event Stream:${config.queue}`);
    const parser = new JsonParser();
    let connected;
    let connecting;

    const types = (config.types || ['StateChange']).map(type => `types=${type}`).join('&');

    function connect() {
        if(connected || connecting) {
            return;
        }

        const url = `${config.baseUrl}/v1/events?${types}&queue=${config.queue}`;
        logging.logInfo('Connecting to Icinga2', { url: url });
        connecting = true;

        const req = request.post(url, config.baseRequest);

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

                app.events.emit(`icinga-event-received`, {
                    type: config.event,
                    data: parseStatusChange(value)
                });
            };

            resolve();
        }),
        connect: () => connect(),
        stop: () => {}
    };
};
