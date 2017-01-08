const request = require('request');

function parseData(data) {
    if(!data) {
        return Promise.reject(new Error('No Icinga Ping response to parse'));
    }

    try {
        return Promise.resolve(JSON.parse(data));
    }
    catch(e) {
        return Promise.reject(new Error('Icinga ping returned invalid JSON.'));
    }
}

function checkResponse(response) {
    if(response.results && response.results.length) {
        const sqlStatus = response.results.filter(result => result.name === 'IdoMysqlConnection' && result.status && result.status.idomysqlconnection && result.status.idomysqlconnection['ido-mysql'])
        if (sqlStatus.length && sqlStatus[0].status.idomysqlconnection['ido-mysql'].connected === false){
            return Promise.reject(new Error('Icinga 2 MySQL Disconnected'));
        }
    }

    return Promise.resolve();
}

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

                return parseData(data.join(''))
                    .then(response => checkResponse(response))
                    .then(() => resolve())
                    .catch(err => reject(err));
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
