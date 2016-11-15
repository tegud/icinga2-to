const request = require('request');

function parseJsonResponse(response) {
    try {
        return JSON.parse(response);
    }
    catch(e) {
        return;
    }
}

function extendEventWithApiResponse(event, apiResponse) {
    event.data.host.groups = apiResponse.joins.host.groups;
    event.data.service.groups = apiResponse.attrs.groups;

    return event;
}

module.exports = function(app, config) {
    const logging = app.logging.forModule('Icinga2 Service Details');
    return {
        start: () => new Promise(resolve => {
            resolve();
        }),
        enrich: message => new Promise(resolve => {
            const data = [];

            if(!message.data.host || !message.data.service) {
                logging.logInfo('Missing service or host', { host: message.data.host ? message.data.host.name : '', service: message.data.service ? message.data.service.name : '' });
                return resolve(message);
            }

            const filter = `host.name=="${message.data.host.name}" %26%26 service.name=="${message.data.service.name}"`;
            const url = `${config.baseUrl}/v1/objects/services?joins=host&filter=${filter}`;

            logging.logInfo('Getting Service details', { host: message.data.host.name, service: message.data.service.name, url: url });

            const req = request.get(url, config.baseRequest);

            req.on('response', () => logging.logDebug('Status Check Response', { host: message.data.host.name, service: message.data.service.name, url: url }));

            req.on('data', chunk => data.push(chunk));

            req.on('end', () => {
                logging.logDebug('Status Check Complete', { host: message.data.host.name, service: message.data.service.name, url: url });

                const fullResponse = data.join('');
                const parsedResponse = parseJsonResponse(fullResponse);

                if(!parsedResponse) {
                    logging.logError('Error parsing Icinga API response');
                    logging.logDebug('Icinga2 API Response', { fullResponse: fullResponse })
                    return resolve(message);
                }

                if(!parsedResponse.results || !parsedResponse.results.length) {
                    logging.logInfo('Icinga API returned no results', { host: message.data.host.name, service: message.data.service.name, url: url });
                    return resolve(message);
                }

                resolve(extendEventWithApiResponse(message, parsedResponse.results[0]));
            });

            req.on('error', err => {
                logging.logError('Status Check Failed!', { host: message.data.host.name, service: message.data.service.name, error: err });
                reject(err);
            });
        })
    }
};
