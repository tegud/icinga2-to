const request = require('request');

module.exports = function(app, config) {
    const logging = app.logging.forModule('Icinga2 Ping');
    function statusPing() {
        return new Promise((resolve, reject) => {
            const data = [];

            const req = request.get(`${config.baseUrl}/v1/status`, config.baseRequest);

            req.on('response', () => {
                logging.logInfo('Status Response!');
            });

            req.on('data', chunk => {
                data.push(chunk);
            });

            req.on('end', () => {
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

    return {
        start: () => {},
        statusPing: () => statusPing(),
        stop: () => {}
    };
};
